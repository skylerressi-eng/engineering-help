import { useEffect, useMemo, useRef, useState } from 'react';
import { Wrench, Thermometer } from 'lucide-react';
import type { AppModule } from '@/os/types';
import {
  solveBeam,
  rectSection,
  type BeamSupport,
  type BeamResult,
} from '@/lib/mech/beam';
import { solveThermal } from '@/lib/mech/thermal';
import { ENG_MATERIALS, getEngMaterial } from '@/lib/materials/engineering';
import { sampleColormap } from '@/lib/viz/colormaps';
import { useAppTools } from '@/hooks/useToolRegistry';
import { publishAppState } from '@/ai/screenScanner';

type Tab = 'structural' | 'thermal';

/* ---------------- Structural (beam) ---------------- */
function StructuralTab() {
  const [support, setSupport] = useState<BeamSupport>('cantilever');
  const [L, setL] = useState(3);
  const [b, setB] = useState(0.05);
  const [h, setH] = useState(0.1);
  const [matId, setMatId] = useState('steel-mild');
  const [P, setP] = useState(2000);
  const [a, setA] = useState(3);
  const [w, setW] = useState(500);

  const mat = getEngMaterial(matId);
  const E = mat.E;

  const res: BeamResult = useMemo(() => {
    const { I, c } = rectSection(b, h);
    return solveBeam({ support, L, E, I, c, P, a: Math.min(a, L), w });
  }, [support, L, b, h, E, P, a, w]);

  const utilisation = res.maxStress / mat.yield; // 1.0 = at yield

  const W = 520;
  const H = 120;
  const plot = (vals: number[], color: string) => {
    const max = Math.max(...vals.map(Math.abs), 1e-9);
    const d = vals
      .map(
        (v, i) =>
          `${i === 0 ? 'M' : 'L'} ${(i / (vals.length - 1)) * W},${H / 2 - (v / max) * (H / 2 - 8)}`,
      )
      .join(' ');
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="bg-black/30 rounded-md">
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="rgba(255,255,255,0.2)" />
        <path d={d} fill="none" stroke={color} strokeWidth={1.6} />
      </svg>
    );
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        <Block title={`Deflection — max ${res.maxDeflection.toExponential(3)} m`}>
          {plot(res.deflection, '#22d3ee')}
        </Block>
        <Block title={`Bending Moment — max ${(res.maxMoment / 1000).toFixed(2)} kN·m`}>
          {plot(res.moment, '#f59e0b')}
        </Block>
        <Block title={`Shear Force — max ${(Math.max(...res.shear.map(Math.abs)) / 1000).toFixed(2)} kN`}>
          {plot(res.shear, '#a78bfa')}
        </Block>
        <Block title={`Bending Stress — max ${(res.maxStress / 1e6).toFixed(1)} MPa`}>
          {plot(res.stress, '#ef4444')}
        </Block>
      </div>
      <div className="w-60 shrink-0 border-l border-white/10 bg-black/25 p-3 chrome overflow-y-auto space-y-2">
        <div className="text-[10px] uppercase text-white/45">Beam</div>
        <div className="flex gap-1">
          {(['cantilever', 'simple'] as BeamSupport[]).map((s) => (
            <button
              key={s}
              onClick={() => {
                setSupport(s);
                if (s === 'cantilever') setA(L);
              }}
              className={`flex-1 py-1 rounded-md text-[11px] ${
                support === s ? 'bg-accent text-white' : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <Num label="L (m)" value={L} onChange={setL} step={0.1} />
        <Num label="b (m)" value={b} onChange={setB} step={0.005} />
        <Num label="h (m)" value={h} onChange={setH} step={0.005} />
        <div>
          <div className="text-[10px] uppercase text-white/45 mb-1">Material</div>
          <select
            value={matId}
            onChange={(e) => setMatId(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs outline-none"
          >
            {ENG_MATERIALS.map((m) => (
              <option key={m.id} value={m.id} className="bg-zinc-800">
                {m.label}
              </option>
            ))}
          </select>
          <div className="text-[10px] text-white/45 mt-1 font-mono">
            E {(mat.E / 1e9).toFixed(0)} GPa · σy {(mat.yield / 1e6).toFixed(0)} MPa
          </div>
        </div>
        <div className="text-[10px] uppercase text-white/45 pt-1">Loads</div>
        <Num label="P (N)" value={P} onChange={setP} step={100} />
        <Num label="a (m)" value={a} onChange={setA} step={0.1} />
        <Num label="w (N/m)" value={w} onChange={setW} step={50} />
        <div className="pt-2 border-t border-white/10 mt-1">
          <div className="text-[10px] uppercase text-white/45 mb-1">Results</div>
          <div className="text-[11px] font-mono text-white/80 space-y-0.5">
            <div className="flex justify-between">
              <span className="text-white/55">max δ</span>
              <span>{(res.maxDeflection * 1000).toFixed(3)} mm</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/55">max M</span>
              <span>{(res.maxMoment / 1000).toFixed(2)} kN·m</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/55">max σ</span>
              <span
                className={utilisation >= 1 ? 'text-traffic-red' : 'text-emerald-300'}
              >
                {(res.maxStress / 1e6).toFixed(1)} MPa
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/55">utilisation</span>
              <span
                className={
                  utilisation >= 1
                    ? 'text-traffic-red'
                    : utilisation > 0.66
                      ? 'text-amber-400'
                      : 'text-emerald-300'
                }
              >
                {(utilisation * 100).toFixed(0)}% σy
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/55">R₀</span>
              <span>{(res.reactions.R0 / 1000).toFixed(2)} kN</span>
            </div>
            {res.reactions.M0 !== undefined && (
              <div className="flex justify-between">
                <span className="text-white/55">M₀</span>
                <span>{(res.reactions.M0 / 1000).toFixed(2)} kN·m</span>
              </div>
            )}
            {res.reactions.RL !== undefined && (
              <div className="flex justify-between">
                <span className="text-white/55">R_L</span>
                <span>{(res.reactions.RL / 1000).toFixed(2)} kN</span>
              </div>
            )}
          </div>
          {utilisation >= 1 && (
            <div className="mt-1 text-[10px] text-traffic-red">
              ⚠ stress exceeds {mat.label} yield ({(mat.yield / 1e6).toFixed(0)} MPa) — it would fail
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Thermal ---------------- */
function ThermalTab() {
  const [top, setTop] = useState(20);
  const [bottom, setBottom] = useState(120);
  const [left, setLeft] = useState(20);
  const [right, setRight] = useState(20);
  const [source, setSource] = useState(0);
  const [sx, setSx] = useState(0.5);
  const [sy, setSy] = useState(0.5);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const result = useMemo(
    () =>
      solveThermal({
        nx: 90,
        ny: 70,
        top,
        bottom,
        left,
        right,
        source,
        sx,
        sy,
        iterations: 500,
      }),
    [top, bottom, left, right, source, sx, sy],
  );

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const { nx, ny, T, min, max } = result;
    const span = max - min || 1;
    // Build the field on a small offscreen buffer...
    const off = document.createElement('canvas');
    off.width = nx;
    off.height = ny;
    const octx = off.getContext('2d')!;
    const img = octx.createImageData(nx, ny);
    const col = { r: 0, g: 0, b: 0 };
    for (let idx = 0; idx < nx * ny; idx++) {
      sampleColormap('turbo', (T[idx] - min) / span, col);
      img.data[idx * 4] = col.r * 255;
      img.data[idx * 4 + 1] = col.g * 255;
      img.data[idx * 4 + 2] = col.b * 255;
      img.data[idx * 4 + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    // ...then draw it smoothly upscaled onto the visible canvas for a crisp,
    // interpolated heat map instead of a blurry 90×70 bitmap.
    const SCALE = 9;
    c.width = nx * SCALE;
    c.height = ny * SCALE;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, 0, 0, nx, ny, 0, 0, c.width, c.height);
  }, [result]);

  return (
    <div className="flex h-full">
      <div className="flex-1 p-4 flex flex-col items-center justify-center gap-3">
        <canvas
          ref={canvasRef}
          className="rounded-lg border border-white/10"
          style={{ width: '90%', maxWidth: 640, imageRendering: 'auto' }}
        />
        <div className="flex items-center gap-2 text-[11px] text-white/65">
          <span>{result.min.toFixed(1)}°C</span>
          <div
            className="w-48 h-3 rounded-full"
            style={{
              background:
                'linear-gradient(90deg,#31123b,#2196f3,#29d36a,#f3b829,#dc2f22)',
            }}
          />
          <span>{result.max.toFixed(1)}°C</span>
        </div>
      </div>
      <div className="w-60 shrink-0 border-l border-white/10 bg-black/25 p-3 chrome overflow-y-auto space-y-2">
        <div className="text-[10px] uppercase text-white/45">Edge temperatures (°C)</div>
        <Num label="Top" value={top} onChange={setTop} step={5} />
        <Num label="Bottom" value={bottom} onChange={setBottom} step={5} />
        <Num label="Left" value={left} onChange={setLeft} step={5} />
        <Num label="Right" value={right} onChange={setRight} step={5} />
        <div className="text-[10px] uppercase text-white/45 pt-1">Heat source</div>
        <Num label="q (°C)" value={source} onChange={setSource} step={20} />
        <Slider label="x" value={sx} onChange={setSx} />
        <Slider label="y" value={sy} onChange={setSy} />
        <div className="pt-2 text-[11px] font-mono text-white/65">
          steady-state · {result.nx}×{result.ny} grid · SOR
        </div>
      </div>
    </div>
  );
}

function MechSim({ appId }: { appId: string }) {
  const [tab, setTab] = useState<Tab>('structural');

  useAppTools(appId, [
    {
      toolName: 'analyze_beam',
      description:
        'Run an Euler-Bernoulli beam analysis. support: cantilever|simple. Returns max deflection/moment/stress + reactions.',
      input_schema: {
        type: 'object',
        properties: {
          support: { type: 'string', enum: ['cantilever', 'simple'] },
          L: { type: 'number' },
          b: { type: 'number' },
          h: { type: 'number' },
          E: { type: 'number', description: 'Pa' },
          P: { type: 'number', description: 'point load N' },
          a: { type: 'number', description: 'load position m' },
          w: { type: 'number', description: 'UDL N/m' },
        },
        required: ['support', 'L'],
      },
      handler: ({ support, L, b, h, E, P, a, w }: any) => {
        const { I, c } = rectSection(Number(b ?? 0.05), Number(h ?? 0.1));
        const r = solveBeam({
          support,
          L: Number(L),
          E: Number(E ?? 200e9),
          I,
          c,
          P: Number(P ?? 1000),
          a: Number(a ?? L),
          w: Number(w ?? 0),
        });
        return {
          maxDeflection: r.maxDeflection,
          maxMoment: r.maxMoment,
          maxStress: r.maxStress,
          reactions: r.reactions,
        };
      },
    },
    {
      toolName: 'analyze_thermal',
      description:
        'Steady-state 2D plate conduction. Pass edge temps + optional source; returns min/max temperature.',
      input_schema: {
        type: 'object',
        properties: {
          top: { type: 'number' },
          bottom: { type: 'number' },
          left: { type: 'number' },
          right: { type: 'number' },
          source: { type: 'number' },
        },
        required: ['top', 'bottom', 'left', 'right'],
      },
      handler: ({ top, bottom, left, right, source }: any) => {
        const r = solveThermal({
          nx: 80,
          ny: 60,
          top: Number(top),
          bottom: Number(bottom),
          left: Number(left),
          right: Number(right),
          source: Number(source ?? 0),
          sx: 0.5,
          sy: 0.5,
          iterations: 500,
        });
        return { min: r.min, max: r.max };
      },
    },
  ]);

  useEffect(() => {
    return publishAppState(appId, () => ({
      summary: `MechSim active tab: ${tab} (structural beam analysis / 2D thermal conduction).`,
      state: { tab },
    }));
  }, [appId, tab]);

  return (
    <div className="flex flex-col h-full">
      <div className="h-9 flex items-center border-b border-white/10 chrome">
        {(
          [
            ['structural', 'Structural', Wrench],
            ['thermal', 'Thermal', Thermometer],
          ] as [Tab, string, any][]
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 h-9 text-xs ${
              tab === id
                ? 'text-white border-b-2 border-accent -mb-px'
                : 'text-white/55 hover:text-white/85'
            }`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {tab === 'structural' ? <StructuralTab /> : <ThermalTab />}
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-white/65 mb-1 font-mono">{title}</div>
      {children}
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-16 text-white/55">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 font-mono outline-none"
      />
    </label>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-white/65">
      <span className="w-16">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.02}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1"
      />
      <span className="font-mono w-8 text-right">{value.toFixed(2)}</span>
    </label>
  );
}

const module: AppModule = {
  manifest: {
    id: 'mechsim',
    name: 'MechSim',
    description: 'Mechanical simulation — beam structural + thermal conduction',
    icon: Wrench,
    defaultSize: { width: 1040, height: 660 },
    accent: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)',
  },
  Component: MechSim,
};

export default module;
