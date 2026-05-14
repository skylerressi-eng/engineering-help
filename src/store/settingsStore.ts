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
  customWallpaper: string | null;
  startupApps: string[];
  aiModel: string;
  historyEnabled: boolean;
  bindings: KeyBinding[];

  setUserName: (s: string) => void;
  setDockSize: (n: number) => void;
  setMenuBarOpacity: (n: number) => void;
  setTheme: (t: Theme) => void;
  setCustomWallpaper: (s: string | null) => void;
  toggleStartupApp: (id: string) => void;
  setAiModel: (m: string) => void;
  setHistoryEnabled: (b: boolean) => void;
  setBinding: (id: string, combo: string) => void;
  reset: () => void;
}

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

const initial = load();

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  userName: initial.userName ?? 'Engineer',
  dockSize: initial.dockSize ?? 78,
  menuBarOpacity: initial.menuBarOpacity ?? 18,
  theme: (initial.theme as Theme) ?? 'dark',
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
      customWallpaper: null,
      startupApps: [],
      aiModel: 'claude-sonnet-4-20250514',
      historyEnabled: true,
      bindings: DEFAULT_BINDINGS,
    });
    useUIStore.getState().setWallpaper('aurora');
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

/** Convenience for restoring active wallpaper on app boot */
export function applyTheme() {
  const t = useSettingsStore.getState().theme;
  document.documentElement.classList.toggle('dark', t === 'dark');
  document.documentElement.classList.toggle('light', t === 'light');
}

export { DEFAULT_BINDINGS, type WallpaperId };
