import { makeRobotState, type RobotState, type ObstacleBox } from './physics';
import { makeDroneState, type DroneState, type DroneInput } from './drone';
export type { ObstacleBox };

/**
 * Per-instance simulation singletons. The Viewport's render loop owns the
 * physics; the HUD reads `robot` on a throttled rAF so React renders stay
 * cheap (no zustand churn at 240 Hz).
 */
export const robot: RobotState = makeRobotState(0, -3, 0);

/** Raw keyboard / gamepad axis state, -1..1 (pre slew-limiting). */
export const rawInput = {
  drive: 0,
  strafe: 0,
  turn: 0,
  boost: false,
  precision: false,
  intake: false,
};

export const drone: DroneState = makeDroneState(0, 1.2, 0);

export const droneInput: DroneInput = {
  throttle: 0,
  pitch: 0,
  roll: 0,
  yaw: 0,
  armToggle: false,
};

export const FIELD_BOUNDS: Record<string, { halfX: number; halfZ: number }> = {
  frc: { halfX: 8.0, halfZ: 4.0 },
  open: { halfX: 7.5, halfZ: 7.5 },
  obstacle: { halfX: 7.0, halfZ: 7.0 },
  drone_race: { halfX: 12.0, halfZ: 12.0 },
};

/** Drone race gates — figure-8 course. Each gate: position, Y rotation (rad), half-size. */
export interface RaceGate {
  x: number; y: number; z: number;
  rotY: number;
  halfW: number; halfH: number;
}

export const RACE_GATES: RaceGate[] = [
  { x:  0,   y: 2.0, z: -7,   rotY: 0,              halfW: 1.2, halfH: 1.0 },
  { x:  5,   y: 3.0, z: -5,   rotY: -Math.PI / 4,   halfW: 1.0, halfH: 0.9 },
  { x:  8,   y: 2.5, z:  0,   rotY: -Math.PI / 2,   halfW: 1.2, halfH: 1.0 },
  { x:  5,   y: 1.8, z:  5,   rotY: -Math.PI * 3/4, halfW: 1.0, halfH: 0.9 },
  { x:  0,   y: 2.0, z:  7,   rotY: Math.PI,         halfW: 1.2, halfH: 1.0 },
  { x: -5,   y: 3.0, z:  5,   rotY: Math.PI * 3/4,  halfW: 1.0, halfH: 0.9 },
  { x: -8,   y: 2.5, z:  0,   rotY: Math.PI / 2,    halfW: 1.2, halfH: 1.0 },
  { x: -5,   y: 1.8, z: -5,   rotY: Math.PI / 4,    halfW: 1.0, halfH: 0.9 },
];

export interface Piece {
  x: number;
  z: number;
  kind: 'cone' | 'cube';
  collected: boolean;
}

const PIECE_LAYOUT: Record<string, [number, number][]> = {
  frc: [
    [-3, 1.5],
    [-3, -1.5],
    [3, 1.5],
    [3, -1.5],
    [0, 2.5],
    [0, -2.5],
  ],
  obstacle: [
    [-5, 0],
    [5, 0],
    [0, 5],
    [0, -5],
  ],
  open: [
    [-4, 4],
    [4, 4],
    [-4, -4],
    [4, -4],
    [0, 0],
  ],
};

export const pieces: Piece[] = [];

export function loadPieces(field: string) {
  const layout = PIECE_LAYOUT[field] ?? PIECE_LAYOUT.open;
  pieces.length = 0;
  layout.forEach(([x, z], i) => {
    pieces.push({ x, z, kind: i % 2 === 0 ? 'cone' : 'cube', collected: false });
  });
}

export function resetRobot(x = 0, z = -3, heading = 0) {
  robot.x = x;
  robot.z = z;
  robot.heading = heading;
  robot.vx = 0;
  robot.vz = 0;
  robot.omega = 0;
  robot.cmd.drive = 0;
  robot.cmd.strafe = 0;
  robot.cmd.turn = 0;
  robot.speed = 0;
  robot.motorCurrent = 0;
}

/**
 * Obstacle AABB data for the "obstacle" field. Coordinates match the meshes
 * rendered in Viewport → Obstacles. halfW/halfD are half-extents in X/Z.
 * format: blocks[i] = [bx, by, bz, fullWidth, fullDepth] → halfW=w/2, halfD=d/2
 */
export const OBSTACLE_BOXES: ObstacleBox[] = [
  { x: -3, z: -2, halfW: 0.6, halfD: 0.4 },
  { x: 3, z: 2, halfW: 0.3, halfD: 0.7 },
  { x: 3.5, z: -3, halfW: 0.8, halfD: 0.2 },
  { x: -3.5, z: 3, halfW: 0.35, halfD: 0.6 },
  { x: 0, z: 0, halfW: 0.5, halfD: 0.5 },
];

/** Deposit zone for non-FRC fields: drive here with held pieces to score. */
export const DEPOSIT_ZONES: Record<string, { x: number; z: number; halfW: number; halfD: number }> = {
  open: { x: 0, z: 5.5, halfW: 2.5, halfD: 1.5 },
  obstacle: { x: -4.5, z: -4.5, halfW: 1.5, halfD: 1.5 },
};

export function resetDrone(x = 0, y = 1.2, z = 0) {
  drone.x = x; drone.y = y; drone.z = z;
  drone.vx = 0; drone.vy = 0; drone.vz = 0;
  drone.yaw = 0; drone.pitch = 0; drone.roll = 0;
  drone.omegaYaw = 0; drone.omegaPitch = 0; drone.omegaRoll = 0;
  drone.thrust = 0; drone.speed = 0;
  drone.armed = false; drone.crashed = false;
}

/** Current vehicle mode — robot or drone. Mutated by index.tsx to route inputs. */
export let vehicleMode: 'robot' | 'drone' = 'robot';
export function setVehicleMode(m: 'robot' | 'drone') { vehicleMode = m; }

export const keyHandlers = (() => {
  const keys = new Set<string>();
  const recompute = () => {
    // Robot inputs (WASD / arrows)
    rawInput.drive =
      (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) -
      (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    rawInput.strafe =
      (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    rawInput.turn =
      (keys.has('KeyE') || keys.has('ArrowRight') ? 1 : 0) -
      (keys.has('KeyQ') || keys.has('ArrowLeft') ? 1 : 0);
    rawInput.boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
    rawInput.precision = keys.has('ControlLeft') || keys.has('ControlRight');
    rawInput.intake = keys.has('Space');

    // Drone inputs — shares WASD/arrows for pitch+roll; Q/E yaw; Shift/Ctrl throttle
    droneInput.pitch =
      (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) -
      (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
    droneInput.roll =
      (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
      (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    droneInput.yaw =
      (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0);
    droneInput.throttle = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1
      : keys.has('ControlLeft') || keys.has('ControlRight') ? 0
      : droneInput.throttle; // hold last value when no throttle key
  };
  return {
    down(code: string) {
      if (code === 'KeyF') { droneInput.armToggle = true; }
      keys.add(code);
      recompute();
    },
    up(code: string) {
      if (code === 'KeyF') { droneInput.armToggle = false; }
      keys.delete(code);
      recompute();
    },
    clear() {
      keys.clear();
      droneInput.armToggle = false;
      recompute();
    },
    isActive() {
      return keys.size > 0;
    },
  };
})();
