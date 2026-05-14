import { useEffect, useRef, useState } from 'react';
import { Wifi, Battery, Search, Sparkles } from 'lucide-react';
import { useWindowStore } from '@/store/windowStore';
import { useUIStore } from '@/store/uiStore';
import { useAiStore } from '@/store/aiStore';
import { getApp } from '@/apps/registry';
import { EngOSMark } from './BootScreen';

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

function useFakeBattery() {
  const [pct, setPct] = useState(87);
  useEffect(() => {
    const t = window.setInterval(() => {
      setPct((p) => {
        const next = p + (Math.random() < 0.5 ? -1 : 1);
        return Math.max(60, Math.min(100, next));
      });
    }, 12_000);
    return () => window.clearInterval(t);
  }, []);
  return pct;
}

export default function MenuBar() {
  const focusedId = useWindowStore((s) => s.focusedId);
  const windows = useWindowStore((s) => s.windows);
  const toggleSpotlight = useUIStore((s) => s.toggleSpotlight);
  const toggleChat = useAiStore((s) => s.toggleChat);
  const now = useNow();
  const batt = useFakeBattery();
  const [logoOpen, setLogoOpen] = useState(false);
  const logoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (logoOpen && logoRef.current && !logoRef.current.contains(e.target as Node)) {
        setLogoOpen(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [logoOpen]);

  const focused = focusedId ? windows.find((w) => w.id === focusedId) : undefined;
  const focusedApp = focused ? getApp(focused.appId) : undefined;
  const activeName = focusedApp ? focusedApp.manifest.name : 'Finder';

  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="fixed top-0 left-0 right-0 h-7 z-[4000] flex items-center px-3 text-[13px] text-white/90 chrome glass glass-edge"
      style={{ background: 'rgba(0,0,0,0.18)' }}
    >
      {/* Left section */}
      <div className="flex items-center gap-3">
        <div ref={logoRef} className="relative">
          <button
            onClick={() => setLogoOpen((o) => !o)}
            className="flex items-center px-1 rounded hover:bg-white/15"
          >
            <EngOSMark size={16} />
          </button>
          {logoOpen && (
            <div className="absolute top-full left-0 mt-1 glass-strong glass-edge rounded-lg py-1 min-w-[180px] shadow-window">
              {[
                { label: 'About EngOS', action: () => alert('EngOS v0.1') },
                'sep',
                { label: 'Sleep', action: () => {} },
                { label: 'Restart', action: () => location.reload() },
                { label: 'Shut Down…', action: () => {} },
              ].map((it, i) =>
                it === 'sep' ? (
                  <div key={i} className="my-1 h-px bg-white/10" />
                ) : (
                  <button
                    key={i}
                    onClick={() => {
                      (it as { action: () => void }).action();
                      setLogoOpen(false);
                    }}
                    className="w-full text-left px-3 py-1 hover:bg-white/10 text-sm"
                  >
                    {(it as { label: string }).label}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
        <div className="font-semibold">{activeName}</div>
        <div className="opacity-60 hidden sm:block">File</div>
        <div className="opacity-60 hidden sm:block">Edit</div>
        <div className="opacity-60 hidden sm:block">View</div>
        <div className="opacity-60 hidden sm:block">Window</div>
        <div className="opacity-60 hidden sm:block">Help</div>
      </div>

      {/* Right section */}
      <div className="ml-auto flex items-center gap-3">
        <button
          title="EngOS AI (Cmd+I)"
          onClick={toggleChat}
          className="flex items-center gap-1 hover:bg-white/15 rounded px-1"
        >
          <Sparkles size={14} className="text-pink-300" />
        </button>
        <div className="flex items-center gap-1 opacity-90" title={`Battery ${batt}%`}>
          <span className="text-[11px] tabular-nums">{batt}%</span>
          <Battery size={16} />
        </div>
        <Wifi size={14} className="opacity-90" />
        <button
          onClick={toggleSpotlight}
          className="hover:bg-white/15 rounded px-1"
          title="Spotlight (Cmd+K)"
        >
          <Search size={14} />
        </button>
        <div className="flex items-center gap-2 tabular-nums">
          <span className="opacity-90">{date}</span>
          <span className="font-medium">{time}</span>
        </div>
      </div>
    </div>
  );
}
