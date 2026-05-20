/**
 * Drone flight physics — a 6-DOF quadcopter model with proper acro/rate and
 * angle/stabilized modes. Inspired by Liftoff / TinyHawk FPV trainers.
 *
 *  • Stick → pitch/roll/yaw rate (acro) OR pitch/roll angle (angle mode)
 *  • Throttle → total thrust along the body-up vector
 *  • World forces: rotated thrust + gravity + quadratic drag
 *  • Floor & ceiling clamping with a soft bounce
 *  • Fixed 1/240 s sub-stepping like the robot physics
 */

export interface DroneConfig {
  /** Drone mass including battery (kg) */
  mass: number;
  /** Total peak thrust from all four motors (N) — TWR = maxThrust / (m·g) */
  maxThrust: number;
  /** Rate-mode max angular rates (rad/s) */
  maxRollRate: number;
  maxPitchRate: number;
  maxYawRate: number;
  /** Quadratic drag coefficient (lumps body drag + induced) */
  dragCoef: number;
  /** True = stabilised (stick sets angle, returns level); False = acro/rate */
  angleMode: boolean;
  /** Max tilt in angle mode (rad) */
  maxAngle: number;
  /** Throttle response time-constant (s) */
  thrustTau: number;
}

export const DRONE_PRESETS: Record<string, DroneConfig> = {
  // 5-inch FPV race quad, ~500 g, 6S, ~10 kgf total thrust, TWR ~20
  race: {
    mass: 0.5,
    maxThrust: 100,
    maxRollRate: 8,
    maxPitchRate: 8,
    maxYawRate: 4.5,
    dragCoef: 0.18,
    angleMode: false,
    maxAngle: Math.PI / 3,
    thrustTau: 0.06,
  },
  // Cinematic / training: gentler, self-levelling
  cinematic: {
    mass: 0.9,
    maxThrust: 30,
    maxRollRate: 2.5,
    maxPitchRate: 2.5,
    maxYawRate: 1.6,
    dragCoef: 0.35,
    angleMode: true,
    maxAngle: Math.PI / 4,
    thrustTau: 0.18,
  },
  // Beginner / tinywhoop indoors
  tiny: {
    mass: 0.04,
    maxThrust: 1.2,
    maxRollRate: 4,
    maxPitchRate: 4,
    maxYawRate: 3,
    dragCoef: 1.1,
    angleMode: true,
    maxAngle: Math.PI / 5,
    thrustTau: 0.08,
  },
};

export interface DroneState {
  /** Position (m), world frame. Y is up. */
  x: number; y: number; z: number;
  /** Velocity (m/s), world frame. */
  vx: number; vy: number; vz: number;
  /** Attitude (rad) — yaw about Y, pitch about X, roll about Z, intrinsic */
  yaw: number;
  pitch: number;
  roll: number;
  /** Body angular rates (rad/s) */
  omegaYaw: number;
  omegaPitch: number;
  omegaRoll: number;
  /** Smoothed thrust 0..1 */
  thrust: number;
  /** Cosmetic/dynamics: peak speed for HUD */
  speed: number;
  /** When true the drone responds to inputs; false = motors cut */
  armed: boolean;
  /** True for one frame when the drone smacked the floor */
  crashed: boolean;
}

export function makeDroneState(x = 0, y = 1.2, z = 0): DroneState {
  return {
    x, y, z,
    vx: 0, vy: 0, vz: 0,
    yaw: 0, pitch: 0, roll: 0,
    omegaYaw: 0, omegaPitch: 0, omegaRoll: 0,
    thrust: 0,
    speed: 0,
    armed: false,
    crashed: false,
  };
}

export interface DroneInput {
  /** 0..1, 0=cut, 1=full power */
  throttle: number;
  /** -1..1, +=nose-down (forward) */
  pitch: number;
  /** -1..1, +=right wing down (roll right) */
  roll: number;
  /** -1..1, +=clockwise from above */
  yaw: number;
  /** Toggle requested this frame (arm/disarm) */
  armToggle: boolean;
}

const FIXED_DT = 1 / 240;
const GRAVITY = 9.81;

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

export function stepDrone(
  s: DroneState,
  cfg: DroneConfig,
  input: DroneInput,
  frameDt: number,
): DroneState {
  s.crashed = false;
  let rem = Math.min(frameDt, 0.1);
  while (rem > 1e-5) {
    const dt = Math.min(FIXED_DT, rem);
    rem -= dt;
    droneSubstep(s, cfg, input, dt);
  }
  s.speed = Math.hypot(s.vx, s.vy, s.vz);
  return s;
}

function droneSubstep(
  s: DroneState,
  cfg: DroneConfig,
  input: DroneInput,
  dt: number,
) {
  // Disarmed: cut motors, let gravity finish the job
  const armed = s.armed && !s.crashed;
  const throttleCmd = armed ? clamp(input.throttle, 0, 1) : 0;

  // First-order thrust lag (motors don't snap to commanded power)
  const a = clamp(dt / cfg.thrustTau, 0, 1);
  s.thrust += (throttleCmd - s.thrust) * a;

  // ───── angular rates ─────
  if (armed) {
    if (cfg.angleMode) {
      // Stick → desired tilt; PD controller back to that angle.
      const tgtPitch = clamp(input.pitch, -1, 1) * cfg.maxAngle;
      const tgtRoll = clamp(input.roll, -1, 1) * cfg.maxAngle;
      const kp = 9, kd = 2.5;
      s.omegaPitch = kp * (tgtPitch - s.pitch) - kd * s.omegaPitch;
      s.omegaRoll = kp * (tgtRoll - s.roll) - kd * s.omegaRoll;
    } else {
      // Acro / rate: stick directly commands angular rate.
      s.omegaPitch = clamp(input.pitch, -1, 1) * cfg.maxPitchRate;
      s.omegaRoll = clamp(input.roll, -1, 1) * cfg.maxRollRate;
    }
    s.omegaYaw = clamp(input.yaw, -1, 1) * cfg.maxYawRate;
  } else {
    // Disarmed: damp out residual rotation
    s.omegaPitch *= 0.92;
    s.omegaRoll *= 0.92;
    s.omegaYaw *= 0.92;
  }

  // Integrate attitude
  s.pitch += s.omegaPitch * dt;
  s.roll += s.omegaRoll * dt;
  s.yaw += s.omegaYaw * dt;
  if (s.yaw > Math.PI) s.yaw -= 2 * Math.PI;
  if (s.yaw < -Math.PI) s.yaw += 2 * Math.PI;
  // Soft tilt limits so we never invert the world basis
  s.pitch = clamp(s.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
  s.roll = clamp(s.roll, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);

  // ───── thrust → world force ─────
  // Body-up vector after yaw·pitch·roll (intrinsic, Y-up convention)
  const cy = Math.cos(s.yaw),  sy = Math.sin(s.yaw);
  const cp = Math.cos(s.pitch), sp = Math.sin(s.pitch);
  const cr = Math.cos(s.roll),  sr = Math.sin(s.roll);

  // Local body-up = (sin roll · cos pitch, cos roll · cos pitch, sin pitch)
  // Then yaw rotation around Y mixes X and Z.
  const bx = sr * cp;
  const by = cr * cp;
  const bz = sp;
  const ux = bx * cy + bz * sy;
  const uy = by;
  const uz = -bx * sy + bz * cy;

  const T = s.thrust * cfg.maxThrust;
  const m = cfg.mass;

  // Quadratic drag opposing velocity
  const v = Math.hypot(s.vx, s.vy, s.vz);
  let dragX = 0, dragY = 0, dragZ = 0;
  if (v > 1e-4) {
    const dragMag = cfg.dragCoef * v * v;
    dragX = -(s.vx / v) * dragMag;
    dragY = -(s.vy / v) * dragMag;
    dragZ = -(s.vz / v) * dragMag;
  }

  const ax = (T * ux + dragX) / m;
  const ay = (T * uy + dragY) / m - GRAVITY;
  const az = (T * uz + dragZ) / m;

  s.vx += ax * dt;
  s.vy += ay * dt;
  s.vz += az * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.z += s.vz * dt;

  // Floor (props would clip the ground at ~0.08 m)
  if (s.y < 0.08) {
    s.y = 0.08;
    if (s.vy < -3.5) {
      // Hard impact = crash, auto-disarm
      s.crashed = true;
      s.armed = false;
    }
    if (s.vy < 0) s.vy = -s.vy * 0.18;
    s.vx *= 0.78;
    s.vz *= 0.78;
  }
}

/** Confine the drone to a rectangular arena with a soft bounce. */
export function constrainDroneToArena(
  s: DroneState,
  halfX: number,
  halfZ: number,
  ceiling: number,
): void {
  if (s.x < -halfX) { s.x = -halfX; if (s.vx < 0) s.vx *= -0.3; }
  else if (s.x > halfX) { s.x = halfX; if (s.vx > 0) s.vx *= -0.3; }
  if (s.z < -halfZ) { s.z = -halfZ; if (s.vz < 0) s.vz *= -0.3; }
  else if (s.z > halfZ) { s.z = halfZ; if (s.vz > 0) s.vz *= -0.3; }
  if (s.y > ceiling) { s.y = ceiling; if (s.vy > 0) s.vy *= -0.3; }
}
