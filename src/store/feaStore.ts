import { create } from 'zustand';
import type * as THREE from 'three';
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
  loadFromGeometry: (geom: THREE.BufferGeometry, name?: string) => {
    nodes: number;
    elements: number;
  };
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

  loadFromGeometry: (geom) => {
    const pos = geom.getAttribute('position');
    if (!pos) throw new Error('geometry has no position attribute');
    // Snap-merge vertices that are within 1e-4 of each other; rebuild edges
    // from the triangle list.
    const verts: { x: number; y: number; z: number }[] = [];
    const indexMap: number[] = []; // for each triangle vertex i → merged index
    const TOL = 1e-4;
    const round = (v: number) => Math.round(v / TOL);
    const key = (x: number, y: number, z: number) =>
      `${round(x)},${round(y)},${round(z)}`;
    const keyToIdx = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        indexMap.push(-1);
        continue;
      }
      const k = key(x, y, z);
      let idx = keyToIdx.get(k);
      if (idx === undefined) {
        idx = verts.length;
        keyToIdx.set(k, idx);
        verts.push({ x, y, z });
      }
      indexMap.push(idx);
    }
    if (verts.length < 2) throw new Error('not enough vertices');
    // Edges (unique pairs from triangle list).
    const edgeSet = new Set<string>();
    const edges: [number, number][] = [];
    const pushEdge = (a: number, b: number) => {
      if (a === b || a < 0 || b < 0) return;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const k = `${lo}-${hi}`;
      if (edgeSet.has(k)) return;
      edgeSet.add(k);
      edges.push([lo, hi]);
    };
    const indexAttr = geom.index;
    if (indexAttr) {
      for (let i = 0; i + 2 < indexAttr.count; i += 3) {
        const ai = indexMap[indexAttr.getX(i)];
        const bi = indexMap[indexAttr.getX(i + 1)];
        const ci = indexMap[indexAttr.getX(i + 2)];
        pushEdge(ai, bi);
        pushEdge(bi, ci);
        pushEdge(ci, ai);
      }
    } else {
      for (let i = 0; i + 2 < indexMap.length; i += 3) {
        pushEdge(indexMap[i], indexMap[i + 1]);
        pushEdge(indexMap[i + 1], indexMap[i + 2]);
        pushEdge(indexMap[i + 2], indexMap[i]);
      }
    }
    if (edges.length === 0) throw new Error('no edges extracted from mesh');

    // Recenter (x,z) and lift onto ground (min Y = 0). Scale longest dimension to ~5 m.
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const v of verts) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.z > maxZ) maxZ = v.z;
    }
    const dx = maxX - minX;
    const dy = maxY - minY;
    const dz = maxZ - minZ;
    const longest = Math.max(dx, dy, dz) || 1;
    const s = 5 / longest;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    for (const v of verts) {
      v.x = (v.x - cx) * s;
      v.y = (v.y - minY) * s;
      v.z = (v.z - cz) * s;
    }

    // Hard cap to keep the solver responsive.
    const MAX_NODES = 200;
    const MAX_ELEMENTS = 800;
    if (verts.length > MAX_NODES || edges.length > MAX_ELEMENTS) {
      // Decimate by greedy edge-shortest-first dropping until under cap.
      // Simple approach: just take the first MAX_NODES/MAX_ELEMENTS and drop edges
      // referencing dropped vertices.
      verts.length = Math.min(verts.length, MAX_NODES);
      const valid = new Set<number>();
      for (let i = 0; i < verts.length; i++) valid.add(i);
      let kept = 0;
      for (let i = 0; i < edges.length && kept < MAX_ELEMENTS; i++) {
        const [a, b] = edges[i];
        if (valid.has(a) && valid.has(b)) {
          edges[kept++] = edges[i];
        }
      }
      edges.length = kept;
    }

    const { E, area } = get();
    const mat = getEngMaterial(get().materialId);
    const nodes = verts.map((v, i) => ({
      id: `n${i + 1}`,
      x: v.x,
      y: v.y,
      z: v.z,
      // Auto-pin nodes sitting on the ground plane so the structure isn't a
      // free-floating mechanism.
      fixX: v.y < 1e-3,
      fixY: v.y < 1e-3,
      fixZ: v.y < 1e-3,
    }));
    const elements = edges.map(([a, b], i) => ({
      id: `e${i + 1}`,
      a: nodes[a].id,
      b: nodes[b].id,
      E,
      A: area,
      alpha: mat.alpha,
    }));
    // Make sure seq counters won't collide with this naming on later edits.
    seq = Math.max(seq, nodes.length + 1, elements.length + 1);
    set((s) => ({
      model: {
        ...s.model,
        nodes,
        elements,
        loads: [],
      },
      result: null,
      selectedNode: null,
      elementFrom: null,
      rev: s.rev + 1,
    }));
    return { nodes: nodes.length, elements: elements.length };
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
