import { create } from 'zustand';
import type { CompType, CircuitComp, AnalogCircuit, TransientResult, DCResult } from '@/lib/circuitSolver/types';
import { solveDC, solveTransient } from '@/lib/circuitSolver/solver';

interface CompSpec {
  type: CompType;
  label: string;
  pins: string[];
  defaultValue: number;
  unit: string;
  width: number;
  height: number;
  symbol: string;
}

export const COMPONENT_SPECS: Record<CompType, CompSpec> = {
  resistor: { type: 'resistor', label: 'Resistor', pins: ['a', 'b'], defaultValue: 1000, unit: 'Ω', width: 60, height: 24, symbol: 'R' },
  capacitor: { type: 'capacitor', label: 'Capacitor', pins: ['a', 'b'], defaultValue: 1e-6, unit: 'F', width: 60, height: 24, symbol: 'C' },
  inductor: { type: 'inductor', label: 'Inductor', pins: ['a', 'b'], defaultValue: 1e-3, unit: 'H', width: 60, height: 24, symbol: 'L' },
  vsource: { type: 'vsource', label: 'V-Source (DC)', pins: ['p', 'n'], defaultValue: 5, unit: 'V', width: 50, height: 50, symbol: 'V' },
  vsource_ac: { type: 'vsource_ac', label: 'V-Source (AC)', pins: ['p', 'n'], defaultValue: 1, unit: 'V', width: 50, height: 50, symbol: '~' },
  isource: { type: 'isource', label: 'I-Source', pins: ['p', 'n'], defaultValue: 0.01, unit: 'A', width: 50, height: 50, symbol: 'I' },
  diode: { type: 'diode', label: 'Diode', pins: ['a', 'k'], defaultValue: 0, unit: '', width: 50, height: 20, symbol: '▷' },
  ground: { type: 'ground', label: 'Ground', pins: ['p'], defaultValue: 0, unit: '', width: 28, height: 28, symbol: '⏚' },
  wire: { type: 'wire', label: 'Wire', pins: [], defaultValue: 0, unit: '', width: 0, height: 0, symbol: '' },
};

export interface ProbeSpec {
  id: string;
  /** node id to probe */
  node: string;
  color: string;
}

interface CircuitSimStore {
  components: CircuitComp[];
  /** A wire is just a list of pin ids on the same electrical node */
  /** Nodes map auto-derived */
  selectedId: string | null;
  wiringFrom: string | null;
  probes: ProbeSpec[];
  /** Most recent DC solve */
  dc: DCResult | null;
  transient: TransientResult | null;
  scopeMode: 'time' | 'fft';
  duration: number;
  dt: number;
  rev: number;

  addComponent: (type: CompType, x: number, y: number) => string;
  removeComponent: (id: string) => void;
  moveComponent: (id: string, x: number, y: number) => void;
  setSelected: (id: string | null) => void;
  setValue: (id: string, value: number, freq?: number) => void;
  beginWire: (pinId: string) => void;
  cancelWire: () => void;
  completeWire: (pinId: string) => void;
  removeNode: (nodeName: string) => void;
  addProbe: (node: string) => void;
  removeProbe: (probeId: string) => void;
  setScopeMode: (m: 'time' | 'fft') => void;
  setDuration: (d: number) => void;
  setDt: (dt: number) => void;
  clear: () => void;
  asCircuit: () => AnalogCircuit;
  runDC: () => DCResult;
  runTransient: () => TransientResult;
}

let seq = 1;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/* Union-find of pin ids → electrical nodes */
function buildNodes(components: CircuitComp[]): { nodes: string[]; pinNode: Map<string, string> } {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let p = parent.get(x);
    if (!p || p === x) {
      parent.set(x, x);
      return x;
    }
    while (p !== parent.get(p)) {
      parent.set(p, parent.get(parent.get(p)!)!);
      p = parent.get(p)!;
    }
    return p;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const c of components) {
    if (c.type === 'wire') {
      // A wire connects its two endpoints — endpoints are stored as pin ids in pins
      const a = c.pins.a;
      const b = c.pins.b;
      if (a && b) union(a, b);
    } else {
      for (const pin of Object.values(c.pins)) {
        find(pin);
      }
    }
  }
  const pinNode = new Map<string, string>();
  const nodeSet = new Set<string>();
  for (const c of components) {
    for (const pin of Object.values(c.pins)) {
      const r = find(pin);
      pinNode.set(pin, r);
      nodeSet.add(r);
    }
  }
  return { nodes: Array.from(nodeSet), pinNode };
}

export const useCircuitSimStore = create<CircuitSimStore>((set, get) => ({
  components: [],
  selectedId: null,
  wiringFrom: null,
  probes: [],
  dc: null,
  transient: null,
  scopeMode: 'time',
  duration: 0.05,
  dt: 5e-5,
  rev: 0,

  addComponent: (type, x, y) => {
    const id = uid(type);
    const spec = COMPONENT_SPECS[type];
    const pins: Record<string, string> = {};
    for (const p of spec.pins) pins[p] = `${id}.${p}`;
    const c: CircuitComp = {
      id,
      type,
      pins,
      x: Math.round(x / 20) * 20,
      y: Math.round(y / 20) * 20,
      value: spec.defaultValue,
      freq: type === 'vsource_ac' ? 1000 : undefined,
    };
    set((s) => ({ components: [...s.components, c], selectedId: id, rev: s.rev + 1 }));
    return id;
  },

  removeComponent: (id) =>
    set((s) => ({
      components: s.components.filter(
        (c) => c.id !== id && !(c.type === 'wire' && (c.pins.a?.startsWith(id + '.') || c.pins.b?.startsWith(id + '.'))),
      ),
      selectedId: s.selectedId === id ? null : s.selectedId,
      rev: s.rev + 1,
    })),

  moveComponent: (id, x, y) =>
    set((s) => ({
      components: s.components.map((c) =>
        c.id === id ? { ...c, x: Math.round(x / 20) * 20, y: Math.round(y / 20) * 20 } : c,
      ),
      rev: s.rev + 1,
    })),

  setSelected: (id) => set({ selectedId: id }),
  setValue: (id, value, freq) =>
    set((s) => ({
      components: s.components.map((c) =>
        c.id === id ? { ...c, value, ...(freq !== undefined ? { freq } : {}) } : c,
      ),
    })),
  beginWire: (pinId) => set({ wiringFrom: pinId }),
  cancelWire: () => set({ wiringFrom: null }),
  completeWire: (pinId) => {
    const from = get().wiringFrom;
    if (!from || from === pinId) {
      set({ wiringFrom: null });
      return;
    }
    const wire: CircuitComp = {
      id: uid('w'),
      type: 'wire',
      pins: { a: from, b: pinId },
      x: 0,
      y: 0,
      value: 0,
    };
    set((s) => ({
      components: [...s.components, wire],
      wiringFrom: null,
      rev: s.rev + 1,
    }));
  },

  removeNode: (nodeName) => {
    set((s) => ({
      components: s.components.filter(
        (c) =>
          c.type !== 'wire' ||
          (s.components.some((x) => x.pins[Object.keys(x.pins)[0]] === nodeName) ||
            (c.pins.a !== nodeName && c.pins.b !== nodeName)),
      ),
      rev: s.rev + 1,
    }));
  },

  addProbe: (node) => {
    if (get().probes.some((p) => p.node === node)) return;
    const colors = ['#22d3ee', '#fbbf24', '#a78bfa', '#f472b6'];
    const c = colors[get().probes.length % colors.length];
    set((s) => ({ probes: [...s.probes, { id: uid('probe'), node, color: c }] }));
  },
  removeProbe: (probeId) =>
    set((s) => ({ probes: s.probes.filter((p) => p.id !== probeId) })),
  setScopeMode: (m) => set({ scopeMode: m }),
  setDuration: (d) => set({ duration: Math.max(1e-6, Math.min(10, d)) }),
  setDt: (dt) => set({ dt: Math.max(1e-9, Math.min(0.01, dt)) }),

  clear: () =>
    set({ components: [], probes: [], selectedId: null, wiringFrom: null, dc: null, transient: null, rev: get().rev + 1 }),

  asCircuit: () => {
    const { components } = get();
    const { nodes, pinNode } = buildNodes(components);
    // Rewrite component pin references to point at the node ids
    const remapped: CircuitComp[] = components.map((c) => {
      const np: Record<string, string> = {};
      for (const [k, v] of Object.entries(c.pins)) np[k] = pinNode.get(v) ?? v;
      return { ...c, pins: np };
    });
    return { components: remapped, nodes };
  },

  runDC: () => {
    const ckt = get().asCircuit();
    try {
      const dc = solveDC(ckt);
      set({ dc });
      return dc;
    } catch (err) {
      console.error('DC solve failed', err);
      set({ dc: null });
      throw err;
    }
  },

  runTransient: () => {
    const ckt = get().asCircuit();
    try {
      const tr = solveTransient(ckt, get().duration, get().dt);
      set({ transient: tr });
      return tr;
    } catch (err) {
      console.error('Transient solve failed', err);
      throw err;
    }
  },
}));

export { buildNodes };
