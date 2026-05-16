import { useEffect, useRef, useState } from 'react';
import { Wifi, Battery, Search, Sparkles, Bluetooth, MoonStar, Moon, Sun } from 'lucide-react';
import { useWindowStore } from '@/store/windowStore';
import { useUIStore, WALLPAPERS } from '@/store/uiStore';
import { useAiStore } from '@/store/aiStore';
import { useSettingsStore } from '@/store/settingsStore';
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
  const menuBarOpacity = useSettingsStore((s) => s.menuBarOpacity);
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
      style={{ background: `rgba(0,0,0,${(menuBarOpacity / 100).toFixed(3)})` }}
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
                {
                  label: 'About EngOS',
                  action: () =>
                    import('@/store/toastStore').then(({ toast }) =>
                      toast.info('EngOS', 'Built for engineers. v1.0.0'),
                    ),
                },
                'sep',
                { label: 'Sleep', action: () => useUIStore.getState().setPower('sleep') },
                { label: 'Restart', action: () => location.reload() },
                { label: 'Shut Down…', action: () => useUIStore.getState().setPower('off') },
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
        <WindowMenu />
        <button
          onClick={() => useAiStore.getState().openChat()}
          className="opacity-70 hover:opacity-100 hover:bg-white/15 rounded px-1.5 hidden sm:block transition-opacity"
          title="Ask EngOS AI for help"
        >
          Help
        </button>
      </div>

      {/* Right section */}
      <div className="ml-auto flex items-center gap-2.5">
        <button
          title="EngOS AI (Cmd+I)"
          onClick={toggleChat}
          className="flex items-center gap-1 hover:bg-white/15 rounded px-1 transition-colors"
        >
          <Sparkles size={14} className="text-pink-300" />
        </button>
        <ControlCenterButton batt={batt} />
        <button
          onClick={toggleSpotlight}
          className="hover:bg-white/15 rounded px-1 transition-colors"
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

function WindowMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const windows = useWindowStore((s) => s.windows);
  const focusWindow = useWindowStore((s) => s.focusWindow);
  const minimizeWindow = useWindowStore((s) => s.minimizeWindow);
  const closeWindow = useWindowStore((s) => s.closeWindow);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="opacity-70 hover:opacity-100 hover:bg-white/15 rounded px-1.5 transition-opacity"
      >
        Window
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 glass-strong glass-edge rounded-lg py-1 min-w-[220px] shadow-window">
          {windows.length === 0 && (
            <div className="px-3 py-1.5 text-xs text-white/45">No open windows</div>
          )}
          {windows.map((w) => {
            const app = getApp(w.appId);
            return (
              <div key={w.id} className="flex items-center group hover:bg-white/10">
                <button
                  onClick={() => {
                    focusWindow(w.id);
                    setOpen(false);
                  }}
                  className="flex-1 text-left px-3 py-1.5 text-sm truncate"
                >
                  {w.minimized ? '• ' : ''}
                  {app?.manifest.name ?? w.title}
                </button>
                <button
                  onClick={() => minimizeWindow(w.id)}
                  title="Minimize"
                  className="opacity-0 group-hover:opacity-100 px-1.5 text-white/55 hover:text-white"
                >
                  –
                </button>
                <button
                  onClick={() => closeWindow(w.id)}
                  title="Close"
                  className="opacity-0 group-hover:opacity-100 px-2 text-white/55 hover:text-traffic-red"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ControlCenterButton({ batt }: { batt: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Control Center"
        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-white/15 transition-colors"
      >
        <Wifi size={13} className="opacity-95" />
        <Battery size={15} className="opacity-95" />
        <span className="text-[11px] tabular-nums opacity-90">{batt}%</span>
      </button>
      {open && <ControlCenter batt={batt} onClose={() => setOpen(false)} />}
    </div>
  );
}

function ControlCenter({ batt }: { batt: number; onClose: () => void }) {
  const dockSize = useSettingsStore((s) => s.dockSize);
  const setDockSize = useSettingsStore((s) => s.setDockSize);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const wallpaper = useUIStore((s) => s.wallpaper);
  const setWallpaper = useUIStore((s) => s.setWallpaper);
  const wallpapers = ['aurora', 'sunset', 'oceanic', 'forest', 'cosmic', 'conway'] as const;
  const [wifiOn, setWifiOn] = useState(true);
  const [btOn, setBtOn] = useState(true);
  const [doNotDisturb, setDND] = useState(false);
  return (
    <div
      className="absolute right-0 top-full mt-1.5 w-[300px] glass-strong rounded-2xl shadow-window p-3 z-[5000] border border-white/10"
      style={{
        background: 'rgba(28, 28, 36, 0.85)',
        backdropFilter: 'blur(36px) saturate(180%)',
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <Tile
          active={wifiOn}
          onClick={() => setWifiOn((v) => !v)}
          icon={<Wifi size={15} />}
          title="Wi-Fi"
          subtitle={wifiOn ? 'EngOS Lab' : 'Off'}
        />
        <Tile
          active={btOn}
          onClick={() => setBtOn((v) => !v)}
          icon={<Bluetooth size={15} />}
          title="Bluetooth"
          subtitle={btOn ? 'On' : 'Off'}
        />
        <Tile
          active={doNotDisturb}
          onClick={() => setDND((v) => !v)}
          icon={<MoonStar size={15} />}
          title="Focus"
          subtitle={doNotDisturb ? 'Do Not Disturb' : 'Off'}
        />
        <Tile
          active={theme === 'dark'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          icon={theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
          title="Appearance"
          subtitle={theme === 'dark' ? 'Dark' : 'Light'}
        />
      </div>

      <div className="mt-3 rounded-xl bg-white/5 p-2.5 space-y-2">
        <div className="flex items-center gap-2 text-[11px] text-white/65">
          <Battery size={13} />
          <span>Battery</span>
          <span className="ml-auto font-mono">{batt}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-400"
            style={{ width: `${batt}%` }}
          />
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-white/5 p-2.5">
        <div className="text-[11px] text-white/65 mb-1.5">Dock Size</div>
        <input
          type="range"
          min={56}
          max={110}
          step={2}
          value={dockSize}
          onChange={(e) => setDockSize(parseInt(e.target.value))}
          className="w-full"
        />
      </div>

      <div className="mt-3 rounded-xl bg-white/5 p-2.5">
        <div className="text-[11px] text-white/65 mb-1.5">Wallpaper</div>
        <div className="grid grid-cols-6 gap-1.5">
          {wallpapers.map((id) => {
            const wp = WALLPAPERS.find((w) => w.id === id)!;
            return (
              <button
                key={id}
                onClick={() => setWallpaper(id)}
                className={`h-9 rounded-md border ${
                  wallpaper === id ? 'border-white' : 'border-white/15 hover:border-white/40'
                }`}
                style={{ backgroundImage: wp.css, backgroundSize: 'cover' }}
                title={wp.name}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Tile({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
        active ? 'bg-accent/30 hover:bg-accent/40' : 'bg-white/5 hover:bg-white/10'
      }`}
    >
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center ${
          active ? 'bg-accent text-white' : 'bg-white/10 text-white/85'
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium text-white truncate">{title}</div>
        <div className="text-[10px] text-white/55 truncate">{subtitle}</div>
      </div>
    </button>
  );
}
