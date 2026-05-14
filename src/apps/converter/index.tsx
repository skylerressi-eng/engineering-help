import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { ConverterIcon } from '@/apps/icons';
import type { AppModule } from '@/os/types';
import {
  CATEGORIES,
  convert,
  formatValue,
  findUnit,
  getCategory,
  type CategoryId,
} from '@/lib/units';
import { useAppTools } from '@/hooks/useToolRegistry';
import { publishAppState } from '@/ai/screenScanner';

function Converter({ appId }: { appId: string }) {
  const [categoryId, setCategoryId] = useState<CategoryId>('length');
  const [fromUnit, setFromUnit] = useState('m');
  const [toUnit, setToUnit] = useState('ft');
  const [input, setInput] = useState('1');
  const [engineering, setEngineering] = useState(false);
  const [precision, setPrecision] = useState(6);

  const category = useMemo(() => getCategory(categoryId), [categoryId]);

  // Derive a SAFE unit synchronously: if the stored fromUnit/toUnit doesn't
  // belong to the current category, fall back to the first/second unit of the
  // category. Avoids the convert() throw that would blank the whole window.
  const safeFromUnit = category.units.find((u) => u.id === fromUnit)
    ? fromUnit
    : category.units[0].id;
  const safeToUnit = category.units.find((u) => u.id === toUnit)
    ? toUnit
    : category.units[1]?.id ?? category.units[0].id;

  // Reconcile the stored state to the safe one in an effect (so the next
  // render is consistent). We avoid touching state during render.
  useEffect(() => {
    if (safeFromUnit !== fromUnit) setFromUnit(safeFromUnit);
    if (safeToUnit !== toUnit) setToUnit(safeToUnit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeFromUnit, safeToUnit]);

  const numericInput = parseFloat(input);
  let output: string;
  try {
    output =
      Number.isFinite(numericInput) && safeFromUnit && safeToUnit
        ? formatValue(convert(numericInput, safeFromUnit, safeToUnit, categoryId), {
            engineering,
            precision,
          })
        : '—';
  } catch (err) {
    output = '—';
    console.warn('convert failed', err);
  }

  const swap = () => {
    setFromUnit(safeToUnit);
    setToUnit(safeFromUnit);
    if (Number.isFinite(numericInput)) {
      try {
        const v = convert(numericInput, safeFromUnit, safeToUnit, categoryId);
        setInput(String(v));
      } catch {
        /* ignore */
      }
    }
  };

  // Publish state for scanner
  useEffect(() => {
    return publishAppState(appId, () => ({
      summary: `Unit Converter is showing category "${category.label}". Converting ${input} ${safeFromUnit} = ${output} ${safeToUnit}.`,
      state: { category: categoryId, fromUnit: safeFromUnit, toUnit: safeToUnit, input, output, engineering, precision },
    }));
  }, [appId, categoryId, safeFromUnit, safeToUnit, input, output, engineering, precision, category.label]);

  // AI tool
  useAppTools(appId, [
    {
      toolName: 'convert_units',
      description:
        'Convert a numeric value from one unit to another. Supported categories: length, mass, force, pressure, energy, power, torque, temperature, angle, time, velocity, acceleration, area, volume. Also updates the converter UI.',
      input_schema: {
        type: 'object',
        properties: {
          value: { type: 'number' },
          from: { type: 'string', description: 'Source unit id or label (e.g. "m", "psi", "°C")' },
          to: { type: 'string', description: 'Target unit id or label' },
        },
        required: ['value', 'from', 'to'],
      },
      handler: ({ value, from, to }: any) => {
        const a = findUnit(String(from));
        const b = findUnit(String(to));
        if (!a) throw new Error(`Unknown unit "${from}"`);
        if (!b) throw new Error(`Unknown unit "${to}"`);
        if (a.category !== b.category) {
          throw new Error(
            `Cannot convert ${a.unit.label} (${a.category}) to ${b.unit.label} (${b.category})`,
          );
        }
        const result = convert(Number(value), a.unit.id, b.unit.id, a.category);
        setCategoryId(a.category);
        setFromUnit(a.unit.id);
        setToUnit(b.unit.id);
        setInput(String(value));
        return {
          result,
          formatted: formatValue(result, { engineering, precision }),
          unit: b.unit.label,
        };
      },
    },
  ]);

  return (
    <div className="flex flex-col h-full">
      {/* Category tabs (scrollable) */}
      <div className="flex gap-1 overflow-x-auto px-2 py-1.5 chrome border-b border-white/10">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategoryId(c.id)}
            className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap ${
              categoryId === c.id ? 'bg-accent text-white' : 'text-white/65 hover:bg-white/10'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Conversion area */}
      <div className="flex-1 p-4 flex flex-col gap-4 min-h-0">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
          <UnitPicker
            value={safeFromUnit}
            onChange={setFromUnit}
            categoryId={categoryId}
            input={input}
            onInputChange={setInput}
            editable
          />
          <button
            onClick={swap}
            title="Swap"
            className="self-center w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
          >
            <ArrowLeftRight size={16} />
          </button>
          <UnitPicker
            value={safeToUnit}
            onChange={setToUnit}
            categoryId={categoryId}
            input={output}
            editable={false}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 text-xs text-white/70 mt-1">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={engineering}
              onChange={(e) => setEngineering(e.target.checked)}
            />
            Engineering notation
          </label>
          <label className="flex items-center gap-2">
            Precision
            <input
              type="range"
              min={0}
              max={15}
              value={precision}
              onChange={(e) => setPrecision(parseInt(e.target.value, 10))}
              className="w-28"
            />
            <span className="tabular-nums w-4 text-right">{precision}</span>
          </label>
        </div>

        {/* Presets */}
        <div className="text-xs text-white/55">
          <div className="mb-1.5">Common units:</div>
          <div className="flex flex-wrap gap-1.5">
            {category.units.slice(0, 8).map((u) => (
              <button
                key={u.id}
                onClick={() => setToUnit(u.id)}
                className={`px-2 py-0.5 rounded-md ${
                  safeToUnit === u.id
                    ? 'bg-accent text-white'
                    : 'bg-white/5 hover:bg-white/10 text-white/75'
                }`}
                title={u.name}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function UnitPicker({
  value,
  onChange,
  categoryId,
  input,
  onInputChange,
  editable,
}: {
  value: string;
  onChange: (id: string) => void;
  categoryId: CategoryId;
  input: string;
  onInputChange?: (v: string) => void;
  editable: boolean;
}) {
  const cat = getCategory(categoryId);
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex flex-col">
      <input
        value={input}
        onChange={(e) => editable && onInputChange?.(e.target.value)}
        readOnly={!editable}
        placeholder="0"
        spellCheck={false}
        className="bg-transparent outline-none font-mono text-2xl text-white tabular-nums w-full"
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-sm text-white outline-none"
      >
        {cat.units.map((u) => (
          <option key={u.id} value={u.id} className="bg-zinc-800">
            {u.label} — {u.name}
          </option>
        ))}
      </select>
    </div>
  );
}

const module: AppModule = {
  manifest: {
    id: 'converter',
    name: 'Unit Converter',
    description: 'Convert between engineering units (length, force, pressure, energy, etc.)',
    icon: ConverterIcon,
    defaultSize: { width: 600, height: 460 },
    accent: 'linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%)',
  },
  Component: Converter,
};

export default module;
