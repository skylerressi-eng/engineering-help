import { makeRobotState, type RobotState, type ObstacleBox } from './physics';
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

export const FIELD_BOUNDS: Record<string, { halfX: number; halfZ: number }> = {
  frc: { halfX: 8.0, halfZ: 4.0 },
  open: { halfX: 7.5, halfZ: 7.5 },
  obstacle: { halfX: 7.0, halfZ: 7.0 },
};

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

export const keyHandlers = (() => {
  const keys = new Set<string>();
  const recompute = () => {
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
  };
  return {
    down(code: string) {
      keys.add(code);
      recompute();
    },
    up(code: string) {
      keys.delete(code);
      recompute();
    },
    clear() {
      keys.clear();
      recompute();
    },
    isActive() {
      return keys.size > 0;
    },
  };
})();
