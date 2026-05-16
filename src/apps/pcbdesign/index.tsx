import { useEffect, useRef, useState } from 'react';
import { CircuitBoard, Trash2, RotateCw, Save, Upload, Download, Layers as LayersIcon } from 'lucide-react';
import type { AppModule } from '@/os/types';
import { usePCBStore, padWorld, getFootprint } from '@/store/pcbStore';
import { FOOTPRINTS } from '@/lib/pcb/footprints';
import { LAYERS, pinId, rotateOffset, type Board } from '@/lib/pcb/types';
import { useAppTools } from '@/hooks/useToolRegistry';
import { publishAppState } from '@/ai/screenScanner';
import { toast } from '@/store/toastStore';

const PXMM = 6; // pixels per mm at zoom 1

function PCBDesign({ appId }: { appId: string }) {
  const board = usePCBStore((s) => s.board);
  const selectedId = usePCBStore((s) => s.selectedId);
  const activeLayer = usePCBStore((s) => s.activeLayer);
  const visibleLayers = usePCBStore((s) => s.visibleLayers);
  const routing = usePCBStore((s) => s.routing);
  const traceWidth = usePCBStore((s) => s.traceWidth);
  const addComponent = usePCBStore((s) => s.addComponent);
  const moveComponent = usePCBStore((s) => s.moveComponent);
  const rotateComponent = usePCBStore((s) => s.rotateComponent);
  const removeComponent = usePCBStore((s) => s.removeComponent);
  const select = usePCBStore((s) => s.select);
  const setActiveLayer = usePCBStore((s) => s.setActiveLayer);
  const toggleLayer = usePCBStore((s) => s.toggleLayer);
  const setTraceWidth = usePCBStore((s) => s.setTraceWidth);
  const startRoute = usePCBStore((s) => s.startRoute);
  const finishRoute = usePCBStore((s) => s.finishRoute);
  const cancelRoute = usePCBStore((s) => s.cancelRoute);
  const removeTrace = usePCBStore((s) => s.removeTrace);
  const setRef = usePCBStore((s) => s.setRef);
  const setValue = usePCBStore((s) => s.setValue);
  const clear = usePCBStore((s) => s.clear);
  const load = usePCBStore((s) => s.load);

  const svgRef = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const sel = selectedId ? board.components.find((c) => c.id === selectedId) ?? null : null;

  // ---- AI tools ----
  useAppTools(appId, [
    {
      toolName: 'place_component',
      description: `Place a footprint on the board. footprintId one of: ${FOOTPRINTS.map((f) => f.id).join(', ')}. x,y in mm. Returns component id + ref.`,
      input_schema: {
        type: 'object',
        properties: {
          footprintId: { type: 'string' },
          x: { type: 'number' },
          y: { type: 'number' },
          value: { type: 'string' },
        },
        required: ['footprintId', 'x', 'y'],
      },
      handler: ({ footprintId, x, y, value }: any) => {
        const id = addComponent(String(footprintId), Number(x), Number(y));
        if (!id) throw new Error('Unknown footprint');
        if (value) setValue(id, String(value));
        const c = usePCBStore.getState().board.components.find((k) => k.id === id)!;
        return { id, ref: c.ref };
      },
    },
    {
      toolName: 'route_trace',
      description:
        'Route a copper trace between two pads. Pins look like "<componentId>:<padName>".',
      input_schema: {
        type: 'object',
        properties: { from: { type: 'string' }, to: { type: 'string' } },
        required: ['from', 'to'],
      },
      handler: ({ from, to }: any) => {
        const st = usePCBStore.getState();
        const [fc, fp] = String(from).split(':');
        const [tc, tp] = String(to).split(':');
        const a = st.board.components.find((c) => c.id === fc);
        const b = st.board.components.find((c) => c.id === tc);
        if (!a || !b) throw new Error('Unknown component');
        const pa = padWorld(a, fp);
        const pb = padWorld(b, tp);
        if (!pa || !pb) throw new Error('Unknown pad');
        st.startRoute(String(from), pa);
        st.finishRoute(String(to), pb);
        return { ok: true };
      },
    },
    {
      toolName: 'get_board',
      description: 'Return the full board: components, traces, nets.',
      input_schema: { type: 'object', properties: {} },
      handler: () => {
        const st = usePCBStore.getState();
        return {
          components: st.board.components,
          traces: st.board.traces.map((t) => ({ id: t.id, a: t.a, b: t.b, layer: t.layer })),
          nets: st.computeNets(),
        };
      },
    },
    {
      toolName: 'clear_board',
      description: 'Remove all components and traces.',
      input_schema: { type: 'object', properties: {} },
      handler: () => {
        clear();
        return { ok: true };
      },
    },
  ]);

  // ---- screen scanner ----
  useEffect(() => {
    return publishAppState(appId, () => ({
      summary: `PCBForge: ${board.components.length} components, ${board.traces.length} traces, ${usePCBStore.getState().computeNets().length} nets. Active layer ${activeLayer}.`,
      state: {
        components: board.components.map((c) => ({ id: c.id, ref: c.ref, fp: c.footprintId, x: c.x, y: c.y })),
        traces: board.traces.length,
      },
    }));
  }, [appId, board, activeLayer]);

  const toMM = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.round((e.clientX - r.left) / PXMM),
      y: Math.round((e.clientY - r.top) / PXMM),
    };
  };

  // keyboard: Esc cancels route, Del removes selection, R rotates
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (e.key === 'Escape') cancelRoute();
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId)
        removeComponent(selectedId);
      else if (e.key.toLowerCase() === 'r' && selectedId) rotateComponent(selectedId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, cancelRoute, removeComponent, rotateComponent]);

  const exportSVG = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
      type: 'image/svg+xml',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'board.svg';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported', 'board.svg');
  };
  const saveJSON = () => {
    const blob = new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'board.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Saved', 'board.json');
  };
  const loadJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      load(JSON.parse(await f.text()) as Board);
      toast.success('Loaded', f.name);
    } catch (err) {
      toast.error('Load failed', (err as Error).message);
    } finally {
      e.target.value = '';
    }
  };

  const W = board.outline.w * PXMM;
  const H = board.outline.h * PXMM;

  return (
    <div className="flex h-full">
      {/* Palette */}
      <div className="w-40 shrink-0 border-r border-white/10 bg-black/20 p-2 chrome flex flex-col gap-1 overflow-y-auto">
        <div className="text-[10px] uppercase tracking-wide text-white/45 px-1 pb-1">
          Footprints
        </div>
        {FOOTPRINTS.map((f) => (
          <button
            key={f.id}
            onClick={() => addComponent(f.id, 20, 20)}
            className="text-left px-2 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-xs"
            title={`${f.label} (${f.pads.length} pads)`}
          >
            <span className="font-mono text-accent">{f.refPrefix}</span> {f.label}
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="h-9 px-2 flex items-center gap-1 border-b border-white/10 chrome">
          <div className="flex items-center gap-1">
            {(['top-copper', 'bottom-copper'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setActiveLayer(l)}
                className={`px-2 h-6 rounded-md text-xs ${
                  activeLayer === l ? 'bg-accent text-white' : 'hover:bg-white/10 text-white/65'
                }`}
              >
                {l === 'top-copper' ? 'Top' : 'Bottom'}
              </button>
            ))}
          </div>
          <div className="mx-1 w-px h-4 bg-white/15" />
          <span className="text-[11px] text-white/55">trace</span>
          <input
            type="range"
            min={0.1}
            max={2}
            step={0.05}
            value={traceWidth}
            onChange={(e) => setTraceWidth(parseFloat(e.target.value))}
            className="w-20"
          />
          <span className="text-[11px] font-mono w-10">{traceWidth.toFixed(2)}mm</span>
          <div className="mx-1 w-px h-4 bg-white/15" />
          <button onClick={saveJSON} className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10">
            <Save size={12} /> Save
          </button>
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10">
            <Upload size={12} /> Load
          </button>
          <button onClick={exportSVG} className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10">
            <Download size={12} /> SVG
          </button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={loadJSON} />
          <button onClick={clear} className="ml-auto flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10">
            <Trash2 size={12} /> Clear
          </button>
        </div>

        <div className="flex-1 overflow-auto" style={{ background: '#0a1a0f' }}>
          <svg
            ref={svgRef}
            width={W}
            height={H}
            onMouseMove={(e) => setCursor(toMM(e))}
            onMouseDown={(e) => {
              if ((e.target as SVGElement).tagName === 'svg') {
                if (routing) cancelRoute();
                else select(null);
              }
            }}
          >
            {/* board substrate */}
            <rect width={W} height={H} fill="#0c2417" />
            <defs>
              <pattern id="pcbgrid" width={board.gridMm * PXMM} height={board.gridMm * PXMM} patternUnits="userSpaceOnUse">
                <circle cx={0.5} cy={0.5} r={0.5} fill="rgba(120,220,160,0.18)" />
              </pattern>
            </defs>
            <rect width={W} height={H} fill="url(#pcbgrid)" />
            {visibleLayers['edge'] && (
              <rect
                x={2}
                y={2}
                width={W - 4}
                height={H - 4}
                fill="none"
                stroke="#f5d36b"
                strokeWidth={1.5}
                rx={4}
              />
            )}

            {/* ratsnest (unrouted within nets — light dashed) */}
            <Ratsnest />

            {/* traces */}
            {board.traces.map((t) =>
              visibleLayers[t.layer] ? (
                <polyline
                  key={t.id}
                  points={t.points.map((p) => `${p.x * PXMM},${p.y * PXMM}`).join(' ')}
                  fill="none"
                  stroke={t.layer === 'top-copper' ? '#e0533a' : '#3a7be0'}
                  strokeWidth={Math.max(1, t.width * PXMM)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (ev.shiftKey) removeTrace(t.id);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <title>shift-click to delete trace</title>
                </polyline>
              ) : null,
            )}

            {/* in-progress route */}
            {routing && cursor && (
              <polyline
                points={[...routing.points, cursor].map((p) => `${p.x * PXMM},${p.y * PXMM}`).join(' ')}
                fill="none"
                stroke={activeLayer === 'top-copper' ? '#e0533a' : '#3a7be0'}
                strokeWidth={Math.max(1, traceWidth * PXMM)}
                strokeDasharray="4 3"
                opacity={0.8}
                pointerEvents="none"
              />
            )}

            {/* components */}
            {board.components.map((c) => (
              <CompView
                key={c.id}
                id={c.id}
                selected={c.id === selectedId}
                onSelect={() => select(c.id)}
                onMove={(x, y) => moveComponent(c.id, x, y)}
                onPad={(pad, at) => {
                  const pn = pinId(c.id, pad);
                  if (routing) finishRoute(pn, at);
                  else startRoute(pn, at);
                }}
                toMM={toMM}
                visibleLayers={visibleLayers}
              />
            ))}
          </svg>
        </div>
        <div className="h-6 px-3 flex items-center text-[10px] text-white/40 font-mono border-t border-white/10">
          click a pad then another pad to route · shift-click trace to delete · R rotates · Del removes · {board.outline.w}×{board.outline.h} mm
        </div>
      </div>

      {/* Right panel */}
      <div className="w-52 shrink-0 border-l border-white/10 bg-black/25 flex flex-col chrome">
        <div className="p-3 border-b border-white/10">
          <div className="text-[10px] uppercase text-white/45 mb-2 flex items-center gap-1">
            <LayersIcon size={11} /> Layers
          </div>
          {LAYERS.map((l) => (
            <label key={l.id} className="flex items-center gap-2 text-xs py-0.5">
              <input
                type="checkbox"
                checked={visibleLayers[l.id]}
                onChange={() => toggleLayer(l.id)}
              />
              <span className="w-3 h-3 rounded-sm" style={{ background: l.color }} />
              {l.label}
            </label>
          ))}
        </div>
        <div className="p-3 flex-1 overflow-y-auto">
          <div className="text-[10px] uppercase text-white/45 mb-2">Selection</div>
          {!sel ? (
            <div className="text-xs text-white/45">Select a component</div>
          ) : (
            <div className="space-y-2 text-xs">
              <Field label="Ref" value={sel.ref} onChange={(v) => setRef(sel.id, v)} />
              <Field label="Value" value={sel.value} onChange={(v) => setValue(sel.id, v)} />
              <div className="text-white/55 font-mono text-[11px]">
                {getFootprint(sel.footprintId)?.label} · {sel.x},{sel.y} mm · {sel.rot}°
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => rotateComponent(sel.id)}
                  className="flex-1 flex items-center justify-center gap-1 py-1 rounded-md bg-white/10 hover:bg-white/15"
                >
                  <RotateCw size={11} /> Rotate
                </button>
                <button
                  onClick={() => removeComponent(sel.id)}
                  className="flex-1 flex items-center justify-center gap-1 py-1 rounded-md bg-traffic-red/20 hover:bg-traffic-red/40 text-traffic-red"
                >
                  <Trash2 size={11} /> Delete
                </button>
              </div>
            </div>
          )}
          <div className="mt-4 text-[10px] uppercase text-white/45 mb-1">Netlist</div>
          <NetList />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-10 text-white/55">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 outline-none font-mono"
      />
    </label>
  );
}

function CompView({
  id,
  selected,
  onSelect,
  onMove,
  onPad,
  toMM,
  visibleLayers,
}: {
  id: string;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onPad: (pad: string, at: { x: number; y: number }) => void;
  toMM: (e: { clientX: number; clientY: number }) => { x: number; y: number };
  visibleLayers: Record<string, boolean>;
}) {
  const comp = usePCBStore((s) => s.board.components.find((c) => c.id === id));
  const drag = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);
  if (!comp) return null;
  const fp = getFootprint(comp.footprintId);
  if (!fp) return null;

  const onBodyDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
    const m = toMM(e);
    drag.current = { ox: m.x, oy: m.y, px: comp.x, py: comp.y };
    const mv = (ev: MouseEvent) => {
      if (!drag.current) return;
      const mm = toMM(ev);
      onMove(drag.current.px + (mm.x - drag.current.ox), drag.current.py + (mm.y - drag.current.oy));
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener('mousemove', mv);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
  };

  const silk = visibleLayers['silkscreen'];
  return (
    <g transform={`translate(${comp.x * PXMM}, ${comp.y * PXMM})`}>
      {silk && (
        <rect
          x={(-fp.body.w / 2) * PXMM}
          y={(-fp.body.h / 2) * PXMM}
          width={fp.body.w * PXMM}
          height={fp.body.h * PXMM}
          transform={`rotate(${comp.rot})`}
          fill={selected ? 'rgba(10,132,255,0.18)' : 'rgba(255,255,255,0.05)'}
          stroke={selected ? '#0A84FF' : 'rgba(230,230,230,0.55)'}
          strokeWidth={1}
          rx={2}
          onMouseDown={onBodyDown}
          style={{ cursor: 'move' }}
        />
      )}
      {silk && (
        <text
          y={-fp.body.h * PXMM * 0.5 - 3}
          textAnchor="middle"
          fontSize={9}
          fill="rgba(230,230,230,0.8)"
          fontFamily="JetBrains Mono, monospace"
          pointerEvents="none"
        >
          {comp.ref}
        </text>
      )}
      {fp.pads.map((pd) => {
        const r = rotateOffset(pd.dx, pd.dy, comp.rot);
        const px = r.x * PXMM;
        const py = r.y * PXMM;
        const visible =
          pd.through ||
          visibleLayers[comp.layer === 'top-copper' ? 'top-copper' : 'bottom-copper'];
        if (!visible) return null;
        return (
          <g key={pd.name}>
            <rect
              x={px - (pd.w * PXMM) / 2}
              y={py - (pd.h * PXMM) / 2}
              width={pd.w * PXMM}
              height={pd.h * PXMM}
              rx={pd.shape === 'circle' ? pd.w * PXMM : 2}
              fill={pd.through ? '#d8b24a' : comp.layer === 'top-copper' ? '#e0533a' : '#3a7be0'}
              stroke="#1a1a1a"
              strokeWidth={0.5}
              onMouseDown={(e) => {
                e.stopPropagation();
                onPad(pd.name, { x: comp.x + r.x, y: comp.y + r.y });
              }}
              style={{ cursor: 'crosshair' }}
            >
              <title>{`${comp.ref}.${pd.name}`}</title>
            </rect>
            {pd.through && (
              <circle cx={px} cy={py} r={(pd.w * PXMM) / 4} fill="#0c2417" pointerEvents="none" />
            )}
          </g>
        );
      })}
    </g>
  );
}

function Ratsnest() {
  const rev = usePCBStore((s) => s.rev);
  const nets = usePCBStore.getState().computeNets();
  const board = usePCBStore.getState().board;
  void rev;
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const net of nets) {
    // connect consecutive pins in a net that aren't already trace-joined visually
    const pts = net
      .map((pin) => {
        const [cid, pad] = pin.split(':');
        const c = board.components.find((k) => k.id === cid);
        return c ? padWorld(c, pad) : null;
      })
      .filter(Boolean) as { x: number; y: number }[];
    for (let i = 1; i < pts.length; i++) {
      lines.push({
        x1: pts[i - 1].x * PXMM,
        y1: pts[i - 1].y * PXMM,
        x2: pts[i].x * PXMM,
        y2: pts[i].y * PXMM,
      });
    }
  }
  return (
    <g pointerEvents="none">
      {lines.map((l, i) => (
        <line
          key={i}
          {...l}
          stroke="rgba(120,220,160,0.25)"
          strokeWidth={0.75}
          strokeDasharray="2 3"
        />
      ))}
    </g>
  );
}

function NetList() {
  const rev = usePCBStore((s) => s.rev);
  void rev;
  const nets = usePCBStore.getState().computeNets();
  const board = usePCBStore.getState().board;
  if (!nets.length) return <div className="text-xs text-white/40">No nets yet.</div>;
  return (
    <div className="space-y-1.5">
      {nets.map((net, i) => (
        <div key={i} className="bg-white/5 rounded-md px-2 py-1 text-[11px]">
          <div className="text-accent font-mono">Net {i + 1}</div>
          <div className="text-white/55 font-mono truncate">
            {net
              .map((pin) => {
                const [cid, pad] = pin.split(':');
                const c = board.components.find((k) => k.id === cid);
                return c ? `${c.ref}.${pad}` : pin;
              })
              .join(' · ')}
          </div>
        </div>
      ))}
    </div>
  );
}

const module: AppModule = {
  manifest: {
    id: 'pcbdesign',
    name: 'PCBForge',
    description: 'Custom PCB layout editor — footprints, copper routing, nets',
    icon: CircuitBoard,
    defaultSize: { width: 1080, height: 680 },
    accent: 'linear-gradient(135deg, #16a34a 0%, #0d9488 100%)',
  },
  Component: PCBDesign,
};

export default module;
