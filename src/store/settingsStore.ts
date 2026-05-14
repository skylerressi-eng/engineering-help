import { create } from 'zustand';
import { useUIStore, type WallpaperId } from './uiStore';

const STORAGE_KEY = 'engos.settings.v1';

export type Theme = 'dark' | 'light';

export interface KeyBinding {
  id: string;
  label: string;
  combo: string;
}

const DEFAULT_BINDINGS: KeyBinding[] = [
  { id: 'spotlight', label: 'Open Spotlight', combo: 'Cmd+K' },
  { id: 'spotlight-alt', label: 'Open Spotlight (alt)', combo: 'Cmd+Space' },
  { id: 'ai', label: 'Toggle AI Assistant', combo: 'Cmd+I' },
  { id: 'close', label: 'Close window', combo: 'Cmd+W' },
  { id: 'quit', label: 'Quit app', combo: 'Cmd+Q' },
];

interface SettingsStore {
  userName: string;
  dockSize: number;
  menuBarOpacity: number;
  theme: Theme;
  /** Hex accent color applied OS-wide */
  accent: string;
  customWallpaper: string | null;
  startupApps: string[];
  aiModel: string;
  historyEnabled: boolean;
  bindings: KeyBinding[];

  setUserName: (s: string) => void;
  setDockSize: (n: number) => void;
  setMenuBarOpacity: (n: number) => void;
  setTheme: (t: Theme) => void;
  setAccent: (hex: string) => void;
  setCustomWallpaper: (s: string | null) => void;
  toggleStartupApp: (id: string) => void;
  setAiModel: (m: string) => void;
  setHistoryEnabled: (b: boolean) => void;
  setBinding: (id: string, combo: string) => void;
  reset: () => void;
}

export const ACCENT_PRESETS: { id: string; hex: string; label: string }[] = [
  { id: 'blue', hex: '#0A84FF', label: 'Blue' },
  { id: 'purple', hex: '#A855F7', label: 'Purple' },
  { id: 'pink', hex: '#EC4899', label: 'Pink' },
  { id: 'red', hex: '#EF4444', label: 'Red' },
  { id: 'orange', hex: '#F97316', label: 'Orange' },
  { id: 'yellow', hex: '#EAB308', label: 'Yellow' },
  { id: 'green', hex: '#22C55E', label: 'Green' },
  { id: 'teal', hex: '#14B8A6', label: 'Teal' },
  { id: 'graphite', hex: '#6B7280', label: 'Graphite' },
];

function load(): Partial<SettingsStore> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function persist(s: SettingsStore) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        userName: s.userName,
        dockSize: s.dockSize,
        menuBarOpacity: s.menuBarOpacity,
        theme: s.theme,
        accent: s.accent,
        customWallpaper: s.customWallpaper,
        startupApps: s.startupApps,
        aiModel: s.aiModel,
        historyEnabled: s.historyEnabled,
        bindings: s.bindings,
      }),
    );
  } catch {
    /* quota */
  }
}

/** Apply the accent color as a CSS variable that Tailwind's accent class can read. */
function applyAccent(hex: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--accent', hex);
  // Approximate hover variant: slightly lighter
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lighter = `rgb(${Math.min(255, r + 30)}, ${Math.min(255, g + 30)}, ${Math.min(255, b + 30)})`;
  document.documentElement.style.setProperty('--accent-hover', lighter);
}

const initial = load();

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  userName: initial.userName ?? 'Engineer',
  dockSize: initial.dockSize ?? 78,
  menuBarOpacity: initial.menuBarOpacity ?? 18,
  theme: (initial.theme as Theme) ?? 'dark',
  accent: initial.accent ?? '#0A84FF',
  customWallpaper: initial.customWallpaper ?? null,
  startupApps: initial.startupApps ?? [],
  aiModel: initial.aiModel ?? 'claude-sonnet-4-20250514',
  historyEnabled: initial.historyEnabled ?? true,
  bindings: initial.bindings ?? DEFAULT_BINDINGS,

  setUserName: (s) => {
    set({ userName: s });
    persist(get());
  },
  setDockSize: (n) => {
    set({ dockSize: Math.max(48, Math.min(110, n)) });
    persist(get());
  },
  setMenuBarOpacity: (n) => {
    set({ menuBarOpacity: Math.max(0, Math.min(80, n)) });
    persist(get());
  },
  setTheme: (t) => {
    set({ theme: t });
    persist(get());
    useUIStore.getState().setTheme(t);
    document.documentElement.classList.toggle('dark', t === 'dark');
    document.documentElement.classList.toggle('light', t === 'light');
  },
  setAccent: (hex) => {
    set({ accent: hex });
    persist(get());
    applyAccent(hex);
  },
  setCustomWallpaper: (s) => {
    set({ customWallpaper: s });
    persist(get());
  },
  toggleStartupApp: (id) => {
    const cur = get().startupApps;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    set({ startupApps: next });
    persist(get());
  },
  setAiModel: (m) => {
    set({ aiModel: m });
    persist(get());
  },
  setHistoryEnabled: (b) => {
    set({ historyEnabled: b });
    persist(get());
  },
  setBinding: (id, combo) => {
    set((s) => ({
      bindings: s.bindings.map((b) => (b.id === id ? { ...b, combo } : b)),
    }));
    persist(get());
  },
  reset: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({
      userName: 'Engineer',
      dockSize: 78,
      menuBarOpacity: 18,
      theme: 'dark',
      accent: '#0A84FF',
      customWallpaper: null,
      startupApps: [],
      aiModel: 'claude-sonnet-4-20250514',
      historyEnabled: true,
      bindings: DEFAULT_BINDINGS,
    });
    useUIStore.getState().setWallpaper('aurora');
    applyAccent('#0A84FF');
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  },
}));

/** Resolve effective wallpaper: custom data-url or one of the presets. */
export function effectiveWallpaperCSS(presetCSS: string, custom: string | null): string {
  if (custom) return `url("${custom}") center/cover no-repeat, ${presetCSS}`;
  return presetCSS;
}

export function isWallpaperCustom(): boolean {
  return Boolean(useSettingsStore.getState().customWallpaper);
}

/** Convenience for restoring active wallpaper + accent on app boot */
export function applyTheme() {
  const t = useSettingsStore.getState().theme;
  document.documentElement.classList.toggle('dark', t === 'dark');
  document.documentElement.classList.toggle('light', t === 'light');
  applyAccent(useSettingsStore.getState().accent);
}

export { DEFAULT_BINDINGS, type WallpaperId };
