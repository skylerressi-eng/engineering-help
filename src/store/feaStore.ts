import { create } from 'zustand';
import {
  solveTruss3D,
  type FeaModel3D,
  type FeaResult3D,
  type TestType,
} from '@/lib/fea/truss3d';
import { FEA_PRESETS_3D } from '@/lib/fea/presets3d';
import { getEngMaterial } from '@/lib/materials/engineering';

let seq = 1;
const uid = (p: string) => `${p}${seq++}`;

export type FeaTool = 'select' | 'node' | 'element' | 'support' | 'load';

interface FeaStore {
  model: FeaModel3D;
  tool: FeaTool;
  selectedNode: string | null;
  elementFrom: string | null;
  result: FeaResult3D | null;
  showDeformed: boolean;
  dispScale: number;
  E: number;
  area: number;
  materialId: string;
  yieldStress: number;
  rev: number;

  setTool: (t: FeaTool) => void;
  addNode: (x: number, y: number, z: number) => string;
  moveNode: (id: string, x: number, y: number, z: number) => void;
  toggleSupport: (id: string) => void;
  setLoad: (id: string, fx: number, fy: number, fz: number) => void;
  beginElement: (id: string) => void;
  finishElement: (id: string) => void;
  removeNode: (id: string) => void;
  removeElement: (id: string) => void;
  select: (id: string | null) => void;
  setShowDeformed: (b: boolean) => void;
  setDispScale: (n: number) => void;
  setArea: (a: number) => void;
  setMaterial: (id: string) => void;
  setTest: (t: TestType) => void;
  setPressure: (p: number) => void;
  setTribArea: (a: number) => void;
  setPDir: (d: [number, number, number]) => void;
  setDeltaT: (t: number) => void;
  loadPreset: (id: string) => void;
  /** Build a solvable planar truss from a 2D silhouette (model units, metres). */
  buildFromPolygon: (pts: { x: number; y: number }[]) => void;
  clear: () => void;
  solve: () => FeaResult3D;
}

const clone = (m: FeaModel3D): FeaModel3D => JSON.parse(JSON.stringify(m));

export const useFeaStore = create<FeaStore>((set, get) => ({
  model: clone(FEA_PRESETS_3D[0].model),
  tool: 'select',
  selectedNode: null,
  elementFrom: null,
  result: null,
  showDeformed: true,
  dispScale: 200,
  E: 2.0e11,
  area: 1e-4,
  materialId: 'steel-mild',
  yieldStress: 250e6,
  rev: 0,

  setTool: (t) => set({ tool: t, elementFrom: null }),

  addNode: (x, y, z) => {
    const id = uid('n');
    set((s) => ({
      model: {
        ...s.model,
        nodes: [
          ...s.model.nodes,
          { id, x, y, z, fixX: false, fixY: false, fixZ: false },
        ],
      },
      result: null,
      rev: s.rev + 1,
    }));
    return id;
  },

  moveNode: (id, x, y, z) =>
    set((s) => ({
      model: {
        ...s.model,
        nodes: s.model.nodes.map((n) =>
          n.id === id ? { ...n, x, y, z } : n,
        ),
      },
      result: null,
      rev: s.rev + 1,
    })),

  toggleSupport: (id) =>
    set((s) => ({
      model: {
        ...s.model,
        nodes: s.model.nodes.map((n) =>
          n.id === id
            ? n.fixX && n.fixY && n.fixZ
              ? { ...n, fixX: false, fixY: false, fixZ: false }
              : { ...n, fixX: true, fixY: true, fixZ: true }
            : n,
        ),
      },
      result: null,
      rev: s.rev + 1,
    })),

  setLoad: (id, fx, fy, fz) =>
    set((s) => {
      const loads = s.model.loads.filter((l) => l.node !== id);
      if (fx !== 0 || fy !== 0 || fz !== 0)
        loads.push({ node: id, fx, fy, fz });
      return {
        model: { ...s.model, loads },
        result: null,
        rev: s.rev + 1,
      };
    }),

  beginElement: (id) => set({ elementFrom: id }),
  finishElement: (id) => {
    const from = get().elementFrom;
    if (!from || from === id) {
      set({ elementFrom: null });
      return;
    }
    const exists = get().model.elements.some(
      (e) => (e.a === from && e.b === id) || (e.a === id && e.b === from),
    );
    if (!exists) {
      const { E, area } = get();
      const mat = getEngMaterial(get().materialId);
      set((s) => ({
        model: {
          ...s.model,
          elements: [
            ...s.model.elements,
            { id: uid('e'), a: from, b: id, E, A: area, alpha: mat.alpha },
          ],
        },
        result: null,
        rev: s.rev + 1,
      }));
    }
    set({ elementFrom: null });
  },

  removeNode: (id) =>
    set((s) => ({
      model: {
        ...s.model,
        nodes: s.model.nodes.filter((n) => n.id !== id),
        elements: s.model.elements.filter(
          (e) => e.a !== id && e.b !== id,
        ),
        loads: s.model.loads.filter((l) => l.node !== id),
      },
      selectedNode: s.selectedNode === id ? null : s.selectedNode,
      result: null,
      rev: s.rev + 1,
    })),

  removeElement: (id) =>
    set((s) => ({
      model: {
        ...s.model,
        elements: s.model.elements.filter((e) => e.id !== id),
      },
      result: null,
      rev: s.rev + 1,
    })),

  select: (id) => set({ selectedNode: id }),
  setShowDeformed: (b) => set({ showDeformed: b }),
  setDispScale: (n) => set({ dispScale: Math.max(1, Math.min(1e7, n)) }),
  setArea: (a) =>
    set((s) => ({
      area: a,
      model: {
        ...s.model,
        elements: s.model.elements.map((e) => ({ ...e, A: a })),
      },
      result: null,
      rev: s.rev + 1,
    })),

  setMaterial: (id) => {
    const m = getEngMaterial(id);
    set((s) => ({
      materialId: id,
      E: m.E,
      yieldStress: m.yield,
      model: {
        ...s.model,
        elements: s.model.elements.map((e) => ({
          ...e,
          E: m.E,
          alpha: m.alpha,
        })),
      },
      result: null,
      rev: s.rev + 1,
    }));
  },

  setTest: (t) =>
    set((s) => ({
      model: { ...s.model, test: t },
      result: null,
      rev: s.rev + 1,
    })),
  setPressure: (p) =>
    set((s) => ({
      model: { ...s.model, pressure: p },
      result: null,
      rev: s.rev + 1,
    })),
  setTribArea: (a) =>
    set((s) => ({
      model: { ...s.model, tribArea: a },
      result: null,
      rev: s.rev + 1,
    })),
  setPDir: (d) =>
    set((s) => ({
      model: { ...s.model, pDir: d },
      result: null,
      rev: s.rev + 1,
    })),
  setDeltaT: (t) =>
    set((s) => ({
      model: { ...s.model, deltaT: t },
      result: null,
      rev: s.rev + 1,
    })),

  loadPreset: (id) => {
    const p = FEA_PRESETS_3D.find((x) => x.id === id);
    if (p)
      set((s) => ({
        model: clone(p.model),
        result: null,
        selectedNode: null,
        elementFrom: null,
        rev: s.rev + 1,
      }));
  },

  buildFromPolygon: (pts) => {
    if (pts.length < 3) return;
    const { E, area } = get();
    const mat = getEngMaterial(get().materialId);
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    const nodes = pts.map((p, i) => ({
      id: `n${i + 1}`,
      x: p.x,
      y: p.y,
      z: 0,
      fixX: false,
      fixY: false,
      fixZ: false,
    }));
    const center = {
      id: `n${pts.length + 1}`,
      x: cx,
      y: cy,
      z: 0,
      fixX: false,
      fixY: false,
      fixZ: false,
    };
    nodes.push(center);
    // Pin the two lowest perimeter nodes so the structure is stable.
    const byY = nodes.slice(0, pts.length).sort((a, b) => a.y - b.y);
    for (const n of byY.slice(0, 2)) {
      n.fixX = n.fixY = n.fixZ = true;
    }
    const elements: FeaModel3D['elements'] = [];
    let ei = 1;
    for (let i = 0; i < pts.length; i++) {
      const a = nodes[i].id;
      const b = nodes[(i + 1) % pts.length].id;
      elements.push({ id: `e${ei++}`, a, b, E, A: area, alpha: mat.alpha });
      // Spoke to centroid — triangulates the polygon so it isn't a mechanism.
      elements.push({
        id: `e${ei++}`,
        a,
        b: center.id,
        E,
        A: area,
        alpha: mat.alpha,
      });
    }
    // A downward load on the highest node so a solve shows something useful.
    const top = nodes
      .slice(0, pts.length)
      .reduce((hi, n) => (n.y > hi.y ? n : hi), nodes[0]);
    set((s) => ({
      model: {
        ...s.model,
        nodes,
        elements,
        loads: [{ node: top.id, fx: 0, fy: -5000, fz: 0 }],
      },
      result: null,
      selectedNode: null,
      elementFrom: null,
      rev: s.rev + 1,
    }));
  },

  clear: () =>
    set((s) => ({
      model: {
        nodes: [],
        elements: [],
        loads: [],
        test: s.model.test,
        pressure: s.model.pressure,
        tribArea: s.model.tribArea,
        pDir: s.model.pDir,
        deltaT: s.model.deltaT,
      },
      result: null,
      selectedNode: null,
      elementFrom: null,
      rev: s.rev + 1,
    })),

  solve: () => {
    const r = solveTruss3D(get().model);
    if (!r.unstable && r.maxDisp > 0) {
      set({ dispScale: Math.max(1, Math.min(1e7, 0.6 / r.maxDisp)) });
    }
    set({ result: r });
    return r;
  },
}));
