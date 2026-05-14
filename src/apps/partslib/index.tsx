import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PresentationControls, Center } from '@react-three/drei';
import { Search, Boxes, Download } from 'lucide-react';
import * as THREE from 'three';
import type { AppModule } from '@/os/types';
import {
  CATEGORIES,
  PARTS,
  defaultParams,
  findPart,
  searchParts,
  type PartDef,
} from '@/lib/parts/catalog';
import { useAppTools } from '@/hooks/useToolRegistry';
import { publishAppState } from '@/ai/screenScanner';
import { useModelerStore } from '@/store/modelerStore';
import { useWindowStore } from '@/store/windowStore';
import { downloadBlob, toBinarySTL } from '@/lib/modeler/exporters';

function PartsLib({ appId }: { appId: string }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, number>>({});

  const filtered = useMemo(() => {
    const list = query ? searchParts(query) : PARTS;
    return category ? list.filter((p) => p.category === category) : list;
  }, [query, category]);

  const selected = selectedId ? findPart(selectedId) : null;
  const geometry = useMemo(() => {
    if (!selected) return null;
    try {
      return selected.build(params);
    } catch (err) {
      console.error('Part build failed', err);
      return null;
    }
  }, [selected, params]);

  // When a new part is selected, reset its params
  useEffect(() => {
    if (selected) setParams(defaultParams(selected));
  }, [selected]);

  // Publish for AI scanner
  useEffect(() => {
    return publishAppState(appId, () => ({
      summary: `PartsLib showing ${filtered.length} part(s). ${
        selected ? `Selected: ${selected.name} with params ${JSON.stringify(params)}` : ''
      }`,
      state: {
        query,
        category,
        selected: selected?.id ?? null,
        params,
      },
    }));
  }, [appId, filtered.length, query, category, selected, params]);

  const sendToModeler = () => {
    if (!geometry || !selected) return;
    useModelerStore.getState().addCustomObject(selected.name, geometry.clone());
    useWindowStore.getState().openApp('modeler3d', { title: 'Modeler3D' });
  };

  const exportSTL = () => {
    if (!geometry || !selected) return;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.updateMatrixWorld(true);
    downloadBlob(`${selected.id}.stl`, toBinarySTL([mesh]), 'model/stl');
  };

  // AI tools
  useAppTools(appId, [
    {
      toolName: 'search_parts',
      description: 'Search the parts catalog by free-text query. Returns matching parts with id, name, category.',
      input_schema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
      handler: ({ query: q }: any) => {
        const results = searchParts(String(q));
        return results.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          description: p.description,
          params: p.params.map((pp) => pp.key),
        }));
      },
    },
    {
      toolName: 'select_part',
      description: 'Select a part in the UI and optionally set parameter values.',
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          params: { type: 'object' },
        },
        required: ['id'],
      },
      handler: ({ id, params: pset }: any) => {
        const p = findPart(String(id));
        if (!p) throw new Error(`Unknown part: ${id}`);
        setSelectedId(p.id);
        setParams({ ...defaultParams(p), ...(pset ?? {}) });
        return { ok: true };
      },
    },
    {
      toolName: 'add_to_modeler',
      description:
        'Build the currently-selected (or specified) part with the given params and add it to Modeler3D as a new object.',
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Optional part id; uses the selected one if omitted' },
          params: { type: 'object' },
        },
      },
      handler: ({ id, params: pset }: any) => {
        const partId = id ?? selectedId;
        if (!partId) throw new Error('No part selected');
        const p = findPart(partId);
        if (!p) throw new Error(`Unknown part: ${partId}`);
        const merged = { ...defaultParams(p), ...(pset ?? {}) };
        const geom = p.build(merged);
        const oid = useModelerStore.getState().addCustomObject(p.name, geom);
        useWindowStore.getState().openApp('modeler3d', { title: 'Modeler3D' });
        return { id: oid };
      },
    },
    {
      toolName: 'list_parts',
      description: 'List all parts in the catalog.',
      input_schema: { type: 'object', properties: {} },
      handler: () =>
        PARTS.map((p) => ({ id: p.id, name: p.name, category: p.category })),
    },
  ]);

  return (
    <div className="flex h-full">
      {/* Sidebar: categories */}
      <div className="w-44 shrink-0 border-r border-white/10 bg-black/20 p-2 chrome flex flex-col gap-1 overflow-y-auto">
        <div className="text-[10px] uppercase tracking-wide text-white/45 px-1 pb-1">Categories</div>
        <button
          onClick={() => setCategory(null)}
          className={`text-left px-2 py-1 rounded-md text-xs ${
            !category ? 'bg-accent text-white' : 'hover:bg-white/10 text-white/75'
          }`}
        >
          All parts
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={`text-left px-2 py-1 rounded-md text-xs ${
              category === c.id ? 'bg-accent text-white' : 'hover:bg-white/10 text-white/75'
            }`}
          >
            {c.label}
            <span className="ml-1 text-white/40 text-[10px]">
              {PARTS.filter((p) => p.category === c.id).length}
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Search */}
        <div className="h-10 px-3 flex items-center gap-2 border-b border-white/10 chrome">
          <Search size={14} className="text-white/55" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search bolts, gears, brackets…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-white/40"
          />
        </div>

        {/* Card grid */}
        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 content-start">
          {filtered.map((p) => (
            <PartCard
              key={p.id}
              part={p}
              selected={p.id === selectedId}
              onClick={() => setSelectedId(p.id)}
            />
          ))}
          {!filtered.length && (
            <div className="col-span-full text-center text-white/45 py-8">No parts match.</div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div className="w-80 shrink-0 border-l border-white/10 bg-black/25 flex flex-col chrome">
        {!selected ? (
          <div className="m-auto text-white/45 text-sm">Select a part</div>
        ) : (
          <>
            <div className="h-56 border-b border-white/10 relative">
              <DetailView geometry={geometry} />
            </div>
            <div className="p-3 overflow-y-auto flex-1 space-y-3">
              <div>
                <div className="font-semibold text-white">{selected.name}</div>
                <div className="text-[11px] text-white/55">{selected.description}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-white/45 mb-1">Parameters</div>
                <div className="space-y-2">
                  {selected.params.map((p) => (
                    <ParamSlider
                      key={p.key}
                      param={p}
                      value={params[p.key] ?? p.default}
                      onChange={(v) => setParams((s) => ({ ...s, [p.key]: v }))}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={sendToModeler}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white text-xs"
                >
                  <Boxes size={12} /> Add to Modeler3D
                </button>
                <button
                  onClick={exportSTL}
                  title="Export STL"
                  className="p-1.5 rounded-md bg-white/10 hover:bg-white/15"
                >
                  <Download size={13} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PartCard({
  part,
  selected,
  onClick,
}: {
  part: PartDef;
  selected: boolean;
  onClick: () => void;
}) {
  const geom = useMemo(() => {
    try {
      return part.build(defaultParams(part));
    } catch {
      return null;
    }
  }, [part]);
  return (
    <button
      onClick={onClick}
      className={`rounded-lg overflow-hidden border ${
        selected ? 'border-accent' : 'border-white/10'
      } bg-black/35 hover:bg-black/50 text-left transition-colors`}
    >
      <div className="h-32 relative">
        <Canvas camera={{ position: [2.5, 2, 3], fov: 35 }} dpr={[1, 2]}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[4, 6, 4]} intensity={1.4} />
          <directionalLight position={[-4, -2, -6]} intensity={0.3} />
          <PresentationControls
            global
            rotation={[0.2, 0.4, 0]}
            polar={[-0.4, 0.4]}
            azimuth={[-0.6, 0.6]}
          >
            {geom && (
              <Center>
                <mesh geometry={geom}>
                  <meshStandardMaterial color="#cbd5e1" metalness={0.55} roughness={0.35} />
                </mesh>
              </Center>
            )}
          </PresentationControls>
        </Canvas>
      </div>
      <div className="p-2">
        <div className="text-xs font-medium text-white truncate">{part.name}</div>
        <div className="text-[10px] text-white/50 truncate">{part.category}</div>
      </div>
    </button>
  );
}

function DetailView({ geometry }: { geometry: THREE.BufferGeometry | null }) {
  return (
    <Canvas camera={{ position: [3, 2.5, 4], fov: 35 }} dpr={[1, 2]}>
      <color attach="background" args={['#0b1020']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[6, 8, 4]} intensity={1.4} />
      <directionalLight position={[-4, -4, -6]} intensity={0.4} />
      <OrbitControls enableDamping autoRotate autoRotateSpeed={0.6} />
      {geometry && (
        <Center>
          <mesh geometry={geometry} castShadow receiveShadow>
            <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} />
          </mesh>
        </Center>
      )}
      <gridHelper args={[10, 10, '#1f2937', '#1f2937']} position={[0, -1.5, 0]} />
    </Canvas>
  );
}

function ParamSlider({
  param,
  value,
  onChange,
}: {
  param: { key: string; label: string; min: number; max: number; step: number; unit?: string };
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-white/65 mb-0.5">
        <span>{param.label}</span>
        <span className="font-mono text-white/85">
          {value.toFixed(param.step < 0.1 ? 2 : 1)} {param.unit ?? ''}
        </span>
      </div>
      <input
        type="range"
        min={param.min}
        max={param.max}
        step={param.step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

const module: AppModule = {
  manifest: {
    id: 'partslib',
    name: 'PartsLib',
    description: 'Procedural mechanical parts library — bolts, gears, bearings, springs',
    icon: Boxes,
    defaultSize: { width: 1100, height: 660 },
    accent: 'linear-gradient(135deg, #84cc16 0%, #10b981 100%)',
  },
  Component: PartsLib,
};

export default module;
