import { create } from 'zustand';
import type { AirfoilId } from '@/lib/cfd/naca';

export type AeroMode = 'simple' | 'advanced';
export type VizMode = 'streamlines' | 'vorticity' | 'pressure';
export type SweepResult = { x: number; cl: number; cd: number; ld: number };

interface AeroState {
  airfoil: AirfoilId;
  /** angle of attack in degrees (UI-friendly) */
  aoaDeg: number;
  /** velocity m/s */
  V: number;
  /** density kg/m³ */
  rho: number;
  /** chord length m */
  chord: number;

  mode: AeroMode;
  viz: VizMode;
  threeD: boolean;
  showResultsPanel: boolean;
  sweep: SweepResult[] | null;
  rev: number;

  setAirfoil: (a: AirfoilId) => void;
  setAoaDeg: (d: number) => void;
  setV: (v: number) => void;
  setRho: (r: number) => void;
  setChord: (c: number) => void;
  setMode: (m: AeroMode) => void;
  setViz: (v: VizMode) => void;
  setThreeD: (b: boolean) => void;
  setSweep: (s: SweepResult[] | null) => void;
  bump: () => void;
}

export const useAerosimStore = create<AeroState>((set) => ({
  airfoil: 'naca2412',
  aoaDeg: 5,
  V: 30,
  rho: 1.225,
  chord: 1,
  mode: 'simple',
  viz: 'streamlines',
  threeD: false,
  showResultsPanel: true,
  sweep: null,
  rev: 0,

  setAirfoil: (a) => set({ airfoil: a, rev: 0 }),
  setAoaDeg: (d) => set({ aoaDeg: Math.max(-30, Math.min(30, d)) }),
  setV: (v) => set({ V: Math.max(0.5, Math.min(300, v)) }),
  setRho: (r) => set({ rho: Math.max(0.001, Math.min(20, r)) }),
  setChord: (c) => set({ chord: Math.max(0.05, Math.min(10, c)) }),
  setMode: (m) => set({ mode: m }),
  setViz: (v) => set({ viz: v }),
  setThreeD: (b) => set({ threeD: b }),
  setSweep: (s) => set({ sweep: s }),
  bump: () => set((s) => ({ rev: s.rev + 1 })),
}));
