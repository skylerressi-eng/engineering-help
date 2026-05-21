import { useEffect, useMemo, useRef, useState } from 'react';
import { Wrench, Thermometer } from 'lucide-react';
import type { AppModule } from '@/os/types';
import {
  solveBeam,
  rectSection,
  circleSection,
  pipeSection,
  iSection,
  type BeamSupport,
  type BeamResult,
  type SectionProps,
} from '@/lib/mech/beam';
import { solveThermal } from '@/lib/mech/thermal';
import { ENG_MATERIALS, getEngMaterial } from '@/lib/materials/engineering';
import { sampleColormap } from '@/lib/viz/colormaps';
import { useAppTools } from '@/hooks/useToolRegistry';
import { publishAppState } from '@/ai/screenScanner';

type Tab = 'structural' | 'thermal';

/* ---------------- Structural (beam) ---------------- */
type SectionKind = 'rect' | 'circle' | 'pipe' | 'ibeam';

const SECTION_LABELS: Record<SectionKind, string> = {
  rect: 'Rectangle',
  circle: 'Solid round',
  pipe: 'Pipe (hollow)',
  ibeam: 'I-beam',
};

function BeamDiagram({
  support,
  L,
  a,
  P,
  w,
  res,
  defScale,
}: {
  support: BeamSupport;
  L: number;
  a: number;
  P: number;
  w: number;
  res: BeamResult;
  defScale: number;
}) {
  const W = 560;
  const H = 200;
  const m = 60;
  const x0 = m;
  const x1 = W - m;
  const yMid = H / 2;
  const sx = (xm: number) => x0 + (xm / L) * (x1 - x0);
  const defMax = res.maxDeflection || 1e-9;
  // Deflected centre-line: positive v = downward (screen +y)
  const path = res.x
    .map((xm, i) => {
      const px = sx(xm);
      const py =
        yMid + (res.deflection[i] / defMax) * 34 * defScale;
      return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(' ');
  const ap = sx(Math.min(a, L));
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      className="bg-black/30 rounded-md"
    >
      {/* undeformed beam */}
      <rect
        x={x0}
        y={yMid - 6}
        width={x1 - x0}
        height={12}
        fill="rgba(255,255,255,0.10)"
        stroke="rgba(255,255,255,0.25)"
      />
      {/* deflected shape */}
      <path d={path} fill="none" stroke="#22d3ee" strokeWidth={2.4} />
      {/* supports */}
      {support === 'cantilever' ? (
        <g stroke="#94a3b8" strokeWidth={1.5}>
          <line x1={x0} y1={yMid - 26} x2={x0} y2={yMid + 26} />
          {Array.from({ length: 7 }).map((_, i) => (
            <line
              key={i}
              x1={x0}
              y1={yMid - 24 + i * 8}
              x2={x0 - 9}
              y2={yMid - 16 + i * 8}
            />
          ))}
        </g>
      ) : (
        <g fill="#94a3b8" stroke="#94a3b8">
          <polygon
            points={`${x0},${yMid + 6} ${x0 - 11},${yMid + 24} ${x0 + 11},${yMid + 24}`}
            fillOpacity={0.5}
          />
          <polygon
            points={`${x1},${yMid + 6} ${x1 - 11},${yMid + 24} ${x1 + 11},${yMid + 24}`}
            fillOpacity={0.5}
          />
          <circle cx={x1 - 6} cy={yMid + 28} r={3} fillOpacity={0.7} />
          <circle cx={x1 + 6} cy={yMid + 28} r={3} fillOpacity={0.7} />
        </g>
      )}
      {/* UDL */}
      {w !== 0 && (
        <g stroke="#a78bfa" strokeWidth={1.3} fill="#a78bfa">
          <line x1={x0} y1={yMid - 40} x2={x1} y2={yMid - 40} />
          {Array.from({ length: 11 }).map((_, i) => {
            const px = x0 + (i / 10) * (x1 - x0);
            return (
              <line key={i} x1={px} y1={yMid - 40} x2={px} y2={yMid - 8} />
            );
          })}
          <text x={x1 - 4} y={yMid - 46} fontSize={10} stroke="none">
            w {w} N/m
          </text>
        </g>
      )}
      {/* point load */}
      {P !== 0 && (
        <g stroke="#f59e0b" strokeWidth={2} fill="#f59e0b">
          <line x1={ap} y1={yMid - 56} x2={ap} y2={yMid - 8} />
          <polygon
            points={`${ap},${yMid - 8} ${ap - 5},${yMid - 18} ${ap + 5},${yMid - 18}`}
            stroke="none"
          />
          <text
            x={ap + 6}
            y={yMid - 48}
            fontSize={10}
            stroke="none"
          >
            P {(P / 1000).toFixed(1)} kN
          </text>
        </g>
      )}
      <text x={x0} y={H - 8} fontSize={9} fill="rgba(255,255,255,0.4)">
        0
      </text>
      <text
        x={x1}
        y={H - 8}
        fontSize={9}
        fill="rgba(255,255,255,0.4)"
        textAnchor="end"
      >
        L = {L} m
      </text>
    </svg>
  );
}

function StructuralTab() {
  const [support, setSupport] = useState<BeamSupport>('cantilever');
  const [L, setL] = useState(3);
  const [section, setSection] = useState<SectionKind>('rect');
  // generic dimension state shared across sections (mm in UI → m in solver)
  const [b, setB] = useState(0.05);
  const [h, setH] = useState(0.1);
  const [dia, setDia] = useState(0.08);
  const [wall, setWall] = useState(0.005);
  const [bf, setBf] = useState(0.08);
  const [tf, setTf] = useState(0.008);
  const [tw, setTw] = useState(0.006);
  const [matId, setMatId] = useState('steel-mild');
  const [P, setP] = useState(2000);
  const [a, setA] = useState(3);
  const [w, setW] = useState(500);
  const [SF, setSF] = useState(1.5);
  const [defScale, setDefScale] = useState(1);

  const mat = getEngMaterial(matId);
  const E = mat.E;

  const sec: SectionProps = useMemo(() => {
    if (section === 'circle') return circleSection(dia);
    if (section === 'pipe') return pipeSection(dia, wall);
    if (section === 'ibeam') return iSection(h, bf, tf, tw);
    return rectSection(b, h);
  }, [section, b, h, dia, wall, bf, tf, tw]);

  const res: BeamResult = useMemo(
    () =>
      solveBeam({
        support,
        L,
        E,
        I: sec.I,
        c: sec.c,
        P,
        a: Math.min(a, L),
        w,
      }),
    [support, L, E, sec, P, a, w],
  );

  const allowable = mat.yield / SF;
  const utilisation = res.maxStress / allowable; // 1.0 = at the allowable
  const fos = res.maxStress > 0 ? mat.yield / res.maxStress : Infinity;
  const massPerM = sec.area * mat.density;
  const S = sec.c > 0 ? sec.I / sec.c : 0;

  const W = 520;
  const H = 110;
  const plot = (vals: number[], color: string, unit: string, scale = 1) => {
    const n = vals.length;
    const max = Math.max(...vals.map(Math.abs), 1e-9);
    const px = (i: number) => (i / (n - 1)) * W;
    const py = (v: number) => H / 2 - (v / max) * (H / 2 - 14);
    const d = vals
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(1)},${py(v).toFixed(1)}`)
      .join(' ');
    // Peak (largest magnitude) and where along the span it occurs.
    let pi = 0;
    for (let i = 1; i < n; i++) if (Math.abs(vals[i]) > Math.abs(vals[pi])) pi = i;
    const peakX = res.x[pi] ?? (pi / (n - 1)) * L;
    const labelLeft = px(pi) > W * 0.6;
    return (
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        className="bg-black/30 rounded-md"
      >
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="rgba(255,255,255,0.2)" />
        <path d={d} fill="none" stroke={color} strokeWidth={1.6} />
        {/* peak marker */}
        <line
          x1={px(pi)}
          y1={py(vals[pi])}
          x2={px(pi)}
          y2={H / 2}
          stroke={color}
          strokeOpacity={0.4}
          strokeDasharray="2 2"
        />
        <circle cx={px(pi)} cy={py(vals[pi])} r={3} fill={color} />
        <text
          x={labelLeft ? px(pi) - 6 : px(pi) + 6}
          y={py(vals[pi]) < H / 2 ? py(vals[pi]) - 5 : py(vals[pi]) + 12}
          fontSize={10}
          fill={color}
          textAnchor={labelLeft ? 'end' : 'start'}
          fontFamily="monospace"
        >
          {(vals[pi] * scale).toFixed(2)} {unit} @ x={peakX.toFixed(2)} m
        </text>
        {/* x-axis endpoints */}
        <text x={2} y={H - 3} fontSize={9} fill="rgba(255,255,255,0.4)">0</text>
        <text
          x={W - 2}
          y={H - 3}
          fontSize={9}
          fill="rgba(255,255,255,0.4)"
          textAnchor="end"
        >
          L = {L} m
        </text>
      </svg>
    );
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        <Block title="Beam & deflected shape (exaggerated)">
          <BeamDiagram
            support={support}
            L={L}
            a={a}
            P={P}
            w={w}
            res={res}
            defScale={defScale}
          />
          <div className="flex items-center gap-2 mt-1 text-[10px] text-white/55">
            <span>deflection ×{defScale}</span>
            {[1, 5, 20, 100].map((f) => (
              <button
                key={f}
                onClick={() => setDefScale(f)}
                className={`px-1.5 rounded ${defScale === f ? 'bg-accent text-white' : 'hover:bg-white/10'}`}
              >
                ×{f}
              </button>
            ))}
          </div>
        </Block>
        <Block
          title={`Deflection — max ${(res.maxDeflection * 1000).toFixed(3)} mm`}
        >
          {plot(res.deflection, '#22d3ee', 'mm', 1000)}
        </Block>
        <Block
          title={`Bending Moment — max ${(res.maxMoment / 1000).toFixed(2)} kN·m`}
        >
          {plot(res.moment, '#f59e0b', 'kN·m', 0.001)}
        </Block>
        <Block
          title={`Shear Force — max ${(Math.max(...res.shear.map(Math.abs)) / 1000).toFixed(2)} kN`}
        >
          {plot(res.shear, '#a78bfa', 'kN', 0.001)}
        </Block>
        <Block
          title={`Bending Stress — max ${(res.maxStress / 1e6).toFixed(1)} MPa`}
        >
          {plot(res.stress, '#ef4444', 'MPa', 1e-6)}
        </Block>
      </div>
      <div className="w-60 shrink-0 border-l border-white/10 bg-black/25 p-3 chrome overflow-y-auto space-y-2">
        <div className="text-[10px] uppercase text-white/45">Support</div>
        <div className="flex gap-1">
          {(['cantilever', 'simple'] as BeamSupport[]).map((s) => (
            <button
              key={s}
              onClick={() => {
                setSupport(s);
                if (s === 'cantilever') setA(L);
              }}
              className={`flex-1 py-1 rounded-md text-[11px] ${
                support === s
                  ? 'bg-accent text-white'
                  : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <Num label="L (m)" value={L} onChange={setL} step={0.1} />

        <div className="text-[10px] uppercase text-white/45 pt-1">
          Cross-section
        </div>
        <select
          value={section}
          onChange={(e) => setSection(e.target.value as SectionKind)}
          className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs outline-none"
        >
          {(Object.keys(SECTION_LABELS) as SectionKind[]).map((k) => (
            <option key={k} value={k} className="bg-zinc-800">
              {SECTION_LABELS[k]}
            </option>
          ))}
        </select>
        {section === 'rect' && (
          <>
            <Num label="b (m)" value={b} onChange={setB} step={0.005} />
            <Num label="h (m)" value={h} onChange={setH} step={0.005} />
          </>
        )}
        {section === 'circle' && (
          <Num label="d (m)" value={dia} onChange={setDia} step={0.005} />
        )}
        {section === 'pipe' && (
          <>
            <Num label="d (m)" value={dia} onChange={setDia} step={0.005} />
            <Num label="t (m)" value={wall} onChange={setWall} step={0.001} />
          </>
        )}
        {section === 'ibeam' && (
          <>
            <Num label="h (m)" value={h} onChange={setH} step={0.005} />
            <Num label="bf (m)" value={bf} onChange={setBf} step={0.005} />
            <Num label="tf (m)" value={tf} onChange={setTf} step={0.001} />
            <Num label="tw (m)" value={tw} onChange={setTw} step={0.001} />
          </>
        )}
        <div className="text-[10px] text-white/45 font-mono">
          I {sec.I.toExponential(2)} m⁴ · S {S.toExponential(2)} m³
        </div>

        <div>
          <div className="text-[10px] uppercase text-white/45 mb-1 pt-1">
            Material
          </div>
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
            E {(mat.E / 1e9).toFixed(0)} GPa · σy{' '}
            {(mat.yield / 1e6).toFixed(0)} MPa · {massPerM.toFixed(1)} kg/m
          </div>
        </div>
        <div className="text-[10px] uppercase text-white/45 pt-1">Loads</div>
        <Num label="P (N)" value={P} onChange={setP} step={100} />
        <Num label="a (m)" value={a} onChange={setA} step={0.1} />
        <Num label="w (N/m)" value={w} onChange={setW} step={50} />
        <Num
          label="safety n"
          value={SF}
          onChange={(v) => setSF(Math.max(1, v))}
          step={0.1}
        />
        <div className="pt-2 border-t border-white/10 mt-1">
          <div className="text-[10px] uppercase text-white/45 mb-1">
            Results
          </div>
          <div className="text-[11px] font-mono text-white/80 space-y-0.5">
            <div className="flex justify-between">
              <span className="text-white/55">max δ</span>
              <span>{(res.maxDeflection * 1000).toFixed(3)} mm</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/55">δ / L</span>
              <span>
                L/{(L / (res.maxDeflection || 1e-9)).toFixed(0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/55">max M</span>
              <span>{(res.maxMoment / 1000).toFixed(2)} kN·m</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/55">max σ</span>
              <span
                className={
                  utilisation >= 1 ? 'text-traffic-red' : 'text-emerald-300'
                }
              >
                {(res.maxStress / 1e6).toFixed(1)} MPa
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/55">σ allow</span>
              <span>{(allowable / 1e6).toFixed(1)} MPa</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/55">utilisation</span>
              <span
                className={
                  utilisation >= 1
                    ? 'text-traffic-red'
                    : utilisation > 0.85
                      ? 'text-amber-400'
                      : 'text-emerald-300'
                }
              >
                {(utilisation * 100).toFixed(0)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/55">FoS</span>
              <span>{fos === Infinity ? '∞' : fos.toFixed(2)}</span>
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
          <div
            className={`mt-2 text-center text-[11px] py-1 rounded-md ${
              utilisation >= 1
                ? 'bg-traffic-red/20 text-traffic-red'
                : 'bg-emerald-500/15 text-emerald-300'
            }`}
          >
            {utilisation >= 1
              ? `✗ FAILS — σ exceeds σy/${SF}`
              : `✓ PASSES at n = ${SF}`}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Thermal ---------------- */
const THERMAL_PRESETS: {
  id: string;
  label: string;
  v: { top: number; bottom: number; left: number; right: number; source: number; sx: number; sy: number };
}[] = [
  { id: 'plate', label: 'Hot plate', v: { top: 20, bottom: 120, left: 20, right: 20, source: 0, sx: 0.5, sy: 0.5 } },
  { id: 'corner', label: 'Corner heat', v: { top: 150, bottom: 20, left: 150, right: 20, source: 0, sx: 0.5, sy: 0.5 } },
  { id: 'chip', label: 'Chip + sink', v: { top: 25, bottom: 25, left: 25, right: 25, source: 220, sx: 0.5, sy: 0.7 } },
  { id: 'gradient', label: 'L–R gradient', v: { top: 60, bottom: 60, left: 150, right: 10, source: 0, sx: 0.5, sy: 0.5 } },
];

function ThermalTab() {
  const [top, setTop] = useState(20);
  const [bottom, setBottom] = useState(120);
  const [left, setLeft] = useState(20);
  const [right, setRight] = useState(20);
  const [source, setSource] = useState(0);
  const [sx, setSx] = useState(0.5);
  const [sy, setSy] = useState(0.5);
  const [probe, setProbe] = useState<{ u: number; v: number; t: number } | null>(
    null,
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const applyPreset = (p: (typeof THERMAL_PRESETS)[number]) => {
    setTop(p.v.top);
    setBottom(p.v.bottom);
    setLeft(p.v.left);
    setRight(p.v.right);
    setSource(p.v.source);
    setSx(p.v.sx);
    setSy(p.v.sy);
    setProbe(null);
  };

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
          className="rounded-lg border border-white/10 cursor-crosshair"
          style={{ width: '90%', maxWidth: 640, imageRendering: 'auto' }}
          onClick={(e) => {
            const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
            const u = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
            const v = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
            const ix = Math.min(
              result.nx - 1,
              Math.round(u * (result.nx - 1)),
            );
            const iy = Math.min(
              result.ny - 1,
              Math.round(v * (result.ny - 1)),
            );
            setProbe({ u, v, t: result.T[iy * result.nx + ix] });
          }}
        />
        {probe && (
          <div className="text-[11px] font-mono text-amber-300">
            probe @ ({probe.u.toFixed(2)}, {probe.v.toFixed(2)}) ={' '}
            {probe.t.toFixed(1)} °C
          </div>
        )}
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
        <div className="text-[10px] uppercase text-white/45">Presets</div>
        <div className="grid grid-cols-2 gap-1">
          {THERMAL_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              className="py-1 rounded-md text-[10px] bg-white/5 hover:bg-white/10"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="text-[10px] uppercase text-white/45 pt-1">Edge temperatures (°C)</div>
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
