import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Trash2 } from 'lucide-react';
import { CalculatorIcon } from '@/apps/icons';
import type { AppModule } from '@/os/types';
import {
  evaluate,
  formatNumber,
  parseInBase,
  formatInBase,
  tryEvaluate,
  type AngleMode,
} from '@/lib/calc/evaluator';
import { useAppTools } from '@/hooks/useToolRegistry';
import { publishAppState } from '@/ai/screenScanner';

type Tab = 'sci' | 'prog';

interface HistoryEntry {
  expr: string;
  result: string;
}

function Calculator({ appId }: { appId: string }) {
  const [tab, setTab] = useState<Tab>('sci');
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState('0');
  const [angleMode, setAngleMode] = useState<AngleMode>('rad');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(true);

  const livePreview = useMemo(() => {
    if (!expr.trim()) return null;
    const v = tryEvaluate(expr, { angleMode });
    if (v === null || !Number.isFinite(v)) return null;
    return formatNumber(v);
  }, [expr, angleMode]);

  const insert = (s: string) => setExpr((e) => e + s);
  const backspace = () => setExpr((e) => e.slice(0, -1));
  const clear = () => {
    setExpr('');
    setResult('0');
  };

  const compute = () => {
    if (!expr.trim()) return;
    try {
      const v = evaluate(expr, { angleMode });
      const formatted = formatNumber(v);
      setResult(formatted);
      setHistory((h) => [{ expr, result: formatted }, ...h].slice(0, 50));
      setExpr(formatted);
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Error');
    }
  };

  // Keyboard support
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (!el.contains(document.activeElement) && document.activeElement !== document.body)
        return;
      if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        compute();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        backspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        clear();
      } else if (/^[0-9+\-*/().^!%]$/.test(e.key)) {
        e.preventDefault();
        insert(e.key);
      } else if (e.key === ',') {
        e.preventDefault();
        insert('.');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expr, angleMode]);

  // Publish state for the screen scanner
  useEffect(() => {
    return publishAppState(appId, () => ({
      summary: `The Calculator is in ${
        tab === 'sci' ? 'Scientific' : 'Programmer'
      } mode. Current expression: "${expr}". Last result: ${result}. ${
        tab === 'sci' ? `Angle mode: ${angleMode}.` : ''
      }`,
      state: { tab, expr, result, angleMode, history: history.slice(0, 5) },
    }));
  }, [appId, tab, expr, result, angleMode, history]);

  // Register AI tools
  useAppTools(appId, [
    {
      toolName: 'evaluate_expression',
      description:
        'Evaluate a scientific math expression (supports +,-,*,/,^,%, parentheses, sin/cos/tan/asin/acos/atan, log/ln, sqrt/cbrt, exp, factorial !, constants pi/e). Also updates the calculator UI.',
      input_schema: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'The math expression' },
          angle_mode: { type: 'string', enum: ['rad', 'deg'] },
        },
        required: ['expression'],
      },
      handler: ({ expression, angle_mode }: any) => {
        const mode = (angle_mode as AngleMode) ?? angleMode;
        const v = evaluate(String(expression), { angleMode: mode });
        const formatted = formatNumber(v);
        setExpr(String(expression));
        setResult(formatted);
        setHistory((h) => [{ expr: String(expression), result: formatted }, ...h].slice(0, 50));
        return { result: formatted, value: v };
      },
    },
    {
      toolName: 'convert_base',
      description:
        'Convert an integer between bases. Bases are: bin (2), oct (8), dec (10), hex (16).',
      input_schema: {
        type: 'object',
        properties: {
          value: { type: 'string', description: 'Number as a string' },
          from: { type: 'string', enum: ['bin', 'oct', 'dec', 'hex'] },
          to: { type: 'string', enum: ['bin', 'oct', 'dec', 'hex'] },
        },
        required: ['value', 'from', 'to'],
      },
      handler: ({ value, from, to }: any) => {
        const baseMap: Record<string, 2 | 8 | 10 | 16> = { bin: 2, oct: 8, dec: 10, hex: 16 };
        const n = parseInBase(String(value), baseMap[from]);
        if (n === null) throw new Error(`Invalid ${from} number "${value}"`);
        setTab('prog');
        setExpr(n.toString(10));
        const out = formatInBase(n, baseMap[to]);
        setResult(out);
        return { result: out };
      },
    },
  ]);

  return (
    <div ref={rootRef} tabIndex={0} className="flex flex-col h-full focus:outline-none">
      {/* Tabs */}
      <div className="flex border-b border-white/10 chrome">
        {(['sci', 'prog'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              clear();
            }}
            className={`px-4 h-9 text-sm ${
              tab === t
                ? 'text-white border-b-2 border-accent -mb-px'
                : 'text-white/55 hover:text-white/85'
            }`}
          >
            {t === 'sci' ? 'Scientific' : 'Programmer'}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 pr-2">
          {tab === 'sci' && (
            <button
              onClick={() => setAngleMode((m) => (m === 'rad' ? 'deg' : 'rad'))}
              className="text-[11px] px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/15 font-mono uppercase tracking-wide"
            >
              {angleMode}
            </button>
          )}
          <button
            onClick={() => setHistoryOpen((o) => !o)}
            title="History"
            className={`p-1 rounded-md ${historyOpen ? 'bg-white/15' : 'hover:bg-white/10'}`}
          >
            <Clock size={14} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0">
          {tab === 'sci' ? (
            <Scientific
              expr={expr}
              result={result}
              livePreview={livePreview}
              onInsert={insert}
              onBackspace={backspace}
              onClear={clear}
              onCompute={compute}
            />
          ) : (
            <Programmer expr={expr} setExpr={setExpr} onClear={clear} />
          )}
        </div>

        {/* History */}
        {historyOpen && (
          <div className="w-44 border-l border-white/10 flex flex-col chrome">
            <div className="flex items-center justify-between px-2 h-7 text-[11px] text-white/55 uppercase tracking-wide">
              History
              {history.length > 0 && (
                <button onClick={() => setHistory([])} title="Clear">
                  <Trash2 size={11} />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto text-[12px] divide-y divide-white/5">
              {history.length === 0 && (
                <div className="px-2 py-2 text-white/40 text-xs">No history yet</div>
              )}
              {history.map((h, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setExpr(h.expr);
                    setResult(h.result);
                  }}
                  className="w-full text-left px-2 py-1.5 hover:bg-white/5"
                >
                  <div className="font-mono text-white/55 truncate">{h.expr}</div>
                  <div className="font-mono text-white/90">= {h.result}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Scientific({
  expr,
  result,
  livePreview,
  onInsert,
  onBackspace,
  onClear,
  onCompute,
}: {
  expr: string;
  result: string;
  livePreview: string | null;
  onInsert: (s: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onCompute: () => void;
}) {
  const rows: Array<Array<{ label: string; v?: string; accent?: 'op' | 'fn' | 'eq' | 'clr' }>> = [
    [
      { label: 'C', accent: 'clr' },
      { label: '(', v: '(', accent: 'op' },
      { label: ')', v: ')', accent: 'op' },
      { label: '⌫', accent: 'clr' },
      { label: '÷', v: '/', accent: 'op' },
    ],
    [
      { label: 'sin', v: 'sin(', accent: 'fn' },
      { label: 'cos', v: 'cos(', accent: 'fn' },
      { label: 'tan', v: 'tan(', accent: 'fn' },
      { label: 'xʸ', v: '^', accent: 'op' },
      { label: '×', v: '*', accent: 'op' },
    ],
    [
      { label: 'ln', v: 'ln(', accent: 'fn' },
      { label: '7' },
      { label: '8' },
      { label: '9' },
      { label: '−', v: '-', accent: 'op' },
    ],
    [
      { label: 'log', v: 'log(', accent: 'fn' },
      { label: '4' },
      { label: '5' },
      { label: '6' },
      { label: '+', v: '+', accent: 'op' },
    ],
    [
      { label: '√', v: 'sqrt(', accent: 'fn' },
      { label: '1' },
      { label: '2' },
      { label: '3' },
      { label: 'x!', v: '!', accent: 'fn' },
    ],
    [
      { label: 'π', v: 'π', accent: 'fn' },
      { label: 'e', v: 'e', accent: 'fn' },
      { label: '0' },
      { label: '.', v: '.' },
      { label: '=', accent: 'eq' },
    ],
  ];

  return (
    <>
      <div className="px-4 pt-4 pb-2 flex flex-col items-end justify-end min-h-[88px] bg-black/15">
        <div className="font-mono text-white/55 text-sm break-all text-right max-w-full">
          {expr || ' '}
        </div>
        <div className="font-mono text-3xl font-semibold text-white tabular-nums truncate max-w-full">
          {livePreview ?? result}
        </div>
      </div>
      <div className="grid grid-cols-5 gap-1 p-2 flex-1">
        {rows.flat().map((b, i) => (
          <CalcButton
            key={i}
            label={b.label}
            accent={b.accent}
            onClick={() => {
              if (b.label === 'C') onClear();
              else if (b.label === '⌫') onBackspace();
              else if (b.label === '=') onCompute();
              else onInsert(b.v ?? b.label);
            }}
          />
        ))}
      </div>
    </>
  );
}

function CalcButton({
  label,
  accent,
  onClick,
}: {
  label: string;
  accent?: 'op' | 'fn' | 'eq' | 'clr';
  onClick: () => void;
}) {
  const cls =
    accent === 'eq'
      ? 'bg-accent hover:bg-accent-hover text-white'
      : accent === 'op'
        ? 'bg-white/15 hover:bg-white/25 text-white'
        : accent === 'fn'
          ? 'bg-white/8 hover:bg-white/15 text-white/90'
          : accent === 'clr'
            ? 'bg-white/15 hover:bg-white/25 text-white'
            : 'bg-white/5 hover:bg-white/12 text-white';
  return (
    <button
      onClick={onClick}
      className={`rounded-lg font-medium text-base transition-colors ${cls}`}
    >
      {label}
    </button>
  );
}

function Programmer({
  expr,
  setExpr,
  onClear,
}: {
  expr: string;
  setExpr: (s: string) => void;
  onClear: () => void;
}) {
  // Parse expr as decimal bigint; if invalid, show 0.
  const value = useMemo(() => {
    const n = parseInBase(expr.trim() || '0', 10);
    return n ?? 0n;
  }, [expr]);
  const setVal = (n: bigint) => setExpr(n.toString(10));

  const op = (fn: (a: bigint, b: bigint) => bigint, b: bigint) => setVal(fn(value, b));
  const button = (label: string, onClick: () => void, accent?: 'op' | 'fn') => (
    <button
      key={label}
      onClick={onClick}
      className={`rounded-lg font-medium text-sm h-10 ${
        accent === 'op'
          ? 'bg-white/15 hover:bg-white/25'
          : accent === 'fn'
            ? 'bg-white/8 hover:bg-white/15'
            : 'bg-white/5 hover:bg-white/12'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-4 pt-3 pb-2 bg-black/15">
        <BaseRow label="HEX" value={formatInBase(value, 16).toUpperCase()} onChange={(s) => {
          const n = parseInBase(s, 16);
          if (n !== null) setVal(n);
        }} />
        <BaseRow label="DEC" value={formatInBase(value, 10)} onChange={(s) => {
          const n = parseInBase(s, 10);
          if (n !== null) setVal(n);
        }} />
        <BaseRow label="OCT" value={formatInBase(value, 8)} onChange={(s) => {
          const n = parseInBase(s, 8);
          if (n !== null) setVal(n);
        }} />
        <BaseRow label="BIN" value={formatInBase(value, 2)} onChange={(s) => {
          const n = parseInBase(s, 2);
          if (n !== null) setVal(n);
        }} />
        <div className="text-[11px] text-white/45 mt-1 font-mono">
          two's complement (64-bit) view applies for negative values
        </div>
      </div>

      <div className="grid grid-cols-6 gap-1 p-2 flex-1 content-start">
        {button('AND', () => {
          const b = prompt('AND with (decimal):');
          if (b) op((a, x) => a & x, BigInt(b));
        }, 'fn')}
        {button('OR', () => {
          const b = prompt('OR with (decimal):');
          if (b) op((a, x) => a | x, BigInt(b));
        }, 'fn')}
        {button('XOR', () => {
          const b = prompt('XOR with (decimal):');
          if (b) op((a, x) => a ^ x, BigInt(b));
        }, 'fn')}
        {button('NOT', () => setVal(~value), 'fn')}
        {button('<<', () => {
          const b = prompt('Shift left by:');
          if (b) setVal(value << BigInt(b));
        }, 'fn')}
        {button('>>', () => {
          const b = prompt('Shift right by:');
          if (b) setVal(value >> BigInt(b));
        }, 'fn')}

        {['A', 'B', 'C', 'D', 'E', 'F'].map((c) => button(c, () => setExpr(expr + c)))}
        {['7', '8', '9'].map((c) => button(c, () => setExpr(expr + c)))}
        {button('+', () => setExpr(expr + '+'), 'op')}
        {button('−', () => setExpr(expr + '-'), 'op')}
        {button('C', onClear, 'op')}

        {['4', '5', '6'].map((c) => button(c, () => setExpr(expr + c)))}
        {button('×', () => setExpr(expr + '*'), 'op')}
        {button('÷', () => setExpr(expr + '/'), 'op')}
        {button('±', () => setVal(-value), 'op')}

        {['1', '2', '3', '0'].map((c) => button(c, () => setExpr(expr + c)))}
        {button('=', () => {
          try {
            const v = evaluate(expr || '0');
            setVal(BigInt(Math.trunc(v)));
          } catch {
            /* ignore */
          }
        }, 'op')}
        {button('⌫', () => setExpr(expr.slice(0, -1)), 'op')}
      </div>
    </div>
  );
}

function BaseRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-0.5">
      <div className="text-[10px] text-white/55 w-8 font-mono">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="flex-1 bg-transparent outline-none font-mono text-base text-white truncate"
      />
    </div>
  );
}

const module: AppModule = {
  manifest: {
    id: 'calculator',
    name: 'Calculator',
    description: 'Scientific + Programmer calculator with bitwise ops and history',
    icon: CalculatorIcon,
    defaultSize: { width: 480, height: 540 },
    accent: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
  },
  Component: Calculator,
};

export default module;
