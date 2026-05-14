import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Activity,
  Trash2,
  Plus,
  Download,
  BookOpen,
  ChevronDown,
} from 'lucide-react';
import { CircuitSimIcon } from '@/apps/icons';
import type { AppModule } from '@/os/types';
import {
  COMPONENT_SPECS,
  useCircuitSimStore,
  buildNodes,
} from '@/store/circuitSimStore';
import type { CompType, CircuitComp } from '@/lib/circuitSolver/types';
import { useAppTools } from '@/hooks/useToolRegistry';
import { publishAppState } from '@/ai/screenScanner';
import { CIRCUIT_PRESETS, type CircuitPreset } from '@/lib/circuitSolver/presets';

const PALETTE_ORDER: CompType[] = [
  'resistor',
  'capacitor',
  'inductor',
  'vsource',
  'vsource_ac',
  'isource',
  'diode',
  'ground',
];

function CircuitSim({ appId }: { appId: string }) {
  const components = useCircuitSimStore((s) => s.components);
  const selectedId = useCircuitSimStore((s) => s.selectedId);
  const wiringFrom = useCircuitSimStore((s) => s.wiringFrom);
  const probes = useCircuitSimStore((s) => s.probes);
  const dc = useCircuitSimStore((s) => s.dc);
  const transient = useCircuitSimStore((s) => s.transient);
  const scopeMode = useCircuitSimStore((s) => s.scopeMode);
  const duration = useCircuitSimStore((s) => s.duration);
  const dt = useCircuitSimStore((s) => s.dt);

  const addComponent = useCircuitSimStore((s) => s.addComponent);
  const removeComponent = useCircuitSimStore((s) => s.removeComponent);
  const moveComponent = useCircuitSimStore((s) => s.moveComponent);
  const setSelected = useCircuitSimStore((s) => s.setSelected);
  const setValue = useCircuitSimStore((s) => s.setValue);
  const beginWire = useCircuitSimStore((s) => s.beginWire);
  const cancelWire = useCircuitSimStore((s) => s.cancelWire);
  const completeWire = useCircuitSimStore((s) => s.completeWire);
  const addProbe = useCircuitSimStore((s) => s.addProbe);
  const removeProbe = useCircuitSimStore((s) => s.removeProbe);
  const runDC = useCircuitSimStore((s) => s.runDC);
  const runTransient = useCircuitSimStore((s) => s.runTransient);
  const setScopeMode = useCircuitSimStore((s) => s.setScopeMode);
  const setDuration = useCircuitSimStore((s) => s.setDuration);
  const setDt = useCircuitSimStore((s) => s.setDt);
  const clear = useCircuitSimStore((s) => s.clear);

  const selected = selectedId ? components.find((c) => c.id === selectedId) ?? null : null;

  // Publish for AI scanner
  useEffect(() => {
    return publishAppState(appId, () => ({
      summary: `CircuitSim has ${components.filter((c) => c.type !== 'wire').length} components and ${components.filter((c) => c.type === 'wire').length} wires. ${probes.length} probe(s). Last DC result: ${dc ? 'available' : 'none'}.`,
      state: {
        components: components.map((c) => ({
          id: c.id,
          type: c.type,
          x: c.x,
          y: c.y,
          value: c.value,
          freq: c.freq,
        })),
        probes: probes.map((p) => ({ node: p.node })),
        dc,
      },
    }));
  }, [appId, components, probes, dc]);

  // AI tools
  useAppTools(appId, [
    {
      toolName: 'add_component',
      description:
        'Add an analog component. type: resistor | capacitor | inductor | vsource | vsource_ac | isource | diode | ground. value is in SI base units (Ω, F, H, V, A). Returns the component id and the pin ids you can connect.',
      input_schema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: PALETTE_ORDER as unknown as string[],
          },
          x: { type: 'number' },
          y: { type: 'number' },
          value: { type: 'number' },
          freq: { type: 'number' },
        },
        required: ['type', 'x', 'y'],
      },
      handler: ({ type, x, y, value, freq }: any) => {
        const id = addComponent(type as CompType, Number(x), Number(y));
        if (value !== undefined || freq !== undefined) {
          setValue(id, Number(value ?? COMPONENT_SPECS[type as CompType].defaultValue), freq !== undefined ? Number(freq) : undefined);
        }
        const c = useCircuitSimStore.getState().components.find((x) => x.id === id)!;
        return { id, pins: c.pins };
      },
    },
    {
      toolName: 'connect_nodes',
      description: 'Wire two pin ids together. Pin ids look like "<componentId>.<pinName>".',
      input_schema: {
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'string' },
        },
        required: ['a', 'b'],
      },
      handler: ({ a, b }: any) => {
        useCircuitSimStore.getState().beginWire(String(a));
        useCircuitSimStore.getState().completeWire(String(b));
        return { ok: true };
      },
    },
    {
      toolName: 'run_dc_analysis',
      description: 'Solve the DC operating point. Returns node voltages and branch currents.',
      input_schema: { type: 'object', properties: {} },
      handler: () => runDC(),
    },
    {
      toolName: 'run_transient',
      description: 'Solve transient analysis. duration in s, dt in s. Returns t and node voltage arrays.',
      input_schema: {
        type: 'object',
        properties: {
          duration: { type: 'number' },
          dt: { type: 'number' },
        },
        required: ['duration', 'dt'],
      },
      handler: ({ duration: d, dt: t }: any) => {
        setDuration(Number(d));
        setDt(Number(t));
        const r = runTransient();
        // Return a thinned-out version so we don't send megabytes back through the model
        const stride = Math.max(1, Math.floor(r.t.length / 200));
        const t_ = r.t.filter((_, i) => i % stride === 0);
        const nv: Record<string, number[]> = {};
        for (const [k, arr] of Object.entries(r.nodeVoltages)) {
          nv[k] = arr.filter((_, i) => i % stride === 0);
        }
        return { t: t_, nodeVoltages: nv };
      },
    },
    {
      toolName: 'probe',
      description: 'Add an oscilloscope probe on a node. node id is one of the canonicalized node ids returned by run_dc_analysis.',
      input_schema: {
        type: 'object',
        properties: { node: { type: 'string' } },
        required: ['node'],
      },
      handler: ({ node }: any) => {
        addProbe(String(node));
        return { ok: true };
      },
    },
    {
      toolName: 'clear_circuit',
      description: 'Remove all components and probes.',
      input_schema: { type: 'object', properties: {} },
      handler: () => {
        clear();
        return { ok: true };
      },
    },
  ]);

  return (
    <div className="flex h-full">
      {/* Palette */}
      <div className="w-32 shrink-0 border-r border-white/10 bg-black/20 p-2 chrome flex flex-col gap-1 overflow-y-auto">
        <div className="text-[10px] uppercase tracking-wide text-white/45 px-1 pb-1">Components</div>
        {PALETTE_ORDER.map((t) => {
          const spec = COMPONENT_SPECS[t];
          return (
            <button
              key={t}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/x-engos-comp', t)}
              onClick={() => addComponent(t, 120, 120)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-left text-xs"
            >
              <span className="w-6 h-6 rounded bg-white/10 flex items-center justify-center text-[11px] font-mono">
                {spec.symbol}
              </span>
              <span className="truncate">{spec.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="h-9 px-2 flex items-center gap-1 border-b border-white/10 chrome">
          <button
            onClick={() => {
              try {
                runDC();
                import('@/store/toastStore').then(({ toast }) =>
                  toast.success('DC operating point', 'Solved.'),
                );
              } catch (e) {
                import('@/store/toastStore').then(({ toast }) =>
                  toast.error('DC solve failed', (e as Error).message),
                );
              }
            }}
            className="flex items-center gap-1 px-2 h-6 rounded-md text-xs bg-accent hover:bg-accent-hover text-white"
          >
            <Play size={12} /> DC
          </button>
          <button
            onClick={() => {
              try {
                runTransient();
                import('@/store/toastStore').then(({ toast }) =>
                  toast.success('Transient analysis', 'Done.'),
                );
              } catch (e) {
                import('@/store/toastStore').then(({ toast }) =>
                  toast.error('Transient failed', (e as Error).message),
                );
              }
            }}
            className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
          >
            <Activity size={12} /> Transient
          </button>
          <div className="ml-2 flex items-center gap-1 text-[11px] text-white/65">
            duration
            <input
              type="number"
              value={duration}
              step={1e-3}
              min={1e-6}
              onChange={(e) => setDuration(parseFloat(e.target.value) || 1e-3)}
              className="w-20 bg-white/5 border border-white/10 rounded px-1 py-0.5 font-mono text-xs outline-none"
            />
            s · dt
            <input
              type="number"
              value={dt}
              step={1e-5}
              min={1e-9}
              onChange={(e) => setDt(parseFloat(e.target.value) || 1e-5)}
              className="w-20 bg-white/5 border border-white/10 rounded px-1 py-0.5 font-mono text-xs outline-none"
            />
            s
          </div>
          <div className="ml-auto flex items-center gap-1">
            <PresetMenu
              onPick={(preset) => {
                useCircuitSimStore.getState().clear();
                const store = useCircuitSimStore.getState();
                const idMap = new Map<string, string>();
                for (const c of preset.components) {
                  const newId = store.addComponent(c.type, c.x, c.y);
                  idMap.set(c.id, newId);
                  store.setValue(newId, c.value, c.freq);
                }
                for (const [a, b] of preset.wires) {
                  const remap = (s: string) => {
                    const [cid, p] = s.split('.');
                    const r = idMap.get(cid);
                    return r ? `${r}.${p}` : s;
                  };
                  store.beginWire(remap(a));
                  store.completeWire(remap(b));
                }
              }}
            />
            <button
              onClick={clear}
              className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
              title="Clear circuit"
            >
              <Trash2 size={12} /> Clear
            </button>
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
          <CircuitCanvas
            components={components}
            selectedId={selectedId}
            wiringFrom={wiringFrom}
            onSelect={(id) => setSelected(id)}
            onMove={moveComponent}
            onDropType={(t, x, y) => addComponent(t, x, y)}
            onPinClick={(pin) => {
              if (wiringFrom) completeWire(pin);
              else beginWire(pin);
            }}
            onCancelWire={cancelWire}
            onDelete={removeComponent}
          />
          <Oscilloscope
            transient={transient}
            probes={probes}
            mode={scopeMode}
            setMode={setScopeMode}
            removeProbe={removeProbe}
          />
        </div>
      </div>

      {/* Right column: properties + nodes */}
      <div className="w-56 shrink-0 border-l border-white/10 bg-black/25 flex flex-col chrome">
        <div className="p-3 border-b border-white/10">
          <div className="text-[10px] uppercase text-white/45 mb-2">Selection</div>
          {!selected ? (
            <div className="text-xs text-white/45">Select a component</div>
          ) : (
            <SelectedProps comp={selected} onValue={(v, f) => setValue(selected.id, v, f)} onDelete={() => removeComponent(selected.id)} />
          )}
        </div>

        <div className="p-3 overflow-y-auto flex-1">
          <div className="text-[10px] uppercase text-white/45 mb-1">Nodes & probes</div>
          <NodesList onProbe={(n) => addProbe(n)} />
        </div>
      </div>
    </div>
  );
}

function SelectedProps({
  comp,
  onValue,
  onDelete,
}: {
  comp: CircuitComp;
  onValue: (v: number, freq?: number) => void;
  onDelete: () => void;
}) {
  const spec = COMPONENT_SPECS[comp.type];
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-white/75">{spec.label}</span>
        <span className="font-mono text-[10px] text-white/40">{comp.id}</span>
      </div>
      {spec.unit && (
        <label className="flex items-center gap-2">
          <span className="w-10 text-white/55">{spec.unit}</span>
          <input
            type="number"
            value={comp.value}
            step={spec.defaultValue / 10 || 1}
            onChange={(e) => onValue(parseFloat(e.target.value) || 0, comp.freq)}
            className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 font-mono outline-none"
          />
        </label>
      )}
      {comp.type === 'vsource_ac' && (
        <label className="flex items-center gap-2">
          <span className="w-10 text-white/55">Hz</span>
          <input
            type="number"
            value={comp.freq ?? 60}
            step={1}
            onChange={(e) => onValue(comp.value, parseFloat(e.target.value) || 60)}
            className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 font-mono outline-none"
          />
        </label>
      )}
      <button
        onClick={onDelete}
        className="w-full px-2 py-1 rounded-md bg-traffic-red/20 hover:bg-traffic-red/40 text-traffic-red text-xs"
      >
        Delete
      </button>
    </div>
  );
}

function NodesList({ onProbe }: { onProbe: (n: string) => void }) {
  const components = useCircuitSimStore((s) => s.components);
  const dc = useCircuitSimStore((s) => s.dc);
  const probes = useCircuitSimStore((s) => s.probes);
  const removeProbe = useCircuitSimStore((s) => s.removeProbe);
  const nodes = useMemo(() => buildNodes(components).nodes, [components]);
  if (!nodes.length) return <div className="text-xs text-white/45">No nodes yet.</div>;
  return (
    <div className="space-y-1 text-xs">
      {nodes.map((n) => {
        const v = dc?.nodeVoltages[n];
        const probe = probes.find((p) => p.node === n);
        return (
          <div key={n} className="flex items-center gap-1 bg-white/5 rounded-md px-1.5 py-1">
            <span className="font-mono truncate flex-1 text-[11px]">{n.split('.')[0]}</span>
            <span className="font-mono text-[11px] text-white/65 tabular-nums">
              {v !== undefined ? `${v.toFixed(3)} V` : ''}
            </span>
            {probe ? (
              <button
                onClick={() => removeProbe(probe.id)}
                title="Remove probe"
                className="w-5 h-5 rounded-sm"
                style={{ background: probe.color }}
              />
            ) : (
              <button
                onClick={() => onProbe(n)}
                title="Add probe"
                className="w-5 h-5 rounded-sm bg-white/10 hover:bg-white/20 flex items-center justify-center"
              >
                <Plus size={10} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* Canvas */
function CircuitCanvas({
  components,
  selectedId,
  wiringFrom,
  onSelect,
  onMove,
  onDropType,
  onPinClick,
  onCancelWire,
  onDelete,
}: {
  components: CircuitComp[];
  selectedId: string | null;
  wiringFrom: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onDropType: (t: CompType, x: number, y: number) => void;
  onPinClick: (pinId: string) => void;
  onCancelWire: () => void;
  onDelete: (id: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 600, h: 400 });

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && wiringFrom) onCancelWire();
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && document.activeElement?.tagName !== 'INPUT') {
        onDelete(selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wiringFrom, selectedId, onCancelWire, onDelete]);

  // Pin positions per component
  const pinPos = (c: CircuitComp, pin: string): { x: number; y: number } => {
    const spec = COMPONENT_SPECS[c.type];
    if (c.type === 'ground') return { x: c.x + spec.width / 2, y: c.y };
    if (c.type === 'diode') {
      return pin === 'a' ? { x: c.x, y: c.y + spec.height / 2 } : { x: c.x + spec.width, y: c.y + spec.height / 2 };
    }
    if (c.type === 'vsource' || c.type === 'vsource_ac' || c.type === 'isource') {
      return pin === 'p' ? { x: c.x + spec.width / 2, y: c.y } : { x: c.x + spec.width / 2, y: c.y + spec.height };
    }
    // R / C / L (horizontal)
    return pin === 'a' ? { x: c.x, y: c.y + spec.height / 2 } : { x: c.x + spec.width, y: c.y + spec.height / 2 };
  };

  // Helpers
  const screenToCanvas = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <svg
      ref={svgRef}
      className="flex-1"
      style={{ background: '#0b1020' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const t = e.dataTransfer.getData('text/x-engos-comp') as CompType;
        if (!t) return;
        const p = screenToCanvas(e);
        onDropType(t, p.x, p.y);
      }}
      onMouseMove={(e) => setCursor(screenToCanvas(e))}
      onMouseDown={(e) => {
        if ((e.target as SVGElement).tagName === 'svg') {
          if (wiringFrom) onCancelWire();
          onSelect(null);
        }
      }}
    >
      <defs>
        <pattern id="ckt-grid" width={20} height={20} patternUnits="userSpaceOnUse">
          <circle cx={1} cy={1} r={0.7} fill="rgba(255,255,255,0.16)" />
        </pattern>
      </defs>
      <rect width={size.w} height={size.h} fill="url(#ckt-grid)" />

      {/* Wires */}
      {components
        .filter((c) => c.type === 'wire')
        .map((w) => {
          // Find pin coords for w.pins.a and w.pins.b
          const [aId, aPin] = (w.pins.a ?? '').split('.');
          const [bId, bPin] = (w.pins.b ?? '').split('.');
          const a = components.find((c) => c.id === aId);
          const b = components.find((c) => c.id === bId);
          if (!a || !b) return null;
          const ap = pinPos(a, aPin);
          const bp = pinPos(b, bPin);
          // Manhattan route
          const mid = { x: (ap.x + bp.x) / 2, y: ap.y };
          return (
            <path
              key={w.id}
              d={`M ${ap.x},${ap.y} L ${mid.x},${ap.y} L ${mid.x},${bp.y} L ${bp.x},${bp.y}`}
              stroke="#94a3b8"
              strokeWidth={1.5}
              fill="none"
              onClick={(e) => {
                e.stopPropagation();
                if (e.shiftKey) onDelete(w.id);
              }}
              style={{ cursor: 'pointer' }}
            >
              <title>shift-click to delete</title>
            </path>
          );
        })}

      {/* Wire-in-progress */}
      {wiringFrom && cursor && (() => {
        const [cid, pin] = wiringFrom.split('.');
        const comp = components.find((c) => c.id === cid);
        if (!comp) return null;
        const p = pinPos(comp, pin);
        return (
          <path
            d={`M ${p.x},${p.y} L ${cursor.x},${p.y} L ${cursor.x},${cursor.y}`}
            stroke="#0A84FF"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            fill="none"
            pointerEvents="none"
          />
        );
      })()}

      {/* Components */}
      {components
        .filter((c) => c.type !== 'wire')
        .map((c) => (
          <CompShape
            key={c.id}
            comp={c}
            selected={c.id === selectedId}
            onSelect={() => onSelect(c.id)}
            onMove={(nx, ny) => onMove(c.id, nx, ny)}
            onPinClick={(pin) => onPinClick(`${c.id}.${pin}`)}
            screenToCanvas={screenToCanvas}
          />
        ))}

      <text
        x={8}
        y={size.h - 8}
        fill="rgba(255,255,255,0.45)"
        fontSize={10}
        fontFamily="JetBrains Mono, monospace"
        pointerEvents="none"
      >
        drag from palette · click-out then click-in to wire · shift-click wire to delete · del to delete component
      </text>
    </svg>
  );
}

function CompShape({
  comp,
  selected,
  onSelect,
  onMove,
  onPinClick,
  screenToCanvas,
}: {
  comp: CircuitComp;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onPinClick: (pin: string) => void;
  screenToCanvas: (e: { clientX: number; clientY: number }) => { x: number; y: number };
}) {
  const spec = COMPONENT_SPECS[comp.type];
  const dragRef = useRef<{ ox: number; oy: number; px: number; py: number; moved: boolean } | null>(null);
  const stroke = selected ? '#0A84FF' : 'rgba(255,255,255,0.55)';

  const onBodyDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
    const p = screenToCanvas(e);
    dragRef.current = { ox: p.x, oy: p.y, px: comp.x, py: comp.y, moved: false };
    const onMv = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const np = screenToCanvas(ev);
      onMove(dragRef.current.px + np.x - dragRef.current.ox, dragRef.current.py + np.y - dragRef.current.oy);
      dragRef.current.moved = true;
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMv);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMv);
    window.addEventListener('mouseup', onUp);
  };

  const pinPoints = spec.pins.map((pin) => {
    let x = 0;
    let y = 0;
    if (comp.type === 'ground') {
      x = spec.width / 2;
      y = 0;
    } else if (comp.type === 'diode') {
      x = pin === 'a' ? 0 : spec.width;
      y = spec.height / 2;
    } else if (comp.type === 'vsource' || comp.type === 'vsource_ac' || comp.type === 'isource') {
      x = spec.width / 2;
      y = pin === 'p' ? 0 : spec.height;
    } else {
      x = pin === 'a' ? 0 : spec.width;
      y = spec.height / 2;
    }
    return { name: pin, x, y };
  });

  return (
    <g transform={`translate(${comp.x}, ${comp.y})`}>
      {/* Body */}
      {comp.type === 'ground' ? (
        <g onMouseDown={onBodyDown} style={{ cursor: 'move' }}>
          <line x1={spec.width / 2} y1={0} x2={spec.width / 2} y2={8} stroke={stroke} strokeWidth={1.4} />
          <line x1={4} y1={8} x2={spec.width - 4} y2={8} stroke={stroke} strokeWidth={1.4} />
          <line x1={9} y1={14} x2={spec.width - 9} y2={14} stroke={stroke} strokeWidth={1.4} />
          <line x1={13} y1={20} x2={spec.width - 13} y2={20} stroke={stroke} strokeWidth={1.4} />
        </g>
      ) : comp.type === 'vsource' || comp.type === 'vsource_ac' || comp.type === 'isource' ? (
        <g onMouseDown={onBodyDown} style={{ cursor: 'move' }}>
          <circle cx={spec.width / 2} cy={spec.height / 2} r={spec.width / 2 - 4} fill="rgba(255,255,255,0.04)" stroke={stroke} strokeWidth={1.4} />
          <text
            x={spec.width / 2}
            y={spec.height / 2 + 4}
            textAnchor="middle"
            fontSize={11}
            fill="white"
            fontFamily="JetBrains Mono, monospace"
            pointerEvents="none"
          >
            {spec.symbol}
          </text>
          <text x={spec.width / 2} y={spec.height + 12} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.65)" fontFamily="JetBrains Mono, monospace" pointerEvents="none">
            {fmtValue(comp.value, spec.unit)}{comp.type === 'vsource_ac' ? `@${comp.freq}Hz` : ''}
          </text>
        </g>
      ) : comp.type === 'diode' ? (
        <g onMouseDown={onBodyDown} style={{ cursor: 'move' }}>
          <polygon points={`6,4 ${spec.width - 6},${spec.height / 2} 6,${spec.height - 4}`} fill="rgba(255,255,255,0.08)" stroke={stroke} strokeWidth={1.4} />
          <line x1={spec.width - 6} y1={4} x2={spec.width - 6} y2={spec.height - 4} stroke={stroke} strokeWidth={1.5} />
        </g>
      ) : (
        <g onMouseDown={onBodyDown} style={{ cursor: 'move' }}>
          <rect width={spec.width} height={spec.height} rx={4} fill="rgba(255,255,255,0.05)" stroke={stroke} strokeWidth={1.4} />
          <text
            x={spec.width / 2}
            y={spec.height / 2 + 4}
            textAnchor="middle"
            fontSize={11}
            fill="white"
            fontFamily="JetBrains Mono, monospace"
            pointerEvents="none"
          >
            {spec.symbol}
          </text>
          <text x={spec.width / 2} y={spec.height + 12} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.65)" fontFamily="JetBrains Mono, monospace" pointerEvents="none">
            {fmtValue(comp.value, spec.unit)}
          </text>
        </g>
      )}

      {pinPoints.map((p) => (
        <circle
          key={p.name}
          cx={p.x}
          cy={p.y}
          r={4}
          fill="#475569"
          stroke="#0f172a"
          strokeWidth={1}
          onMouseDown={(e) => {
            e.stopPropagation();
            onPinClick(p.name);
          }}
          style={{ cursor: 'crosshair' }}
        >
          <title>{p.name}</title>
        </circle>
      ))}
    </g>
  );
}

function fmtValue(v: number, unit: string): string {
  if (!unit) return '';
  const absV = Math.abs(v);
  if (absV >= 1e9) return `${(v / 1e9).toFixed(1)}G${unit}`;
  if (absV >= 1e6) return `${(v / 1e6).toFixed(1)}M${unit}`;
  if (absV >= 1e3) return `${(v / 1e3).toFixed(2)}k${unit}`;
  if (absV >= 1) return `${v.toFixed(2)}${unit}`;
  if (absV >= 1e-3) return `${(v * 1e3).toFixed(2)}m${unit}`;
  if (absV >= 1e-6) return `${(v * 1e6).toFixed(1)}µ${unit}`;
  if (absV >= 1e-9) return `${(v * 1e9).toFixed(1)}n${unit}`;
  return `${v.toExponential(2)}${unit}`;
}

/* Oscilloscope */
function Oscilloscope({
  transient,
  probes,
  mode,
  setMode,
  removeProbe,
}: {
  transient: ReturnType<typeof useCircuitSimStore.getState>['transient'];
  probes: ReturnType<typeof useCircuitSimStore.getState>['probes'];
  mode: 'time' | 'fft';
  setMode: (m: 'time' | 'fft') => void;
  removeProbe: (id: string) => void;
}) {
  const W = 320;
  const H = 240;
  const PAD = 28;

  const exportCSV = () => {
    if (!transient || !probes.length) return;
    const cols = ['t', ...probes.map((p) => p.node)];
    const lines = [cols.join(',')];
    for (let i = 0; i < transient.t.length; i++) {
      const row = [transient.t[i]];
      for (const p of probes) row.push(transient.nodeVoltages[p.node]?.[i] ?? 0);
      lines.push(row.join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scope.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Determine y-axis range
  let yMin = -1,
    yMax = 1;
  if (transient && probes.length) {
    yMin = Infinity;
    yMax = -Infinity;
    for (const p of probes) {
      const arr = transient.nodeVoltages[p.node] ?? [];
      for (const v of arr) {
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }
    if (yMin === yMax) {
      yMin -= 1;
      yMax += 1;
    } else {
      const pad = (yMax - yMin) * 0.1;
      yMin -= pad;
      yMax += pad;
    }
  }

  const tMin = transient?.t[0] ?? 0;
  const tMax = transient ? transient.t[transient.t.length - 1] : 1;

  const xp = (t: number) => PAD + ((t - tMin) / (tMax - tMin || 1)) * (W - 2 * PAD);
  const yp = (v: number) => H - PAD - ((v - yMin) / (yMax - yMin || 1)) * (H - 2 * PAD);

  return (
    <div className="w-80 shrink-0 border-l border-white/10 bg-black/30 flex flex-col chrome">
      <div className="h-9 flex items-center px-2 gap-1 border-b border-white/10">
        <div className="text-[11px] font-semibold">Oscilloscope</div>
        <div className="ml-2 flex">
          {(['time', 'fft'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2 h-6 text-[11px] rounded-md ${
                mode === m ? 'bg-accent text-white' : 'hover:bg-white/10 text-white/65'
              }`}
            >
              {m === 'time' ? 'time' : 'FFT'}
            </button>
          ))}
        </div>
        <button
          onClick={exportCSV}
          className="ml-auto p-1 rounded hover:bg-white/10"
          title="Export CSV"
        >
          <Download size={12} />
        </button>
      </div>
      <div className="p-2 flex-1 overflow-y-auto">
        {probes.length === 0 && (
          <div className="text-xs text-white/45 text-center mt-6">
            Add probes from the nodes panel.
          </div>
        )}
        {probes.length > 0 && (
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
            {/* Axes */}
            <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="rgba(255,255,255,0.3)" />
            <line x1={PAD} y1={PAD / 2} x2={PAD} y2={H - PAD} stroke="rgba(255,255,255,0.3)" />
            {/* Zero line */}
            {yMin < 0 && yMax > 0 && (
              <line x1={PAD} y1={yp(0)} x2={W - PAD} y2={yp(0)} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />
            )}
            {/* Tick labels */}
            <text x={PAD - 4} y={PAD / 2 + 4} fill="rgba(255,255,255,0.55)" fontSize={9} fontFamily="monospace" textAnchor="end">
              {yMax.toFixed(2)}
            </text>
            <text x={PAD - 4} y={H - PAD + 4} fill="rgba(255,255,255,0.55)" fontSize={9} fontFamily="monospace" textAnchor="end">
              {yMin.toFixed(2)}
            </text>
            <text x={W - PAD} y={H - PAD + 12} fill="rgba(255,255,255,0.55)" fontSize={9} fontFamily="monospace" textAnchor="end">
              {tMax.toExponential(1)}s
            </text>

            {transient &&
              probes.map((p) => {
                const arr = transient.nodeVoltages[p.node] ?? [];
                if (mode === 'fft') {
                  const fft = quickFFT(arr.slice(0, 256));
                  const norm = fft.map((c) => Math.hypot(c[0], c[1]));
                  const max = Math.max(...norm) || 1;
                  const path = norm
                    .slice(0, fft.length / 2)
                    .map((m, i) => {
                      const x = PAD + (i / (fft.length / 2)) * (W - 2 * PAD);
                      const y = H - PAD - (m / max) * (H - 2 * PAD);
                      return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
                    })
                    .join(' ');
                  return <path key={p.id} d={path} stroke={p.color} strokeWidth={1.2} fill="none" />;
                }
                const path = arr
                  .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xp(transient.t[i])},${yp(v)}`)
                  .join(' ');
                return <path key={p.id} d={path} stroke={p.color} strokeWidth={1.4} fill="none" />;
              })}

            {/* Legend */}
            {probes.map((p, i) => (
              <g key={p.id} transform={`translate(${PAD + 4}, ${PAD / 2 + 2 + i * 12})`}>
                <rect width={9} height={9} fill={p.color} />
                <text x={14} y={9} fill="white" fontSize={9} fontFamily="monospace">
                  {p.node.split('.')[0]}
                </text>
              </g>
            ))}
          </svg>
        )}

        {/* Probe management */}
        <div className="mt-3 space-y-1">
          {probes.map((p) => (
            <div key={p.id} className="flex items-center gap-1.5 bg-white/5 rounded-md px-2 py-1 text-xs">
              <span className="w-3 h-3 rounded-sm" style={{ background: p.color }} />
              <span className="font-mono text-[11px] truncate flex-1">{p.node.split('.')[0]}</span>
              <button onClick={() => removeProbe(p.id)} className="text-white/55 hover:text-white">
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Naive DFT for short signals (FFT toggle) — N up to 256 so this is fine. */
function quickFFT(input: number[]): Array<[number, number]> {
  const N = input.length;
  const out: Array<[number, number]> = [];
  for (let k = 0; k < N; k++) {
    let re = 0,
      im = 0;
    for (let n = 0; n < N; n++) {
      const phi = (-2 * Math.PI * k * n) / N;
      re += input[n] * Math.cos(phi);
      im += input[n] * Math.sin(phi);
    }
    out.push([re / N, im / N]);
  }
  return out;
}

function PresetMenu({ onPick }: { onPick: (p: CircuitPreset) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
      >
        <BookOpen size={12} /> Templates <ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 glass-strong rounded-md min-w-[240px] py-1 z-30 shadow-window">
          {CIRCUIT_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onPick(p);
                setOpen(false);
              }}
              title={p.description}
              className="block w-full text-left px-2 py-1 text-xs hover:bg-white/10"
            >
              <div className="font-medium text-white">{p.name}</div>
              <div className="text-[10px] text-white/50 truncate">{p.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const module: AppModule = {
  manifest: {
    id: 'circuitsim',
    name: 'CircuitSim',
    description: 'Analog circuits with MNA solver, transient analysis, scope',
    icon: CircuitSimIcon,
    defaultSize: { width: 1100, height: 680 },
    accent: 'linear-gradient(135deg, #facc15 0%, #f97316 100%)',
  },
  Component: CircuitSim,
};

export default module;
