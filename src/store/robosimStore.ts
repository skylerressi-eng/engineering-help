import { create } from 'zustand';
import {
  DRIVE_PRESETS,
  type DriveConfig,
} from '@/apps/robosim/physics';

export type DrivetrainId = keyof typeof DRIVE_PRESETS;
export type FieldId = 'frc' | 'open' | 'obstacle';
export type CameraMode = 'orbit' | 'chase' | 'fpv' | 'overhead';
export type MatchPhase = 'auto' | 'teleop' | 'endgame';

export interface ScoredEvent {
  t: number;
  alliance: 'red' | 'blue';
  points: number;
  node: string;
}

interface RoboState {
  // Drivetrain
  drivetrain: DrivetrainId;
  config: DriveConfig;
  fieldOriented: boolean;
  throttle: number; // 0..1 effort scale
  brakeMode: boolean;

  // Match
  enabled: boolean;
  phase: MatchPhase;
  timeLeft: number; // s
  running: boolean;
  alliance: 'red' | 'blue';
  scoreRed: number;
  scoreBlue: number;
  heldPieces: number;
  log: ScoredEvent[];

  // Scene
  field: FieldId;
  camera: CameraMode;

  // actions
  setDrivetrain: (d: DrivetrainId) => void;
  patchConfig: (p: Partial<DriveConfig>) => void;
  setFieldOriented: (b: boolean) => void;
  setThrottle: (v: number) => void;
  setBrakeMode: (b: boolean) => void;
  setEnabled: (b: boolean) => void;
  setPhase: (p: MatchPhase) => void;
  startMatch: () => void;
  resetMatch: () => void;
  tickClock: (dt: number) => void;
  setAlliance: (a: 'red' | 'blue') => void;
  addScore: (a: 'red' | 'blue', pts: number, node: string) => void;
  setHeld: (n: number) => void;
  setField: (f: FieldId) => void;
  setCamera: (c: CameraMode) => void;
}

const PHASE_TIME: Record<MatchPhase, number> = {
  auto: 15,
  teleop: 135,
  endgame: 30,
};

export const useRoboStore = create<RoboState>((set, get) => ({
  drivetrain: 'competition',
  config: { ...DRIVE_PRESETS.competition },
  fieldOriented: true,
  throttle: 0.85,
  brakeMode: true,

  enabled: false,
  phase: 'teleop',
  timeLeft: PHASE_TIME.teleop,
  running: false,
  alliance: 'red',
  scoreRed: 0,
  scoreBlue: 0,
  heldPieces: 0,
  log: [],

  field: 'frc',
  camera: 'chase',

  setDrivetrain: (d) =>
    set({
      drivetrain: d,
      config: { ...DRIVE_PRESETS[d] },
      brakeMode: DRIVE_PRESETS[d].brakeMode,
    }),
  patchConfig: (p) => set((s) => ({ config: { ...s.config, ...p } })),
  setFieldOriented: (b) => set({ fieldOriented: b }),
  setThrottle: (v) => set({ throttle: Math.max(0.05, Math.min(1, v)) }),
  setBrakeMode: (b) =>
    set((s) => ({ brakeMode: b, config: { ...s.config, brakeMode: b } })),

  setEnabled: (b) => set({ enabled: b }),
  setPhase: (p) => set({ phase: p, timeLeft: PHASE_TIME[p], running: false }),
  startMatch: () =>
    set((s) => ({ running: true, enabled: true, timeLeft: PHASE_TIME[s.phase] })),
  resetMatch: () =>
    set((s) => ({
      running: false,
      enabled: false,
      timeLeft: PHASE_TIME[s.phase],
      scoreRed: 0,
      scoreBlue: 0,
      heldPieces: 0,
      log: [],
    })),
  tickClock: (dt) => {
    const s = get();
    if (!s.running) return;
    const t = Math.max(0, s.timeLeft - dt);
    if (t === 0 && s.timeLeft > 0)
      set({ timeLeft: 0, running: false, enabled: false });
    else set({ timeLeft: t });
  },
  setAlliance: (a) => set({ alliance: a }),
  addScore: (a, pts, node) =>
    set((s) => ({
      scoreRed: a === 'red' ? s.scoreRed + pts : s.scoreRed,
      scoreBlue: a === 'blue' ? s.scoreBlue + pts : s.scoreBlue,
      log: [
        { t: s.timeLeft, alliance: a, points: pts, node },
        ...s.log,
      ].slice(0, 30),
    })),
  setHeld: (n) => set({ heldPieces: n }),
  setField: (f) => set({ field: f }),
  setCamera: (c) => set({ camera: c }),
}));
