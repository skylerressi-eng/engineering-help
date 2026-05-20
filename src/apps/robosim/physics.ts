/**
 * RoboSim drivetrain physics — a genuinely physical model of an FRC-style
 * mecanum robot. Instead of moving a transform by a constant speed, we model:
 *
 *  • DC motor torque–speed curve (CIM/NEO-like) with battery voltage sag
 *  • Gearbox reduction + wheel radius → wheel surface force
 *  • Mecanum kinematics (45° rollers) for the 3 body DOF (vx, vy, ω)
 *  • Rigid-body dynamics with real mass + yaw moment of inertia
 *  • Traction limiting via a per-wheel friction circle (μ·N)
 *  • Rolling resistance, aero-ish quadratic drag, brake vs coast
 *  • Joystick slew-rate limiting so inputs ramp like a real driver's sticks
 *
 * Everything is integrated on a fixed timestep so behaviour is identical
 * regardless of render framerate.
 */

export interface DriveConfig {
  /** Robot mass including battery & bumpers (kg) */
  mass: number;
  /** Track width — left/right wheel separation (m) */
  trackWidth: number;
  /** Wheelbase — front/back wheel separation (m) */
  wheelBase: number;
  /** Wheel radius (m) */
  wheelRadius: number;
  /** Gearbox reduction (motor turns : wheel turns) */
  gearRatio: number;
  /** Motor free speed (RPM) at nominal voltage */
  motorFreeRpm: number;
  /** Motor stall torque (N·m) at nominal voltage */
  motorStallTorque: number;
  /** Motors per wheel */
  motorsPerWheel: number;
  /** Tyre–carpet friction coefficient */
  mu: number;
  /** Nominal battery voltage (V) */
  batteryNominal: number;
  /** Battery internal resistance (Ω) — causes voltage sag under load */
  batteryResistance: number;
  /** Joystick slew rate (full-scale units per second) */
  slewRate: number;
  /** true = motors brake when neutral, false = coast */
  brakeMode: boolean;
}

export const DRIVE_PRESETS: Record<string, DriveConfig> = {
  // ~120 lb competition robot, 4× CIM, 10.7:1, 6" wheels
  competition: {
    mass: 54,
    trackWidth: 0.58,
    wheelBase: 0.58,
    wheelRadius: 0.0762,
    gearRatio: 10.7,
    motorFreeRpm: 5330,
    motorStallTorque: 2.41,
    motorsPerWheel: 1,
    mu: 1.1,
    batteryNominal: 12.6,
    batteryResistance: 0.022,
    slewRate: 3.0,
    brakeMode: true,
  },
  // Light, fast "speedy" config — NEO-ish, taller gearing
  sprint: {
    mass: 38,
    trackWidth: 0.5,
    wheelBase: 0.5,
    wheelRadius: 0.0508,
    gearRatio: 6.0,
    motorFreeRpm: 5676,
    motorStallTorque: 2.6,
    motorsPerWheel: 1,
    mu: 0.95,
    batteryNominal: 12.6,
    batteryResistance: 0.022,
    slewRate: 5.0,
    brakeMode: false,
  },
  // Heavy pushing bot — geared down for torque, high traction
  tank: {
    mass: 68,
    trackWidth: 0.62,
    wheelBase: 0.62,
    wheelRadius: 0.0762,
    gearRatio: 16,
    motorFreeRpm: 5330,
    motorStallTorque: 2.41,
    motorsPerWheel: 2,
    mu: 1.25,
    batteryNominal: 12.6,
    batteryResistance: 0.02,
    slewRate: 2.0,
    brakeMode: true,
  },
  // FRC swerve — light & nimble, NEO 550-ish, low gear ratio
  swerve: {
    mass: 45,
    trackWidth: 0.55,
    wheelBase: 0.55,
    wheelRadius: 0.0508,
    gearRatio: 5.4,
    motorFreeRpm: 5820,
    motorStallTorque: 3.36,
    motorsPerWheel: 1,
    mu: 1.15,
    batteryNominal: 12.6,
    batteryResistance: 0.022,
    slewRate: 6.0,
    brakeMode: true,
  },
  // FTC 18×18" robot — REV HD Hex motors, Mecanum on goBilda chassis
  ftc: {
    mass: 12,
    trackWidth: 0.36,
    wheelBase: 0.36,
    wheelRadius: 0.048,
    gearRatio: 20,
    motorFreeRpm: 312,
    motorStallTorque: 0.49,
    motorsPerWheel: 1,
    mu: 1.0,
    batteryNominal: 12.0,
    batteryResistance: 0.04,
    slewRate: 4.0,
    brakeMode: true,
  },
  // VEX V5 — small classroom robot, 4× V5 smart motors
  vex: {
    mass: 6,
    trackWidth: 0.28,
    wheelBase: 0.28,
    wheelRadius: 0.0508,
    gearRatio: 1.0,
    motorFreeRpm: 200,
    motorStallTorque: 2.1,
    motorsPerWheel: 1,
    mu: 0.85,
    batteryNominal: 12.8,
    batteryResistance: 0.05,
    slewRate: 3.5,
    brakeMode: true,
  },
  // 1.5 kg mini-sumo bot — tiny, brutally low gear ratio, sticky tyres
  sumo: {
    mass: 1.5,
    trackWidth: 0.12,
    wheelBase: 0.10,
    wheelRadius: 0.022,
    gearRatio: 30,
    motorFreeRpm: 12000,
    motorStallTorque: 0.08,
    motorsPerWheel: 1,
    mu: 1.6,
    batteryNominal: 7.4,
    batteryResistance: 0.06,
    slewRate: 12.0,
    brakeMode: true,
  },
  // Hobby RC truck — fast, loose, brushless 540
  rc: {
    mass: 2.2,
    trackWidth: 0.22,
    wheelBase: 0.26,
    wheelRadius: 0.045,
    gearRatio: 3.5,
    motorFreeRpm: 14000,
    motorStallTorque: 0.45,
    motorsPerWheel: 1,
    mu: 0.7,
    batteryNominal: 11.1,
    batteryResistance: 0.03,
    slewRate: 8.0,
    brakeMode: false,
  },
};

/** Robot pose + velocities in the world frame. */
export interface RobotState {
  x: number; // m, field frame
  z: number; // m, field frame
  heading: number; // rad, 0 = +Z, CCW positive
  vx: number; // m/s, world
  vz: number; // m/s, world
  omega: number; // rad/s, yaw rate
  /** Smoothed (slew-limited) driver inputs, -1..1 */
  cmd: { drive: number; strafe: number; turn: number };
  /** Diagnostics for the HUD */
  wheelSlip: [number, number, number, number];
  wheelRpm: [number, number, number, number];
  motorCurrent: number; // A, total
  batteryVoltage: number; // V, sagged
  speed: number; // m/s, |v|
  tractionLimited: boolean;
}

export function makeRobotState(x = 0, z = 0, heading = 0): RobotState {
  return {
    x,
    z,
    heading,
    vx: 0,
    vz: 0,
    omega: 0,
    cmd: { drive: 0, strafe: 0, turn: 0 },
    wheelSlip: [0, 0, 0, 0],
    wheelRpm: [0, 0, 0, 0],
    motorCurrent: 0,
    batteryVoltage: 12.6,
    speed: 0,
    tractionLimited: false,
  };
}

export interface DriverInput {
  drive: number; // +forward, -reverse  (-1..1)
  strafe: number; // +right, -left      (-1..1)
  turn: number; // +CW, -CCW           (-1..1)
  /** field-oriented control: inputs are in the field frame, not robot frame */
  fieldOriented: boolean;
  /** scales max effort (precision/turbo), 0..1 */
  throttle: number;
}

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

function slew(current: number, target: number, rate: number, dt: number) {
  const maxStep = rate * dt;
  const d = target - current;
  if (d > maxStep) return current + maxStep;
  if (d < -maxStep) return current - maxStep;
  return target;
}

// Mecanum wheel positions (sign of x = right, sign of z = front).
// Roll axes are ±45°, giving the classic [drive ∓ strafe ∓ turn] mixing.
const WHEEL_SIGNS = [
  { sx: -1, sz: +1, kStrafe: -1, kTurn: -1 }, // front-left
  { sx: +1, sz: +1, kStrafe: +1, kTurn: +1 }, // front-right
  { sx: -1, sz: -1, kStrafe: +1, kTurn: -1 }, // back-left
  { sx: +1, sz: -1, kStrafe: -1, kTurn: +1 }, // back-right
] as const;

const FIXED_DT = 1 / 240; // physics substep

/**
 * Advance the robot by `frameDt` seconds (sub-stepped internally). Mutates and
 * returns `s`. `cfg` is the active drivetrain; `input` is the raw stick state.
 */
export function stepRobot(
  s: RobotState,
  cfg: DriveConfig,
  input: DriverInput,
  frameDt: number,
): RobotState {
  // Cap pathological frame gaps (tab switch) so we never explode.
  let remaining = Math.min(frameDt, 0.1);
  while (remaining > 1e-5) {
    const dt = Math.min(FIXED_DT, remaining);
    remaining -= dt;
    substep(s, cfg, input, dt);
  }
  s.speed = Math.hypot(s.vx, s.vz);
  return s;
}

function substep(
  s: RobotState,
  cfg: DriveConfig,
  input: DriverInput,
  dt: number,
) {
  // 1. Slew-limit the sticks (a real driver can't step a joystick instantly,
  //    and the drivetrain can't either — this is most of the "feel").
  s.cmd.drive = slew(s.cmd.drive, clamp(input.drive, -1, 1), cfg.slewRate, dt);
  s.cmd.strafe = slew(
    s.cmd.strafe,
    clamp(input.strafe, -1, 1),
    cfg.slewRate,
    dt,
  );
  s.cmd.turn = slew(s.cmd.turn, clamp(input.turn, -1, 1), cfg.slewRate, dt);

  const throttle = clamp(input.throttle, 0.05, 1);

  // 2. Convert world velocity → robot body frame (x=right, z=forward).
  const c = Math.cos(s.heading);
  const sn = Math.sin(s.heading);
  // body = R(-heading) * world
  const vBodyX = c * s.vx - sn * s.vz;
  const vBodyZ = sn * s.vx + c * s.vz;

  // 3. Field-oriented: rotate the driver's stick vector into the body frame.
  let cmdDrive = s.cmd.drive;
  let cmdStrafe = s.cmd.strafe;
  if (input.fieldOriented) {
    // stick is field-frame; express in body frame
    const fx = s.cmd.strafe; // field +x (right)
    const fz = s.cmd.drive; // field +z (forward)
    cmdStrafe = c * fx - sn * fz;
    cmdDrive = sn * fx + c * fz;
  }

  // 4. Geometry / motor constants.
  const r = cfg.wheelRadius;
  const G = cfg.gearRatio;
  const halfSum = (cfg.trackWidth + cfg.wheelBase) / 2; // mecanum lever arm
  const freeOmegaMotor = (cfg.motorFreeRpm * 2 * Math.PI) / 60;
  const nMotors = cfg.motorsPerWheel;

  // Battery sag: estimate total current from last substep, drop the voltage.
  const vBatt =
    cfg.batteryNominal - s.motorCurrent * cfg.batteryResistance;
  const vFrac = clamp(vBatt / cfg.batteryNominal, 0.3, 1);
  s.batteryVoltage = vBatt;

  // 5. Per-wheel: target surface speed from the mecanum mixing, actual surface
  //    speed from body motion, then a DC-motor torque from the speed error.
  let Fx = 0; // body-frame net force x (right)
  let Fz = 0; // body-frame net force z (forward)
  let Mz = 0; // yaw moment
  let totalCurrent = 0;
  let anyTractionLimited = false;

  const normalPerWheel = (cfg.mass * 9.81) / 4;
  const tractionMax = cfg.mu * normalPerWheel; // max |force| per wheel

  for (let i = 0; i < 4; i++) {
    const w = WHEEL_SIGNS[i];

    // Commanded normalised wheel effort from mecanum inverse kinematics.
    const cmd =
      cmdDrive + w.kStrafe * cmdStrafe + w.kTurn * s.cmd.turn;
    const cmdN = clamp(cmd, -1, 1) * throttle;

    // Actual wheel contact speed along its drive direction. A mecanum wheel
    // drives along the chassis x±z mix; project body velocity onto it.
    const wheelTangential =
      vBodyZ + w.kStrafe * vBodyX + w.kTurn * halfSum * s.omega;
    const wheelOmega = wheelTangential / r;
    const motorOmega = wheelOmega * G;

    // Target motor speed if this stick fully mapped to free speed.
    const targetMotorOmega = cmdN * freeOmegaMotor * vFrac;

    // Linear DC torque–speed line about the *current* operating point:
    // τ = τ_stall · (V_applied/V_nom) − τ_stall · (ω / ω_free)
    const applied = clamp(targetMotorOmega / freeOmegaMotor, -1, 1);
    let motorTorque =
      cfg.motorStallTorque *
      (applied * vFrac - motorOmega / freeOmegaMotor);

    // Brake vs coast when the stick is near neutral.
    if (Math.abs(cmdN) < 0.02) {
      if (cfg.brakeMode) {
        motorTorque =
          -cfg.motorStallTorque * (motorOmega / freeOmegaMotor) * 0.6;
      } else {
        motorTorque = 0;
      }
    }

    // Motor current ∝ torque (I = τ/Kt, fold Kt into stall): used for sag.
    const stallCurrent = 130; // A, per CIM-ish
    const wheelCurrent =
      Math.abs(motorTorque / cfg.motorStallTorque) * stallCurrent * nMotors;
    totalCurrent += wheelCurrent;

    // Wheel force at the contact patch.
    let wheelForce = (motorTorque * nMotors * G) / r;

    // Traction circle: a wheel can't push harder than μ·N.
    if (Math.abs(wheelForce) > tractionMax) {
      wheelForce = Math.sign(wheelForce) * tractionMax;
      anyTractionLimited = true;
      s.wheelSlip[i] = Math.min(
        1,
        (Math.abs((motorTorque * nMotors * G) / r) - tractionMax) /
          tractionMax,
      );
    } else {
      s.wheelSlip[i] = 0;
    }

    s.wheelRpm[i] = (wheelOmega * 60) / (2 * Math.PI);

    // The wheel force acts along the wheel's effective ground vector. For a
    // mecanum wheel the roller resolves drive into +z and ±x equally.
    Fz += wheelForce;
    Fx += w.kStrafe * wheelForce;
    Mz += w.kTurn * wheelForce * halfSum;
  }

  s.motorCurrent = totalCurrent;
  s.tractionLimited = anyTractionLimited;

  // 6. Resistances: rolling resistance opposes motion, quadratic drag at speed.
  const speedBody = Math.hypot(vBodyX, vBodyZ);
  if (speedBody > 1e-4) {
    const rr = 0.015 * cfg.mass * 9.81; // rolling resistance magnitude
    const drag = 2.2 * speedBody * speedBody; // lumped aero/scrub
    const fMag = rr + drag;
    Fx -= (vBodyX / speedBody) * fMag;
    Fz -= (vBodyZ / speedBody) * fMag;
  }
  // Yaw damping (scrub of mecanum rollers resists spinning).
  Mz -= s.omega * cfg.mass * 0.18;

  // 7. Integrate rigid-body dynamics.
  const m = cfg.mass;
  // Yaw inertia of a uniform rectangular slab.
  const Izz =
    (m * (cfg.trackWidth * cfg.trackWidth + cfg.wheelBase * cfg.wheelBase)) /
    12;

  const aBodyX = Fx / m;
  const aBodyZ = Fz / m;
  const newVBodyX = vBodyX + aBodyX * dt;
  const newVBodyZ = vBodyZ + aBodyZ * dt;
  s.omega += (Mz / Izz) * dt;

  // body → world
  s.vx = c * newVBodyX + sn * newVBodyZ;
  s.vz = -sn * newVBodyX + c * newVBodyZ;

  // 8. Integrate pose.
  s.x += s.vx * dt;
  s.z += s.vz * dt;
  s.heading += s.omega * dt;
  if (s.heading > Math.PI) s.heading -= 2 * Math.PI;
  if (s.heading < -Math.PI) s.heading += 2 * Math.PI;
}

/** Axis-aligned bounding box for obstacle collision. */
export interface ObstacleBox {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
}

/**
 * Push the robot out of any obstacle boxes using a closest-point AABB test.
 * Inelastically cancels velocity into the wall face.
 */
export function constrainToObstacles(
  s: RobotState,
  boxes: ObstacleBox[],
  robotRadius: number,
): void {
  for (const box of boxes) {
    const nearX = Math.max(box.x - box.halfW, Math.min(box.x + box.halfW, s.x));
    const nearZ = Math.max(box.z - box.halfD, Math.min(box.z + box.halfD, s.z));
    const dx = s.x - nearX;
    const dz = s.z - nearZ;
    const dist2 = dx * dx + dz * dz;
    if (dist2 < robotRadius * robotRadius && dist2 > 1e-10) {
      const dist = Math.sqrt(dist2);
      const nx = dx / dist;
      const nz = dz / dist;
      s.x = nearX + nx * robotRadius;
      s.z = nearZ + nz * robotRadius;
      const vDotN = s.vx * nx + s.vz * nz;
      if (vDotN < 0) {
        s.vx -= vDotN * nx * 1.2;
        s.vz -= vDotN * nz * 1.2;
      }
    }
  }
}

/** Clamp the robot inside the field walls with an inelastic bounce. */
export function constrainToField(
  s: RobotState,
  halfX: number,
  halfZ: number,
  robotRadius: number,
) {
  const minX = -halfX + robotRadius;
  const maxX = halfX - robotRadius;
  const minZ = -halfZ + robotRadius;
  const maxZ = halfZ - robotRadius;
  if (s.x < minX) {
    s.x = minX;
    if (s.vx < 0) s.vx *= -0.25;
  } else if (s.x > maxX) {
    s.x = maxX;
    if (s.vx > 0) s.vx *= -0.25;
  }
  if (s.z < minZ) {
    s.z = minZ;
    if (s.vz < 0) s.vz *= -0.25;
  } else if (s.z > maxZ) {
    s.z = maxZ;
    if (s.vz > 0) s.vz *= -0.25;
  }
}
