import { create } from 'zustand';
import type { Board, PlacedComponent, Trace } from '@/lib/pcb/types';
import { pinId, rotateOffset } from '@/lib/pcb/types';
import { getFootprint } from '@/lib/pcb/footprints';

let seq = 1;
const uid = (p: string) => `${p}-${(seq++).toString(36)}`;

interface PCBStore {
  board: Board;
  selectedId: string | null;
  activeLayer: 'top-copper' | 'bottom-copper';
  visibleLayers: Record<string, boolean>;
  traceWidth: number;
  /** routing in progress: anchor pin + working points */
  routing: { fromPin: string; points: { x: number; y: number }[] } | null;
  rev: number;

  addComponent: (footprintId: string, x: number, y: number) => string;
  moveComponent: (id: string, x: number, y: number) => void;
  rotateComponent: (id: string) => void;
  setRef: (id: string, ref: string) => void;
  setValue: (id: string, value: string) => void;
  removeComponent: (id: string) => void;
  select: (id: string | null) => void;
  setActiveLayer: (l: 'top-copper' | 'bottom-copper') => void;
  toggleLayer: (l: string) => void;
  setTraceWidth: (w: number) => void;

  startRoute: (fromPin: string, at: { x: number; y: number }) => void;
  addRoutePoint: (p: { x: number; y: number }) => void;
  finishRoute: (toPin: string, at: { x: number; y: number }) => void;
  cancelRoute: () => void;
  removeTrace: (id: string) => void;

  clear: () => void;
  load: (b: Board) => void;
  /** all pad pin ids grouped into nets (union-find over traces) */
  computeNets: () => string[][];
}

const DEFAULT_BOARD: Board = {
  components: [],
  traces: [],
  outline: { w: 80, h: 60 },
  gridMm: 1.27,
};

/** Absolute pad position for a placed component pad. */
export function padWorld(
  comp: PlacedComponent,
  padName: string,
): { x: number; y: number } | null {
  const fp = getFootprint(comp.footprintId);
  const pad = fp?.pads.find((p) => p.name === padName);
  if (!fp || !pad) return null;
  const r = rotateOffset(pad.dx, pad.dy, comp.rot);
  return { x: comp.x + r.x, y: comp.y + r.y };
}

export const usePCBStore = create<PCBStore>((set, get) => ({
  board: DEFAULT_BOARD,
  selectedId: null,
  activeLayer: 'top-copper',
  visibleLayers: {
    'top-copper': true,
    'bottom-copper': true,
    silkscreen: true,
    edge: true,
  },
  traceWidth: 0.3,
  routing: null,
  rev: 0,

  addComponent: (footprintId, x, y) => {
    const fp = getFootprint(footprintId);
    if (!fp) return '';
    const id = uid('c');
    const count = get().board.components.filter((c) => {
      const f = getFootprint(c.footprintId);
      return f?.refPrefix === fp.refPrefix;
    }).length;
    const comp: PlacedComponent = {
      id,
      footprintId,
      ref: `${fp.refPrefix}${count + 1}`,
      value: fp.label,
      x: Math.round(x),
      y: Math.round(y),
      rot: 0,
      layer: get().activeLayer,
    };
    set((s) => ({
      board: { ...s.board, components: [...s.board.components, comp] },
      selectedId: id,
      rev: s.rev + 1,
    }));
    return id;
  },

  moveComponent: (id, x, y) =>
    set((s) => ({
      board: {
        ...s.board,
        components: s.board.components.map((c) =>
          c.id === id ? { ...c, x: Math.round(x), y: Math.round(y) } : c,
        ),
      },
      rev: s.rev + 1,
    })),

  rotateComponent: (id) =>
    set((s) => ({
      board: {
        ...s.board,
        components: s.board.components.map((c) =>
          c.id === id ? { ...c, rot: (c.rot + 90) % 360 } : c,
        ),
      },
      rev: s.rev + 1,
    })),

  setRef: (id, ref) =>
    set((s) => ({
      board: {
        ...s.board,
        components: s.board.components.map((c) => (c.id === id ? { ...c, ref } : c)),
      },
    })),
  setValue: (id, value) =>
    set((s) => ({
      board: {
        ...s.board,
        components: s.board.components.map((c) => (c.id === id ? { ...c, value } : c)),
      },
    })),

  removeComponent: (id) =>
    set((s) => ({
      board: {
        ...s.board,
        components: s.board.components.filter((c) => c.id !== id),
        traces: s.board.traces.filter(
          (t) => !t.a.startsWith(id + ':') && !t.b.startsWith(id + ':'),
        ),
      },
      selectedId: s.selectedId === id ? null : s.selectedId,
      rev: s.rev + 1,
    })),

  select: (id) => set({ selectedId: id }),
  setActiveLayer: (l) => set({ activeLayer: l }),
  toggleLayer: (l) =>
    set((s) => ({ visibleLayers: { ...s.visibleLayers, [l]: !s.visibleLayers[l] } })),
  setTraceWidth: (w) => set({ traceWidth: Math.max(0.1, Math.min(3, w)) }),

  startRoute: (fromPin, at) => set({ routing: { fromPin, points: [at] } }),
  addRoutePoint: (p) =>
    set((s) => (s.routing ? { routing: { ...s.routing, points: [...s.routing.points, p] } } : s)),
  finishRoute: (toPin, at) => {
    const r = get().routing;
    if (!r || r.fromPin === toPin) {
      set({ routing: null });
      return;
    }
    const trace: Trace = {
      id: uid('t'),
      layer: get().activeLayer,
      width: get().traceWidth,
      points: [...r.points, at],
      a: r.fromPin,
      b: toPin,
    };
    set((s) => ({
      board: { ...s.board, traces: [...s.board.traces, trace] },
      routing: null,
      rev: s.rev + 1,
    }));
  },
  cancelRoute: () => set({ routing: null }),
  removeTrace: (id) =>
    set((s) => ({
      board: { ...s.board, traces: s.board.traces.filter((t) => t.id !== id) },
      rev: s.rev + 1,
    })),

  clear: () =>
    set((s) => ({
      board: { ...DEFAULT_BOARD, components: [], traces: [] },
      selectedId: null,
      routing: null,
      rev: s.rev + 1,
    })),

  load: (b) =>
    set((s) => ({ board: b, selectedId: null, routing: null, rev: s.rev + 1 })),

  computeNets: () => {
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      let p = parent.get(x);
      if (p === undefined) {
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
    for (const c of get().board.components) {
      const fp = getFootprint(c.footprintId);
      fp?.pads.forEach((pd) => find(pinId(c.id, pd.name)));
    }
    for (const t of get().board.traces) union(t.a, t.b);
    const groups = new Map<string, string[]>();
    for (const pin of parent.keys()) {
      const r = find(pin);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r)!.push(pin);
    }
    return Array.from(groups.values()).filter((g) => g.length > 1);
  },
}));

export { pinId, getFootprint };
