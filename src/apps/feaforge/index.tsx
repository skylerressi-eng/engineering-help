import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import {
  OrbitControls,
  GizmoHelper,
  GizmoViewport,
  Line,
  Grid,
} from '@react-three/drei';
import {
  Box,
  Play,
  Trash2,
  MousePointer2,
  Circle,
  Minus,
  Anchor,
  ArrowDown,
  BookOpen,
  ChevronDown,
  Upload,
} from 'lucide-react';
import type { AppModule } from '@/os/types';
import { useFeaStore, type FeaTool } from '@/store/feaStore';
import { FEA_PRESETS_3D } from '@/lib/fea/presets3d';
import { ENG_MATERIALS } from '@/lib/materials/engineering';
import type { TestType } from '@/lib/fea/truss3d';
import { useAppTools } from '@/hooks/useToolRegistry';
import { publishAppState } from '@/ai/screenScanner';
import { toast } from '@/store/toastStore';

function stressColor(stress: number, maxStress: number): string {
  if (maxStress < 1) return '#94a3b8';
  const t = Math.max(-1, Math.min(1, stress / maxStress));
  if (t >= 0) {
    const k = t; // tension → red
    return `rgb(${Math.round(140 + 115 * k)},${Math.round(150 - 120 * k)},${Math.round(150 - 120 * k)})`;
  }
  const k = -t; // compression → blue
  return `rgb(${Math.round(150 - 120 * k)},${Math.round(160 - 60 * k)},${Math.round(150 + 105 * k)})`;
}

const ZERO = { ux: 0, uy: 0, uz: 0 };

function GroundCatcher() {
  const tool = useFeaStore((s) => s.tool);
  const addNode = useFeaStore((s) => s.addNode);
  if (tool !== 'node') return null;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      onPointerDown={(e) => {
        e.stopPropagation();
        const p = e.point;
        addNode(
          Math.round(p.x * 4) / 4,
          0,
          Math.round(p.z * 4) / 4,
        );
      }}
    >
      <planeGeometry args={[200, 200]} />
      <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function NodeMesh({ id }: { id: string }) {
  const nd = useFeaStore((s) => s.model.nodes.find((n) => n.id === id));
  const selected = useFeaStore((s) => s.selectedNode === id);
  const fromId = useFeaStore((s) => s.elementFrom);
  const tool = useFeaStore((s) => s.tool);
  const select = useFeaStore((s) => s.select);
  const toggleSupport = useFeaStore((s) => s.toggleSupport);
  const beginElement = useFeaStore((s) => s.beginElement);
  const finishElement = useFeaStore((s) => s.finishElement);
  if (!nd) return null;
  const fixed = nd.fixX || nd.fixY || nd.fixZ;
  const color = selected
    ? '#0A84FF'
    : fromId === id
      ? '#22d3ee'
      : fixed
        ? '#22c55e'
        : '#e2e8f0';
  return (
    <group position={[nd.x, nd.y, nd.z]}>
      <mesh
        onPointerDown={(e) => {
          e.stopPropagation();
          select(id);
          if (tool === 'support') toggleSupport(id);
          else if (tool === 'element') {
            if (fromId) finishElement(id);
            else beginElement(id);
          }
        }}
      >
        <sphereGeometry args={[selected ? 0.16 : 0.12, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 0.5 : 0.15}
        />
      </mesh>
      {fixed && (
        <mesh position={[0, -0.18, 0]}>
          <coneGeometry args={[0.18, 0.3, 4]} />
          <meshStandardMaterial color="#22c55e" wireframe />
        </mesh>
      )}
    </group>
  );
}

function Members() {
  const model = useFeaStore((s) => s.model);
  const result = useFeaStore((s) => s.result);
  const showDeformed = useFeaStore((s) => s.showDeformed);
  const dispScale = useFeaStore((s) => s.dispScale);
  const nodeMap = useMemo(() => {
    const m = new Map<string, (typeof model.nodes)[number]>();
    model.nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [model.nodes]);

  return (
    <>
      {model.elements.map((el) => {
        const a = nodeMap.get(el.a);
        const b = nodeMap.get(el.b);
        if (!a || !b) return null;
        const undeformed: [number, number, number][] = [
          [a.x, a.y, a.z],
          [b.x, b.y, b.z],
        ];
        const er = result?.elements.find((x) => x.id === el.id);
        const showD = result && showDeformed && !result.unstable;
        const da = showD ? result!.disp[el.a] ?? ZERO : ZERO;
        const db = showD ? result!.disp[el.b] ?? ZERO : ZERO;
        const deformed: [number, number, number][] = [
          [
            a.x + da.ux * dispScale,
            a.y + da.uy * dispScale,
            a.z + da.uz * dispScale,
          ],
          [
            b.x + db.ux * dispScale,
            b.y + db.uy * dispScale,
            b.z + db.uz * dispScale,
          ],
        ];
        return (
          <group key={el.id}>
            <Line
              points={undeformed}
              color={showD ? '#475569' : er ? stressColor(er.stress, result!.maxStress) : '#64748b'}
              lineWidth={showD ? 1 : 3}
              dashed={!!showD}
              dashScale={4}
            />
            {showD && (
              <Line
                points={deformed}
                color={stressColor(er?.stress ?? 0, result!.maxStress)}
                lineWidth={4}
              />
            )}
          </group>
        );
      })}
    </>
  );
}

function LoadArrows() {
  const model = useFeaStore((s) => s.model);
  const nodeMap = useMemo(() => {
    const m = new Map<string, (typeof model.nodes)[number]>();
    model.nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [model.nodes]);
  if (model.test !== 'force') return null;
  return (
    <>
      {model.loads.map((ld) => {
        const a = nodeMap.get(ld.node);
        if (!a) return null;
        const v = new THREE.Vector3(ld.fx, ld.fy, ld.fz);
        const dir = v.clone().normalize();
        const end = new THREE.Vector3(a.x, a.y, a.z).add(
          dir.clone().multiplyScalar(1.0),
        );
        return (
          <group key={ld.node}>
            <Line
              points={[
                [a.x, a.y, a.z],
                [end.x, end.y, end.z],
              ]}
              color="#f59e0b"
              lineWidth={3}
            />
            <mesh position={[end.x, end.y, end.z]}>
              <coneGeometry args={[0.08, 0.22, 12]} />
              <meshStandardMaterial
                color="#f59e0b"
                emissive="#f59e0b"
                emissiveIntensity={0.4}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function Scene() {
  const model = useFeaStore((s) => s.model);
  const select = useFeaStore((s) => s.select);
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[6, 10, 6]} intensity={0.8} />
      <directionalLight position={[-6, 4, -6]} intensity={0.3} />
      <Grid
        args={[40, 40]}
        cellSize={1}
        cellColor="#1e293b"
        sectionSize={5}
        sectionColor="#334155"
        fadeDistance={45}
        infiniteGrid
        position={[0, -0.001, 0]}
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.002, 0]}
        onPointerMissed={() => select(null)}
        visible={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial />
      </mesh>
      <GroundCatcher />
      <Members />
      <LoadArrows />
      {model.nodes.map((n) => (
        <NodeMesh key={n.id} id={n.id} />
      ))}
      <OrbitControls makeDefault enableDamping />
      <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
        <GizmoViewport labelColor="white" axisHeadScale={1} />
      </GizmoHelper>
    </>
  );
}

const TESTS: { id: TestType; label: string }[] = [
  { id: 'force', label: 'Force' },
  { id: 'pressure', label: 'Pressure' },
  { id: 'thermal', label: 'Heat' },
];

function FEAForge({ appId }: { appId: string }) {
  const model = useFeaStore((s) => s.model);
  const tool = useFeaStore((s) => s.tool);
  const result = useFeaStore((s) => s.result);
  const showDeformed = useFeaStore((s) => s.showDeformed);
  const dispScale = useFeaStore((s) => s.dispScale);
  const setTool = useFeaStore((s) => s.setTool);
  const addNode = useFeaStore((s) => s.addNode);
  const toggleSupport = useFeaStore((s) => s.toggleSupport);
  const setLoad = useFeaStore((s) => s.setLoad);
  const beginElement = useFeaStore((s) => s.beginElement);
  const finishElement = useFeaStore((s) => s.finishElement);
  const setShowDeformed = useFeaStore((s) => s.setShowDeformed);
  const setDispScale = useFeaStore((s) => s.setDispScale);
  const loadPreset = useFeaStore((s) => s.loadPreset);
  const clear = useFeaStore((s) => s.clear);
  const solve = useFeaStore((s) => s.solve);
  const materialId = useFeaStore((s) => s.materialId);
  const setMaterial = useFeaStore((s) => s.setMaterial);
  const yieldStress = useFeaStore((s) => s.yieldStress);
  const setTest = useFeaStore((s) => s.setTest);
  const setPressure = useFeaStore((s) => s.setPressure);
  const setTribArea = useFeaStore((s) => s.setTribArea);
  const setDeltaT = useFeaStore((s) => s.setDeltaT);

  const [presetsOpen, setPresetsOpen] = useState(false);

  useAppTools(appId, [
    {
      toolName: 'add_node',
      description: 'Add a node at (x,y,z) metres. Returns its id.',
      input_schema: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          z: { type: 'number' },
        },
        required: ['x', 'y', 'z'],
      },
      handler: ({ x, y, z }: any) => ({
        id: addNode(Number(x), Number(y), Number(z)),
      }),
    },
    {
      toolName: 'add_element',
      description: 'Connect two nodes with a bar element. Pass node ids a and b.',
      input_schema: {
        type: 'object',
        properties: { a: { type: 'string' }, b: { type: 'string' } },
        required: ['a', 'b'],
      },
      handler: ({ a, b }: any) => {
        beginElement(String(a));
        finishElement(String(b));
        return { ok: true };
      },
    },
    {
      toolName: 'set_support',
      description: 'Pin a node (fix all 3 DOF) or release it. Toggles.',
      input_schema: {
        type: 'object',
        properties: { node: { type: 'string' } },
        required: ['node'],
      },
      handler: ({ node: nd }: any) => {
        toggleSupport(String(nd));
        return { ok: true };
      },
    },
    {
      toolName: 'set_load',
      description: 'Apply a nodal load (N). fx,fy,fz in Newtons.',
      input_schema: {
        type: 'object',
        properties: {
          node: { type: 'string' },
          fx: { type: 'number' },
          fy: { type: 'number' },
          fz: { type: 'number' },
        },
        required: ['node', 'fx', 'fy', 'fz'],
      },
      handler: ({ node: nd, fx, fy, fz }: any) => {
        setLoad(String(nd), Number(fx), Number(fy), Number(fz));
        return { ok: true };
      },
    },
    {
      toolName: 'set_test',
      description:
        'Choose the analysis type: "force", "pressure", or "thermal" (heat).',
      input_schema: {
        type: 'object',
        properties: { test: { type: 'string' } },
        required: ['test'],
      },
      handler: ({ test }: any) => {
        setTest(String(test) as TestType);
        return { ok: true };
      },
    },
    {
      toolName: 'solve_fea',
      description:
        'Run the 3D truss FEA solve. Returns max displacement/stress + per-member forces.',
      input_schema: { type: 'object', properties: {} },
      handler: () => {
        const r = solve();
        return {
          unstable: r.unstable,
          maxDisp: r.maxDisp,
          maxStress: r.maxStress,
          elements: r.elements.map((e) => ({
            id: e.id,
            force: e.force,
            stress: e.stress,
          })),
        };
      },
    },
    {
      toolName: 'load_preset',
      description: `Load an example 3D structure. one of: ${FEA_PRESETS_3D.map((p) => p.id).join(', ')}.`,
      input_schema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      handler: ({ id }: any) => {
        loadPreset(String(id));
        return { ok: true };
      },
    },
  ]);

  useEffect(() => {
    return publishAppState(appId, () => ({
      summary: `FEAForge (3D, ${model.test} test): ${model.nodes.length} nodes, ${model.elements.length} bars, ${model.loads.length} loads. ${
        result
          ? `Solved: maxDisp ${result.maxDisp.toExponential(2)} m, maxStress ${(result.maxStress / 1e6).toFixed(1)} MPa${result.unstable ? ' (UNSTABLE)' : ''}.`
          : 'Not solved yet.'
      }`,
      state: {
        test: model.test,
        nodes: model.nodes.length,
        elements: model.elements.length,
        result: result
          ? { maxDisp: result.maxDisp, maxStress: result.maxStress }
          : null,
      },
    }));
  }, [appId, model, result]);

  const runSolve = () => {
    const r = solve();
    if (r.unstable)
      toast.warn('Unstable structure', 'Not enough supports — it is a mechanism.');
    else
      toast.success(
        'Solved',
        `max δ ${r.maxDisp.toExponential(2)} m · max σ ${(r.maxStress / 1e6).toFixed(1)} MPa`,
      );
  };

  return (
    <div className="flex h-full">
      <div className="w-12 shrink-0 border-r border-white/10 bg-black/25 flex flex-col items-center py-2 gap-1 chrome">
        {(
          [
            ['select', MousePointer2],
            ['node', Circle],
            ['element', Minus],
            ['support', Anchor],
            ['load', ArrowDown],
          ] as [FeaTool, any][]
        ).map(([t, Icon]) => (
          <button
            key={t}
            onClick={() => setTool(t)}
            title={t}
            className={`w-8 h-8 rounded-md flex items-center justify-center ${
              tool === t
                ? 'bg-accent text-white'
                : 'text-white/70 hover:bg-white/10'
            }`}
          >
            <Icon size={15} />
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-9 px-2 flex items-center gap-1 border-b border-white/10 chrome overflow-x-auto">
          <button
            onClick={runSolve}
            className="flex items-center gap-1 px-2 h-6 rounded-md text-xs bg-accent hover:bg-accent-hover text-white shrink-0"
          >
            <Play size={12} /> Solve
          </button>

          <div className="ml-1 flex items-center bg-white/5 rounded-md p-0.5 shrink-0">
            {TESTS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTest(t.id)}
                className={`px-2 h-5 rounded text-[11px] ${
                  model.test === t.id
                    ? 'bg-accent text-white'
                    : 'text-white/65 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {model.test === 'pressure' && (
            <div className="flex items-center gap-1 text-[11px] text-white/65 shrink-0">
              <span className="ml-1">p</span>
              <input
                type="number"
                value={model.pressure}
                step={500}
                onChange={(e) =>
                  setPressure(parseFloat(e.target.value) || 0)
                }
                className="w-16 bg-white/5 border border-white/10 rounded px-1 h-5 font-mono outline-none"
              />
              <span>Pa · A</span>
              <input
                type="number"
                value={model.tribArea}
                step={0.05}
                onChange={(e) =>
                  setTribArea(parseFloat(e.target.value) || 0)
                }
                className="w-14 bg-white/5 border border-white/10 rounded px-1 h-5 font-mono outline-none"
              />
              <span>m²</span>
            </div>
          )}
          {model.test === 'thermal' && (
            <div className="flex items-center gap-1 text-[11px] text-white/65 shrink-0">
              <span className="ml-1">ΔT</span>
              <input
                type="number"
                value={model.deltaT}
                step={5}
                onChange={(e) => setDeltaT(parseFloat(e.target.value) || 0)}
                className="w-16 bg-white/5 border border-white/10 rounded px-1 h-5 font-mono outline-none"
              />
              <span>K</span>
            </div>
          )}

          <label className="ml-2 flex items-center gap-1 text-[11px] text-white/65 shrink-0">
            <input
              type="checkbox"
              checked={showDeformed}
              onChange={(e) => setShowDeformed(e.target.checked)}
            />
            deformed
          </label>
          <span className="ml-1 text-[11px] text-white/55 shrink-0">×</span>
          {[0.25, 1, 3, 10].map((f) => (
            <button
              key={f}
              onClick={() => setDispScale(dispScale * f)}
              className="px-1 h-6 rounded-md text-[11px] hover:bg-white/10 text-white/70 shrink-0"
              title="Multiply the deformed-shape scale"
            >
              ×{f}
            </button>
          ))}

          <select
            value={materialId}
            onChange={(e) => setMaterial(e.target.value)}
            title="Member material"
            className="ml-2 bg-white/5 border border-white/10 rounded-md px-1.5 h-6 text-[11px] outline-none max-w-[150px] shrink-0"
          >
            {ENG_MATERIALS.map((m) => (
              <option key={m.id} value={m.id} className="bg-zinc-800">
                {m.label}
              </option>
            ))}
          </select>

          <div className="relative ml-2 shrink-0">
            <button
              onClick={() => setPresetsOpen((o) => !o)}
              className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
            >
              <BookOpen size={12} /> Examples <ChevronDown size={11} />
            </button>
            {presetsOpen && (
              <div className="absolute top-full left-0 mt-1 glass-strong rounded-md min-w-[220px] py-1 z-30 shadow-window">
                {FEA_PRESETS_3D.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      loadPreset(p.id);
                      setPresetsOpen(false);
                    }}
                    title={p.description}
                    className="block w-full text-left px-2 py-1 text-xs hover:bg-white/10"
                  >
                    <div className="font-medium text-white">{p.name}</div>
                    <div className="text-[10px] text-white/50 truncate">
                      {p.description}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <ImportTrussButton />
          <button
            onClick={clear}
            className="ml-auto flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10 shrink-0"
          >
            <Trash2 size={12} /> Clear
          </button>
        </div>

        <div className="flex-1 min-h-[420px]" style={{ background: '#0b1020' }}>
          <Canvas camera={{ position: [7, 6, 9], fov: 45 }} dpr={[1, 2]}>
            <Scene />
          </Canvas>
        </div>
        <div className="h-6 px-3 flex items-center gap-3 border-t border-white/10 text-[10px] text-white/45 chrome">
          <span>
            Tool: <b className="text-white/70">{tool}</b>
          </span>
          <span>
            {tool === 'node'
              ? 'Click the ground grid to drop a node'
              : tool === 'element'
                ? 'Click two nodes to connect a bar'
                : tool === 'support'
                  ? 'Click a node to pin/release it'
                  : tool === 'load'
                    ? 'Select a node, set its load on the right'
                    : 'Drag to orbit · scroll to zoom · click a node to inspect'}
          </span>
        </div>
      </div>

      <div className="w-60 shrink-0 border-l border-white/10 bg-black/25 flex flex-col chrome overflow-y-auto">
        <SelectedNodePanel />
        <div className="p-3 border-b border-white/10">
          <div className="text-[10px] uppercase text-white/45 mb-2">
            Results · {model.test} test
          </div>
          {!result ? (
            <div className="text-xs text-white/45">Press Solve.</div>
          ) : result.unstable ? (
            <div className="text-traffic-red text-xs">
              Structure is unstable (mechanism). Add more supports/members.
            </div>
          ) : (
            <div className="space-y-1 text-[12px] font-mono">
              <Row k="max δ" v={`${result.maxDisp.toExponential(3)} m`} />
              <Row
                k="max σ"
                v={`${(result.maxStress / 1e6).toFixed(2)} MPa`}
              />
              <Row
                k="utilisation"
                v={`${((result.maxStress / yieldStress) * 100).toFixed(0)}% σy`}
              />
              <Row k="members" v={String(result.elements.length)} />
              {result.maxStress >= yieldStress && (
                <div className="text-traffic-red text-[11px] pt-1">
                  ⚠ a member exceeds yield — the structure would fail
                </div>
              )}
              {(() => {
                const sorted = [...result.elements].sort(
                  (a, b) => b.force - a.force,
                );
                const tension = sorted[0];
                const comp = sorted[sorted.length - 1];
                return (
                  <div className="pt-2 mt-1 border-t border-white/10 space-y-0.5">
                    <div className="text-[10px] uppercase text-white/45">
                      Governing members
                    </div>
                    {tension && tension.force > 0 && (
                      <div className="flex justify-between">
                        <span className="text-rose-400">
                          ↑ tension {tension.id}
                        </span>
                        <span>{(tension.force / 1000).toFixed(2)} kN</span>
                      </div>
                    )}
                    {comp && comp.force < 0 && (
                      <div className="flex justify-between">
                        <span className="text-sky-400">
                          ↓ compr. {comp.id}
                        </span>
                        <span>{(comp.force / 1000).toFixed(2)} kN</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
        <div className="p-3 border-b border-white/10">
          <div className="text-[10px] uppercase text-white/45 mb-1">
            Legend
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span
              className="w-4 h-2 rounded"
              style={{ background: 'rgb(255,30,30)' }}
            />
            tension
            <span
              className="w-4 h-2 rounded ml-2"
              style={{ background: 'rgb(30,100,255)' }}
            />
            compression
          </div>
        </div>
        {result && !result.unstable && (
          <div className="p-3 flex-1">
            <div className="text-[10px] uppercase text-white/45 mb-1.5">
              Member forces
            </div>
            <div className="space-y-0.5 text-[11px] font-mono">
              {result.elements
                .slice()
                .sort((a, b) => Math.abs(b.force) - Math.abs(a.force))
                .map((e) => (
                  <div key={e.id} className="flex justify-between">
                    <span className="text-white/55">{e.id}</span>
                    <span
                      style={{
                        color: stressColor(e.stress, result.maxStress),
                      }}
                    >
                      {e.force >= 0 ? '+' : ''}
                      {(e.force / 1000).toFixed(2)} kN
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ImportTrussButton() {
  const ref = useRef<HTMLInputElement>(null);
  const loadFromGeometry = useFeaStore((s) => s.loadFromGeometry);
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const { loadMeshFile } = await import('@/lib/modeler/importMesh');
      const geom = await loadMeshFile(f);
      const r = loadFromGeometry(geom, f.name.replace(/\.[^.]+$/, ''));
      toast.success(
        'Imported',
        `${r.nodes} nodes, ${r.elements} bars from ${f.name}.`,
      );
    } catch (err) {
      toast.error('Import failed', (err as Error).message);
    } finally {
      e.target.value = '';
    }
  };
  return (
    <>
      <button
        onClick={() => ref.current?.click()}
        className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10 shrink-0"
        title="Import a CAD mesh (OBJ/STL/PLY/GLTF/GLB/3MF/DAE/FBX) — vertices become nodes, edges become bars. Ground-plane nodes are auto-pinned."
      >
        <Upload size={12} /> Import
      </button>
      <input
        ref={ref}
        type="file"
        accept=".obj,.stl,.ply,.gltf,.glb,.3mf,.dae,.fbx"
        hidden
        onChange={onFile}
      />
    </>
  );
}

function SelectedNodePanel() {
  const selectedNode = useFeaStore((s) => s.selectedNode);
  const node = useFeaStore((s) =>
    s.model.nodes.find((n) => n.id === selectedNode),
  );
  const load = useFeaStore((s) =>
    s.model.loads.find((l) => l.node === selectedNode),
  );
  const setLoad = useFeaStore((s) => s.setLoad);
  const moveNode = useFeaStore((s) => s.moveNode);
  const toggleSupport = useFeaStore((s) => s.toggleSupport);
  const removeNode = useFeaStore((s) => s.removeNode);
  if (!node) {
    return (
      <div className="p-3 border-b border-white/10 text-xs text-white/45">
        Select a node to edit its position, support &amp; load.
      </div>
    );
  }
  const fx = load?.fx ?? 0;
  const fy = load?.fy ?? 0;
  const fz = load?.fz ?? 0;
  const fixed = node.fixX || node.fixY || node.fixZ;
  const numCls =
    'flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 font-mono outline-none text-xs';
  return (
    <div className="p-3 border-b border-white/10 space-y-2">
      <div className="text-[10px] uppercase text-white/45">
        Node {node.id}
      </div>
      <div className="text-[10px] uppercase text-white/45">Position (m)</div>
      {(['x', 'y', 'z'] as const).map((ax) => (
        <label key={ax} className="flex items-center gap-2 text-xs">
          <span className="w-4 text-white/55 uppercase">{ax}</span>
          <input
            type="number"
            value={node[ax]}
            step={0.25}
            onChange={(e) => {
              const v = parseFloat(e.target.value) || 0;
              moveNode(
                node.id,
                ax === 'x' ? v : node.x,
                ax === 'y' ? v : node.y,
                ax === 'z' ? v : node.z,
              );
            }}
            className={numCls}
          />
        </label>
      ))}
      <button
        onClick={() => toggleSupport(node.id)}
        className={`w-full px-2 py-1 rounded-md text-xs ${
          fixed
            ? 'bg-emerald-500/30 text-emerald-300'
            : 'bg-white/10 hover:bg-white/15'
        }`}
      >
        {fixed ? 'Pinned (click to release)' : 'Add pinned support'}
      </button>
      <div className="text-[10px] uppercase text-white/45 pt-1">
        Load (N)
      </div>
      {(['fx', 'fy', 'fz'] as const).map((comp) => {
        const val = comp === 'fx' ? fx : comp === 'fy' ? fy : fz;
        return (
          <label key={comp} className="flex items-center gap-2 text-xs">
            <span className="w-6 text-white/55">{comp}</span>
            <input
              type="number"
              value={val}
              step={100}
              onChange={(e) => {
                const v = parseFloat(e.target.value) || 0;
                setLoad(
                  node.id,
                  comp === 'fx' ? v : fx,
                  comp === 'fy' ? v : fy,
                  comp === 'fz' ? v : fz,
                );
              }}
              className={numCls}
            />
          </label>
        );
      })}
      <button
        onClick={() => removeNode(node.id)}
        className="w-full px-2 py-1 rounded-md text-xs bg-traffic-red/20 hover:bg-traffic-red/40 text-traffic-red"
      >
        Delete node
      </button>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-white/55">{k}</span>
      <span className="text-white">{v}</span>
    </div>
  );
}

const module: AppModule = {
  manifest: {
    id: 'feaforge',
    name: 'FEAForge',
    description: '3D space-truss finite-element analysis — force, pressure & thermal',
    icon: Box,
    defaultSize: { width: 1120, height: 720 },
    accent: 'linear-gradient(135deg, #db2777 0%, #f59e0b 100%)',
  },
  Component: FEAForge,
};

export default module;
