import { useState, useRef } from 'react';
import { Sliders, Palette, Sparkles, Keyboard, Info, RotateCcw, Upload } from 'lucide-react';
import { SettingsIcon } from '@/apps/icons';
import type { AppModule } from '@/os/types';
import { useSettingsStore, ACCENT_PRESETS } from '@/store/settingsStore';
import { useUIStore, WALLPAPERS } from '@/store/uiStore';
import { useAiStore } from '@/store/aiStore';
import { APP_LIST } from '@/apps/registry';

type Section = 'general' | 'appearance' | 'ai' | 'shortcuts' | 'about';

const SECTIONS: { id: Section; label: string; icon: any }[] = [
  { id: 'general', label: 'General', icon: Sliders },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'about', label: 'About', icon: Info },
];

function SettingsApp() {
  const [section, setSection] = useState<Section>('general');
  return (
    <div className="flex h-full">
      <div className="w-44 shrink-0 border-r border-white/10 bg-black/20 p-2 chrome">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left ${
              section === s.id ? 'bg-accent text-white' : 'text-white/75 hover:bg-white/10'
            }`}
          >
            <s.icon size={14} />
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-6 app-content">
        {section === 'general' && <GeneralPane />}
        {section === 'appearance' && <AppearancePane />}
        {section === 'ai' && <AIPane />}
        {section === 'shortcuts' && <ShortcutsPane />}
        {section === 'about' && <AboutPane />}
      </div>
    </div>
  );
}

function GeneralPane() {
  const userName = useSettingsStore((s) => s.userName);
  const setUserName = useSettingsStore((s) => s.setUserName);
  const startupApps = useSettingsStore((s) => s.startupApps);
  const toggleStartupApp = useSettingsStore((s) => s.toggleStartupApp);
  const reset = useSettingsStore((s) => s.reset);
  return (
    <div className="space-y-6 max-w-md">
      <PaneTitle>General</PaneTitle>
      <Row label="User name">
        <input
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-md px-2 py-1 text-sm outline-none w-56"
        />
      </Row>
      <div>
        <Label>Default startup apps</Label>
        <div className="grid grid-cols-2 gap-1.5 mt-2">
          {APP_LIST.filter((a) => !a.manifest.hideFromDock && a.manifest.id !== 'settings').map((a) => (
            <label key={a.manifest.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={startupApps.includes(a.manifest.id)}
                onChange={() => toggleStartupApp(a.manifest.id)}
              />
              {a.manifest.name}
            </label>
          ))}
        </div>
        <div className="text-[11px] text-white/45 mt-1">
          Selected apps open automatically on next boot.
        </div>
      </div>

      <button
        onClick={() => {
          import('@/store/toastStore').then(({ useToastStore }) =>
            useToastStore.getState().push({
              kind: 'warn',
              title: 'Reset all settings?',
              body: 'Wallpaper, theme, dock size, and shortcuts will return to defaults.',
              duration: 0,
              action: { label: 'Reset', onClick: reset },
            }),
          );
        }}
        className="flex items-center gap-1 px-2 py-1 rounded-md bg-traffic-red/20 hover:bg-traffic-red/40 text-traffic-red text-sm"
      >
        <RotateCcw size={12} /> Reset settings
      </button>
    </div>
  );
}

function AppearancePane() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const dockSize = useSettingsStore((s) => s.dockSize);
  const setDockSize = useSettingsStore((s) => s.setDockSize);
  const menuBarOpacity = useSettingsStore((s) => s.menuBarOpacity);
  const setMenuBarOpacity = useSettingsStore((s) => s.setMenuBarOpacity);
  const wallpaper = useUIStore((s) => s.wallpaper);
  const setWallpaper = useUIStore((s) => s.setWallpaper);
  const customWallpaper = useSettingsStore((s) => s.customWallpaper);
  const setCustomWallpaper = useSettingsStore((s) => s.setCustomWallpaper);
  const fileRef = useRef<HTMLInputElement>(null);

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCustomWallpaper(reader.result as string);
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <PaneTitle>Appearance</PaneTitle>

      <Row label="Theme">
        <div className="flex gap-2">
          {(['dark', 'light'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`px-3 py-1 rounded-md text-sm ${
                theme === t ? 'bg-accent text-white' : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </Row>

      <Row label="Accent">
        <AccentPicker />
      </Row>

      <div>
        <Label>Wallpaper</Label>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {WALLPAPERS.map((w) => (
            <button
              key={w.id}
              onClick={() => {
                setWallpaper(w.id);
                setCustomWallpaper(null);
              }}
              className={`h-20 rounded-lg overflow-hidden border-2 ${
                !customWallpaper && wallpaper === w.id ? 'border-accent' : 'border-transparent'
              }`}
              style={{ backgroundImage: w.css, backgroundSize: 'cover' }}
              title={w.name}
            >
              <div className="h-full w-full flex items-end p-1">
                <span className="text-[10px] text-white/85 font-medium bg-black/30 px-1 rounded">
                  {w.name}
                </span>
              </div>
            </button>
          ))}
          <button
            onClick={() => fileRef.current?.click()}
            className={`h-20 rounded-lg border-2 ${
              customWallpaper ? 'border-accent' : 'border-white/15'
            } bg-black/30 flex flex-col items-center justify-center text-xs text-white/65 hover:bg-black/40`}
            style={
              customWallpaper
                ? { backgroundImage: `url(${customWallpaper})`, backgroundSize: 'cover' }
                : undefined
            }
          >
            <Upload size={14} />
            <span className="mt-0.5 bg-black/40 px-1 rounded">
              {customWallpaper ? 'Custom' : 'Upload'}
            </span>
          </button>
          <input ref={fileRef} type="file" hidden accept="image/*" onChange={onUpload} />
        </div>
      </div>

      <Row label="Dock size">
        <input
          type="range"
          min={56}
          max={110}
          step={2}
          value={dockSize}
          onChange={(e) => setDockSize(parseInt(e.target.value))}
          className="w-48"
        />
        <span className="font-mono text-xs text-white/65 w-10 text-right">{dockSize}px</span>
      </Row>

      <Row label="Menu bar opacity">
        <input
          type="range"
          min={0}
          max={80}
          step={1}
          value={menuBarOpacity}
          onChange={(e) => setMenuBarOpacity(parseInt(e.target.value))}
          className="w-48"
        />
        <span className="font-mono text-xs text-white/65 w-10 text-right">{menuBarOpacity}%</span>
      </Row>
    </div>
  );
}

function AIPane() {
  const aiModel = useSettingsStore((s) => s.aiModel);
  const setAiModel = useSettingsStore((s) => s.setAiModel);
  const historyEnabled = useAiStore((s) => s.historyEnabled);
  const setHistoryEnabled = useAiStore((s) => s.setHistoryEnabled);
  const clearHistory = useAiStore((s) => s.clearHistory);
  return (
    <div className="space-y-6 max-w-md">
      <PaneTitle>AI</PaneTitle>
      <Row label="Model">
        <select
          value={aiModel}
          onChange={(e) => setAiModel(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-md px-2 py-1 text-sm outline-none"
        >
          <option value="claude-sonnet-4-20250514" className="bg-zinc-800">
            Claude Sonnet 4
          </option>
        </select>
      </Row>
      <Row label="Conversation history">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={historyEnabled}
            onChange={(e) => setHistoryEnabled(e.target.checked)}
          />
          Persist chats in localStorage
        </label>
      </Row>
      <button
        onClick={() => {
          import('@/store/toastStore').then(({ useToastStore }) =>
            useToastStore.getState().push({
              kind: 'warn',
              title: 'Clear AI conversation history?',
              body: 'All saved chats will be deleted from this browser.',
              duration: 0,
              action: { label: 'Delete', onClick: clearHistory },
            }),
          );
        }}
        className="px-2 py-1 rounded-md bg-traffic-red/20 hover:bg-traffic-red/40 text-traffic-red text-sm"
      >
        Clear history
      </button>
    </div>
  );
}

/** The genuine shortcuts wired in App.tsx + app canvases. */
const SHORTCUT_GROUPS: { group: string; items: [string, string][] }[] = [
  {
    group: 'System',
    items: [
      ['⌘ / Ctrl + K', 'Open Spotlight'],
      ['⌘ / Ctrl + Space', 'Open Spotlight'],
      ['⌘ / Ctrl + I', 'Toggle EngOS AI'],
      ['⌘ / Ctrl + W', 'Close focused window'],
      ['⌘ / Ctrl + M', 'Minimize focused window'],
      ['Esc', 'Close Spotlight / cancel'],
    ],
  },
  {
    group: 'Modeler3D',
    items: [
      ['G', 'Move tool'],
      ['R', 'Rotate tool'],
      ['S', 'Scale tool'],
      ['Del', 'Delete selected'],
      ['⌘ / Ctrl + D', 'Duplicate selected'],
    ],
  },
  {
    group: 'LogicLab / CircuitSim / PCBForge',
    items: [
      ['Drag from pin', 'Start a wire / trace'],
      ['Shift-click wire', 'Delete wire / trace'],
      ['Del', 'Delete selected component'],
      ['Esc', 'Cancel active wire'],
    ],
  },
  {
    group: 'FEAForge',
    items: [
      ['Esc', 'Cancel element draw'],
      ['Del', 'Delete selected node'],
    ],
  },
];

function ShortcutsPane() {
  return (
    <div className="space-y-4 max-w-md">
      <PaneTitle>Keyboard shortcuts</PaneTitle>
      <div className="text-[12px] text-white/55">
        These are the live shortcuts handled by EngOS — try them anywhere.
      </div>
      {SHORTCUT_GROUPS.map((g) => (
        <div key={g.group}>
          <div className="text-[10px] uppercase tracking-wide text-white/45 mb-1.5">
            {g.group}
          </div>
          <div className="space-y-1">
            {g.items.map(([keys, label]) => (
              <div key={keys} className="flex items-center gap-3 text-sm">
                <kbd className="font-mono text-[11px] bg-white/10 border border-white/15 rounded px-2 py-0.5 min-w-[120px] text-center">
                  {keys}
                </kbd>
                <span className="text-white/75">{label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AboutPane() {
  return (
    <div className="space-y-3 max-w-md">
      <PaneTitle>About</PaneTitle>
      <div className="text-sm text-white/80 leading-relaxed">
        <div className="text-lg font-semibold text-white">EngOS</div>
        <div>Version 1.0.0</div>
        <div className="mt-3">
          A macOS-inspired in-browser desktop environment for engineering students. Every app
          is a Zustand-backed component that registers AI tools so the assistant can drive
          the OS as a first-class peer.
        </div>
        <div className="mt-3 text-white/55 text-[12px]">
          Built with React 18, Three.js, react-three/fiber, Framer Motion, react-rnd, KaTeX,
          and a fistful of hand-written numerical kernels.
        </div>
      </div>
    </div>
  );
}

function AccentPicker() {
  const accent = useSettingsStore((s) => s.accent);
  const setAccent = useSettingsStore((s) => s.setAccent);
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {ACCENT_PRESETS.map((a) => (
        <button
          key={a.id}
          onClick={() => setAccent(a.hex)}
          title={a.label}
          className={`w-7 h-7 rounded-full border-2 transition-all ${
            accent === a.hex
              ? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.25)]'
              : 'border-white/15 hover:border-white/40'
          }`}
          style={{ background: a.hex }}
        />
      ))}
      <input
        type="color"
        value={accent}
        onChange={(e) => setAccent(e.target.value)}
        className="w-7 h-7 rounded-full bg-transparent border border-white/15 cursor-pointer ml-1"
        title="Custom"
      />
    </div>
  );
}

function PaneTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-semibold text-white">{children}</h2>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="w-32 text-sm text-white/65">{label}</div>
      <div className="flex items-center gap-2 flex-1">{children}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs uppercase text-white/45 tracking-wide">{children}</div>;
}

const module: AppModule = {
  manifest: {
    id: 'settings',
    name: 'Settings',
    description: 'EngOS settings — theme, dock, AI, shortcuts',
    icon: SettingsIcon,
    defaultSize: { width: 800, height: 560 },
    accent: 'linear-gradient(135deg, #94a3b8 0%, #475569 100%)',
  },
  Component: SettingsApp,
};

export default module;
