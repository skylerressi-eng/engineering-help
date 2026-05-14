import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Center } from '@react-three/drei';
import { Search, Boxes, Download } from 'lucide-react';
import { PartsIcon } from '@/apps/icons';
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

/* Tag color per category for the lightweight card silhouettes */
const CATEGORY_COLORS: Record<string, string> = {
  fasteners: '#fbbf24',
  gears: '#a78bfa',
  bearings: '#22d3ee',
  brackets: '#f472b6',
  springs: '#34d399',
  shafts: '#94a3b8',
  pulleys: '#60a5fa',
  couplings: '#fb7185',
  profiles: '#facc15',
  wheels: '#0ea5e9',
  pneumatic: '#10b981',
  electronics: '#ec4899',
};

function PartCard({
  part,
  selected,
  onClick,
}: {
  part: PartDef;
  selected: boolean;
  onClick: () => void;
}) {
  // Lightweight silhouette derived from category — no R3F per card.
  const accent = CATEGORY_COLORS[part.category] ?? '#94a3b8';
  return (
    <button
      onClick={onClick}
      className={`group rounded-xl overflow-hidden border transition-all ${
        selected
          ? 'border-accent shadow-lg shadow-accent/20 scale-[1.01]'
          : 'border-white/10 hover:border-white/25'
      } bg-black/35 hover:bg-black/55 text-left`}
    >
      <div className="h-28 relative overflow-hidden flex items-center justify-center">
        {/* gradient backdrop */}
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at 30% 30%, ${accent}33 0%, transparent 60%), linear-gradient(135deg, #0b1020 0%, #0f172a 100%)`,
          }}
        />
        {/* category glyph */}
        <PartSilhouette categoryId={part.category} accent={accent} />
        {/* selected ring */}
        {selected && <div className="absolute inset-0 ring-2 ring-accent/40 rounded-xl pointer-events-none" />}
      </div>
      <div className="p-2">
        <div className="text-xs font-medium text-white truncate">{part.name}</div>
        <div className="text-[10px] text-white/50 truncate">{part.category}</div>
      </div>
    </button>
  );
}

/** Per-category SVG silhouette — bright, lightweight, no GL context needed. */
function PartSilhouette({ categoryId, accent }: { categoryId: string; accent: string }) {
  const stroke = accent;
  switch (categoryId) {
    case 'fasteners':
      return (
        <svg viewBox="0 0 64 64" className="w-20 h-20" fill="none" stroke={stroke} strokeWidth={1.6}>
          <polygon points="22,8 42,8 48,14 48,22 42,28 22,28 16,22 16,14" fill={`${stroke}25`} />
          <rect x="28" y="28" width="8" height="30" fill={`${stroke}25`} />
        </svg>
      );
    case 'gears':
      return (
        <svg viewBox="0 0 64 64" className="w-20 h-20" fill="none" stroke={stroke} strokeWidth={1.6}>
          <g fill={`${stroke}20`}>
            {[...Array(10)].map((_, i) => {
              const a = (i / 10) * Math.PI * 2;
              const x = 32 + Math.cos(a) * 24;
              const y = 32 + Math.sin(a) * 24;
              return <rect key={i} x={x - 3} y={y - 3} width="6" height="6" transform={`rotate(${(a * 180) / Math.PI} ${x} ${y})`} />;
            })}
          </g>
          <circle cx="32" cy="32" r="20" fill={`${stroke}20`} />
          <circle cx="32" cy="32" r="6" />
        </svg>
      );
    case 'bearings':
      return (
        <svg viewBox="0 0 64 64" className="w-20 h-20" fill="none" stroke={stroke} strokeWidth={1.6}>
          <circle cx="32" cy="32" r="24" fill={`${stroke}20`} />
          <circle cx="32" cy="32" r="14" fill="#0b1020" />
          <circle cx="32" cy="32" r="8" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const a = (i / 8) * Math.PI * 2;
            return <circle key={i} cx={32 + Math.cos(a) * 19} cy={32 + Math.sin(a) * 19} r="3" fill={stroke} />;
          })}
        </svg>
      );
    case 'brackets':
      return (
        <svg viewBox="0 0 64 64" className="w-20 h-20" fill={`${stroke}25`} stroke={stroke} strokeWidth={1.6}>
          <path d="M14 12h12v28h22v12H14z" />
          <circle cx="42" cy="46" r="2" fill="#0b1020" />
          <circle cx="20" cy="20" r="2" fill="#0b1020" />
        </svg>
      );
    case 'springs':
      return (
        <svg viewBox="0 0 64 64" className="w-20 h-20" fill="none" stroke={stroke} strokeWidth={1.6}>
          <path d="M14 16 H50 M14 24 H50 M14 32 H50 M14 40 H50 M14 48 H50" />
          <ellipse cx="32" cy="16" rx="18" ry="3" fill={`${stroke}25`} />
        </svg>
      );
    case 'shafts':
      return (
        <svg viewBox="0 0 64 64" className="w-20 h-20" fill={`${stroke}25`} stroke={stroke} strokeWidth={1.6}>
          <rect x="6" y="26" width="52" height="12" rx="2" />
          <rect x="22" y="22" width="14" height="6" fill="#0b1020" />
        </svg>
      );
    case 'pulleys':
      return (
        <svg viewBox="0 0 64 64" className="w-20 h-20" fill="none" stroke={stroke} strokeWidth={1.6}>
          <ellipse cx="32" cy="32" rx="22" ry="22" fill={`${stroke}20`} />
          <ellipse cx="32" cy="32" rx="22" ry="6" fill="#0b1020" />
          <circle cx="32" cy="32" r="4" fill={stroke} />
        </svg>
      );
    case 'couplings':
      return (
        <svg viewBox="0 0 64 64" className="w-20 h-20" fill={`${stroke}25`} stroke={stroke} strokeWidth={1.6}>
          <rect x="10" y="22" width="22" height="20" rx="2" />
          <rect x="32" y="22" width="22" height="20" rx="2" />
          <line x1="32" y1="22" x2="32" y2="42" />
        </svg>
      );
    case 'profiles':
      return (
        <svg viewBox="0 0 64 64" className="w-20 h-20" fill={`${stroke}25`} stroke={stroke} strokeWidth={1.6}>
          <rect x="14" y="10" width="36" height="6" />
          <rect x="28" y="16" width="8" height="32" />
          <rect x="14" y="48" width="36" height="6" />
        </svg>
      );
    case 'wheels':
      return (
        <svg viewBox="0 0 64 64" className="w-20 h-20" fill={`${stroke}25`} stroke={stroke} strokeWidth={1.6}>
          <circle cx="32" cy="32" r="22" />
          <circle cx="32" cy="32" r="6" fill="#0b1020" />
          <line x1="32" y1="14" x2="32" y2="26" />
          <line x1="32" y1="38" x2="32" y2="50" />
          <line x1="14" y1="32" x2="26" y2="32" />
          <line x1="38" y1="32" x2="50" y2="32" />
        </svg>
      );
    case 'pneumatic':
      return (
        <svg viewBox="0 0 64 64" className="w-20 h-20" fill={`${stroke}25`} stroke={stroke} strokeWidth={1.6}>
          <rect x="6" y="26" width="32" height="12" rx="2" />
          <rect x="38" y="26" width="20" height="20" rx="2" />
          <circle cx="48" cy="36" r="4" fill="#0b1020" />
        </svg>
      );
    case 'electronics':
      return (
        <svg viewBox="0 0 64 64" className="w-20 h-20" fill={`${stroke}25`} stroke={stroke} strokeWidth={1.6}>
          <rect x="14" y="14" width="36" height="36" rx="4" />
          <line x1="22" y1="22" x2="22" y2="50" />
          <line x1="30" y1="22" x2="30" y2="50" />
          <line x1="38" y1="22" x2="38" y2="50" />
          <circle cx="42" cy="42" r="2" fill={stroke} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 64 64" className="w-16 h-16" fill="none" stroke={stroke} strokeWidth={1.6}>
          <rect x="14" y="14" width="36" height="36" rx="4" />
        </svg>
      );
  }
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
    icon: PartsIcon,
    defaultSize: { width: 1100, height: 660 },
    accent: 'linear-gradient(135deg, #84cc16 0%, #10b981 100%)',
  },
  Component: PartsLib,
};

export default module;
