import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Sparkles } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useWindowStore } from '@/store/windowStore';
import { APP_LIST } from '@/apps/registry';

type Result =
  | { kind: 'app'; id: string; name: string; description: string }
  | { kind: 'ai'; query: string };

function fuzzyScore(needle: string, hay: string): number {
  needle = needle.toLowerCase();
  hay = hay.toLowerCase();
  if (!needle) return 0;
  if (hay.includes(needle)) return 100 - hay.indexOf(needle);
  let score = 0;
  let hi = 0;
  for (const ch of needle) {
    const idx = hay.indexOf(ch, hi);
    if (idx < 0) return -1;
    score += 5 - Math.min(4, idx - hi);
    hi = idx + 1;
  }
  return score;
}

export default function Spotlight() {
  const open = useUIStore((s) => s.spotlightOpen);
  const close = useUIStore((s) => s.closeSpotlight);
  const openApp = useWindowStore((s) => s.openApp);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const results: Result[] = useMemo(() => {
    if (!q.trim()) {
      return APP_LIST.map((a) => ({
        kind: 'app' as const,
        id: a.manifest.id,
        name: a.manifest.name,
        description: a.manifest.description,
      }));
    }
    const scored = APP_LIST.map((a) => {
      const s = Math.max(
        fuzzyScore(q, a.manifest.name),
        fuzzyScore(q, a.manifest.description) - 5,
      );
      return { app: a, s };
    })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 6)
      .map((x) => ({
        kind: 'app' as const,
        id: x.app.manifest.id,
        name: x.app.manifest.name,
        description: x.app.manifest.description,
      }));
    return [...scored, { kind: 'ai' as const, query: q }];
  }, [q]);

  useEffect(() => {
    if (active >= results.length) setActive(0);
  }, [results.length, active]);

  const runResult = (r: Result) => {
    if (r.kind === 'app') {
      openApp(r.id, { title: APP_LIST.find((a) => a.manifest.id === r.id)?.manifest.name });
    } else {
      // AI not built yet — placeholder behavior so the option works in Phase 1.
      alert(`AI query (stub until Phase 2):\n${r.query}`);
    }
    close();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[active];
      if (r) runResult(r);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[6000] flex items-start justify-center pt-[18vh]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <motion.div
            initial={{ y: -10, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -10, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="w-[560px] max-w-[90vw] rounded-2xl overflow-hidden glass-strong glass-edge shadow-window"
          >
            <div className="flex items-center gap-3 px-4 h-14 border-b border-white/10">
              <Search size={20} className="text-white/60 shrink-0" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKey}
                placeholder="Search apps, files, ask AI…"
                className="flex-1 bg-transparent outline-none text-white text-lg placeholder:text-white/40"
              />
            </div>
            <div className="max-h-[360px] overflow-y-auto py-1">
              {results.length === 0 && (
                <div className="px-4 py-6 text-center text-white/50 text-sm">No results</div>
              )}
              {results.map((r, i) => (
                <button
                  key={r.kind === 'app' ? `app-${r.id}` : `ai-${i}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => runResult(r)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${
                    i === active ? 'bg-white/10' : ''
                  }`}
                >
                  {r.kind === 'app' ? (
                    <AppResult id={r.id} name={r.name} description={r.description} />
                  ) : (
                    <>
                      <div className="w-8 h-8 rounded-md flex items-center justify-center bg-gradient-to-br from-fuchsia-500 to-rose-500">
                        <Sparkles size={16} className="text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="text-white text-[14px]">Ask AI: <span className="opacity-80">{r.query}</span></div>
                        <div className="text-white/50 text-xs">Send to EngOS AI</div>
                      </div>
                    </>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AppResult({ id, name, description }: { id: string; name: string; description: string }) {
  const app = APP_LIST.find((a) => a.manifest.id === id);
  const Icon = app?.manifest.icon;
  return (
    <>
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center"
        style={{
          background: app?.manifest.accent ?? 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
        }}
      >
        {Icon ? <Icon className="text-white" size={16} /> : null}
      </div>
      <div className="flex-1">
        <div className="text-white text-[14px]">{name}</div>
        <div className="text-white/50 text-xs">{description}</div>
      </div>
      <div className="text-white/40 text-xs">App</div>
    </>
  );
}
