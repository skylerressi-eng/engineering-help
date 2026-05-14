import { useEffect, useRef, useState } from 'react';
import { Play, Pause, StepForward, Trash2, Shuffle, Sparkles, Grid3x3 } from 'lucide-react';
import type { AppModule } from '@/os/types';
import {
  PATTERNS,
  clear as clearGrid,
  countAlive,
  findPattern,
  makeGrid,
  randomFill,
  stamp,
  step as stepGrid,
  toggleCell,
  type ConwayGrid,
  type Pattern,
} from '@/lib/conway/engine';
import { useAppTools } from '@/hooks/useToolRegistry';
import { publishAppState } from '@/ai/screenScanner';

function ConwayApp({ appId }: { appId: string }) {
  const [W, setW] = useState(64);
  const [H, setH] = useState(40);
  const [running, setRunning] = useState(false);
  const [tickHz, setTickHz] = useState(8);
  const [wrap, setWrap] = useState(true);
  const [generation, setGeneration] = useState(0);
  const [alive, setAlive] = useState(0);
  const [pickedPattern, setPickedPattern] = useState<Pattern | null>(null);
  const gridRef = useRef<ConwayGrid>(makeGrid(W, H, wrap));
  const tickAcc = useRef(0);
  const lastTime = useRef(performance.now());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cellPx, setCellPx] = useState(12);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  // Resize grid when W/H changes
  useEffect(() => {
    const oldG = gridRef.current;
    const next = makeGrid(W, H, wrap);
    // Copy as much old state as fits
    for (let y = 0; y < Math.min(H, oldG.H); y++) {
      for (let x = 0; x < Math.min(W, oldG.W); x++) {
        next.cells[y * W + x] = oldG.cells[y * oldG.W + x];
      }
    }
    gridRef.current = next;
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, wrap]);

  // Resize canvas to fit container, choose a sensible cell size
  useEffect(() => {
    const el = containerRef.current;
    const c = canvasRef.current;
    if (!el || !c) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const px = Math.max(4, Math.min(20, Math.floor(Math.min(r.width / W, r.height / H))));
      c.width = W * px;
      c.height = H * px;
      c.style.width = `${W * px}px`;
      c.style.height = `${H * px}px`;
      setCellPx(px);
      draw();
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H]);

  // Main loop
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      const dt = (now - lastTime.current) / 1000;
      lastTime.current = now;
      if (running) {
        tickAcc.current += dt;
        const period = 1 / Math.max(0.5, tickHz);
        while (tickAcc.current >= period) {
          const next = stepGrid(gridRef.current);
          gridRef.current.cells = next;
          tickAcc.current -= period;
          setGeneration((g) => g + 1);
        }
      }
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, tickHz]);

  // Publish state
  useEffect(() => {
    return publishAppState(appId, () => ({
      summary: `Conway's Game of Life: ${W}×${H} grid, generation ${generation}, ${alive} live cells. ${
        running ? 'running' : 'paused'
      } at ${tickHz} Hz. Edge mode: ${wrap ? 'toroidal' : 'finite'}.`,
      state: { W, H, generation, alive, running, tickHz, wrap },
    }));
  }, [appId, W, H, generation, alive, running, tickHz, wrap]);

  // AI tools
  useAppTools(appId, [
    {
      toolName: 'set_cell',
      description: "Set a cell at (x, y) to alive (1) or dead (0). Origin is top-left.",
      input_schema: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          value: { type: 'number' },
        },
        required: ['x', 'y', 'value'],
      },
      handler: ({ x, y, value }: any) => {
        const g = gridRef.current;
        const xi = Math.round(Number(x));
        const yi = Math.round(Number(y));
        if (xi < 0 || yi < 0 || xi >= g.W || yi >= g.H) {
          throw new Error('out of bounds');
        }
        g.cells[yi * g.W + xi] = Number(value) ? 1 : 0;
        setAlive(countAlive(g));
        return { ok: true };
      },
    },
    {
      toolName: 'run_generations',
      description: 'Advance the simulation by N generations and return the resulting alive count.',
      input_schema: {
        type: 'object',
        properties: { n: { type: 'number' } },
        required: ['n'],
      },
      handler: ({ n }: any) => {
        const g = gridRef.current;
        const steps = Math.max(1, Math.min(10000, Math.floor(Number(n))));
        for (let i = 0; i < steps; i++) g.cells = stepGrid(g);
        setGeneration((cur) => cur + steps);
        const a = countAlive(g);
        setAlive(a);
        return { generations: steps, alive: a };
      },
    },
    {
      toolName: 'load_pattern',
      description: `Stamp a known pattern at (x, y). Pattern id is one of: ${PATTERNS.map((p) => p.id).join(', ')}.`,
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          x: { type: 'number' },
          y: { type: 'number' },
        },
        required: ['id'],
      },
      handler: ({ id, x, y }: any) => {
        const p = findPattern(String(id));
        if (!p) throw new Error('unknown pattern');
        const ox = x !== undefined ? Math.round(Number(x)) : Math.floor((W - p.w) / 2);
        const oy = y !== undefined ? Math.round(Number(y)) : Math.floor((H - p.h) / 2);
        stamp(gridRef.current, p.cells, ox, oy);
        setAlive(countAlive(gridRef.current));
        return { ok: true };
      },
    },
    {
      toolName: 'clear_board',
      description: 'Clear every cell.',
      input_schema: { type: 'object', properties: {} },
      handler: () => {
        clearGrid(gridRef.current);
        setAlive(0);
        setGeneration(0);
        return { ok: true };
      },
    },
    {
      toolName: 'randomize',
      description: 'Randomly fill the board. probability defaults to 0.3.',
      input_schema: {
        type: 'object',
        properties: { probability: { type: 'number' } },
      },
      handler: ({ probability }: any) => {
        randomFill(gridRef.current, Number(probability ?? 0.3));
        setAlive(countAlive(gridRef.current));
        return { ok: true };
      },
    },
    {
      toolName: 'get_state',
      description: 'Return the grid size, generation count, and live-cell count.',
      input_schema: { type: 'object', properties: {} },
      handler: () => ({ W, H, generation, alive: countAlive(gridRef.current), running, tickHz }),
    },
  ]);

  function draw() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const g = gridRef.current;
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, c.width, c.height);
    // Grid lines
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    if (cellPx >= 8) {
      for (let x = 0; x <= g.W; x++) ctx.fillRect(x * cellPx, 0, 1, g.H * cellPx);
      for (let y = 0; y <= g.H; y++) ctx.fillRect(0, y * cellPx, g.W * cellPx, 1);
    }
    ctx.fillStyle = '#22d3ee';
    for (let y = 0; y < g.H; y++) {
      for (let x = 0; x < g.W; x++) {
        if (g.cells[y * g.W + x]) {
          ctx.fillRect(x * cellPx + 0.5, y * cellPx + 0.5, cellPx - 1, cellPx - 1);
        }
      }
    }
    // Pattern preview
    if (pickedPattern && hover) {
      ctx.fillStyle = 'rgba(34, 211, 238, 0.45)';
      for (const [px, py] of pickedPattern.cells) {
        const x = hover.x + px;
        const y = hover.y + py;
        if (x >= 0 && y >= 0 && x < g.W && y < g.H) {
          ctx.fillRect(x * cellPx + 0.5, y * cellPx + 0.5, cellPx - 1, cellPx - 1);
        }
      }
    }
  }

  // Mouse: drag-paint cells, or stamp pattern on click when a pattern is picked
  const paintRef = useRef<{ mode: 0 | 1 | null }>({ mode: null });
  const cellFromEvent = (e: React.MouseEvent | MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.floor((e.clientX - r.left) / cellPx),
      y: Math.floor((e.clientY - r.top) / cellPx),
    };
  };
  const onCanvasDown = (e: React.MouseEvent) => {
    const { x, y } = cellFromEvent(e);
    if (pickedPattern) {
      stamp(gridRef.current, pickedPattern.cells, x, y);
      setAlive(countAlive(gridRef.current));
      return;
    }
    const g = gridRef.current;
    const cur = g.cells[y * g.W + x] ? 1 : 0;
    paintRef.current.mode = cur ? 0 : 1;
    toggleCell(g, x, y);
    setAlive(countAlive(g));
  };
  const onCanvasMove = (e: React.MouseEvent) => {
    const p = cellFromEvent(e);
    setHover(p);
    if (paintRef.current.mode === null) return;
    const g = gridRef.current;
    if (p.x < 0 || p.y < 0 || p.x >= g.W || p.y >= g.H) return;
    const idx = p.y * g.W + p.x;
    if (g.cells[idx] !== paintRef.current.mode) {
      g.cells[idx] = paintRef.current.mode;
      setAlive(countAlive(g));
    }
  };
  useEffect(() => {
    const onUp = () => (paintRef.current.mode = null);
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-9 px-2 flex items-center gap-1 border-b border-white/10 chrome">
          <button
            onClick={() => setRunning((r) => !r)}
            className="flex items-center gap-1 px-2 h-6 rounded-md text-xs bg-accent hover:bg-accent-hover text-white"
          >
            {running ? <Pause size={12} /> : <Play size={12} />}
            {running ? 'Pause' : 'Run'}
          </button>
          <button
            onClick={() => {
              gridRef.current.cells = stepGrid(gridRef.current);
              setGeneration((g) => g + 1);
              setAlive(countAlive(gridRef.current));
            }}
            className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
          >
            <StepForward size={12} /> Step
          </button>
          <button
            onClick={() => {
              clearGrid(gridRef.current);
              setGeneration(0);
              setAlive(0);
            }}
            className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
          >
            <Trash2 size={12} /> Clear
          </button>
          <button
            onClick={() => {
              randomFill(gridRef.current, 0.3);
              setGeneration(0);
              setAlive(countAlive(gridRef.current));
            }}
            className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
          >
            <Shuffle size={12} /> Random
          </button>
          <div className="mx-2 w-px h-4 bg-white/15" />
          <div className="flex items-center gap-1 text-[11px] text-white/65">
            Hz
            <input
              type="range"
              min={1}
              max={30}
              step={1}
              value={tickHz}
              onChange={(e) => setTickHz(parseInt(e.target.value))}
              className="w-24"
            />
            <span className="font-mono w-6 text-right">{tickHz}</span>
          </div>
          <label className="ml-2 flex items-center gap-1 text-[11px] text-white/65">
            <input
              type="checkbox"
              checked={wrap}
              onChange={(e) => {
                gridRef.current.wrap = e.target.checked;
                setWrap(e.target.checked);
              }}
            />
            wrap edges
          </label>
          <div className="ml-auto flex items-center gap-3 text-[11px] text-white/65 font-mono">
            <span>gen {generation}</span>
            <span>alive {alive}</span>
          </div>
        </div>

        <div ref={containerRef} className="flex-1 relative bg-[#0b1020] flex items-center justify-center overflow-hidden">
          <canvas
            ref={canvasRef}
            onMouseDown={onCanvasDown}
            onMouseMove={onCanvasMove}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: pickedPattern ? 'copy' : 'crosshair' }}
          />
          {pickedPattern && (
            <button
              onClick={() => setPickedPattern(null)}
              className="absolute top-2 right-2 glass-strong rounded-md text-[11px] px-2 py-1 text-white"
            >
              Cancel stamp · {pickedPattern.name}
            </button>
          )}
        </div>
      </div>

      <div className="w-56 shrink-0 border-l border-white/10 bg-black/25 flex flex-col chrome">
        <div className="px-3 py-2 border-b border-white/10">
          <div className="text-[10px] uppercase text-white/45 mb-1.5">Grid</div>
          <NumRow label="W" value={W} min={10} max={160} step={1} onChange={setW} />
          <NumRow label="H" value={H} min={10} max={120} step={1} onChange={setH} />
        </div>
        <div className="p-3 overflow-y-auto flex-1">
          <div className="text-[10px] uppercase text-white/45 mb-1.5">Patterns</div>
          {(['still', 'osc', 'ship', 'gun', 'methuselah'] as const).map((cat) => (
            <div key={cat} className="mb-2">
              <div className="text-[10px] text-white/45 px-1 mt-1">{labelOf(cat)}</div>
              {PATTERNS.filter((p) => p.category === cat).map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPickedPattern(p)}
                  className={`w-full text-left flex items-center gap-2 px-2 py-1 rounded-md text-xs ${
                    pickedPattern?.id === p.id ? 'bg-accent text-white' : 'hover:bg-white/10 text-white/85'
                  }`}
                >
                  <Sparkles size={10} className="opacity-60" />
                  {p.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function labelOf(c: 'still' | 'osc' | 'ship' | 'gun' | 'methuselah'): string {
  return c === 'still' ? 'Still lifes' : c === 'osc' ? 'Oscillators' : c === 'ship' ? 'Spaceships' : c === 'gun' ? 'Guns' : 'Methuselahs';
}

function NumRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-4 text-white/55">{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="flex-1"
      />
      <span className="font-mono w-8 text-right">{value}</span>
    </div>
  );
}

const module: AppModule = {
  manifest: {
    id: 'conway',
    name: 'Conway',
    description: "Conway's Game of Life — patterns, drag-to-paint, AI control",
    icon: Grid3x3,
    defaultSize: { width: 940, height: 600 },
    accent: 'linear-gradient(135deg, #22d3ee 0%, #6366f1 100%)',
  },
  Component: ConwayApp,
};

export default module;
