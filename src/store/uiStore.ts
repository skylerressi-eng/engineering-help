import { create } from 'zustand';

export type WallpaperId = 'aurora' | 'sunset' | 'oceanic' | 'forest' | 'cosmic' | 'conway';

export interface WallpaperPreset {
  id: WallpaperId;
  name: string;
  /** CSS background-image value (uses linear/radial gradients) */
  css: string;
  /** Whether this wallpaper is rendered by a live canvas (Conway) instead of CSS */
  live?: boolean;
}

export const WALLPAPERS: WallpaperPreset[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    css: `radial-gradient(at 18% 24%, #4f46e5 0px, transparent 55%),
          radial-gradient(at 82% 18%, #14b8a6 0px, transparent 50%),
          radial-gradient(at 70% 80%, #ec4899 0px, transparent 55%),
          radial-gradient(at 30% 70%, #0ea5e9 0px, transparent 60%),
          linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #082f49 100%)`,
  },
  {
    id: 'sunset',
    name: 'Sunset',
    css: `radial-gradient(at 20% 80%, #f97316 0px, transparent 55%),
          radial-gradient(at 80% 20%, #f43f5e 0px, transparent 55%),
          radial-gradient(at 50% 50%, #fbbf24 0px, transparent 35%),
          linear-gradient(135deg, #431407 0%, #7f1d1d 60%, #18181b 100%)`,
  },
  {
    id: 'oceanic',
    name: 'Oceanic',
    css: `radial-gradient(at 30% 25%, #06b6d4 0px, transparent 55%),
          radial-gradient(at 70% 70%, #1d4ed8 0px, transparent 55%),
          radial-gradient(at 50% 100%, #0891b2 0px, transparent 50%),
          linear-gradient(180deg, #082f49 0%, #0c4a6e 50%, #082f49 100%)`,
  },
  {
    id: 'forest',
    name: 'Forest',
    css: `radial-gradient(at 25% 30%, #15803d 0px, transparent 55%),
          radial-gradient(at 80% 75%, #65a30d 0px, transparent 55%),
          radial-gradient(at 50% 50%, #0f766e 0px, transparent 45%),
          linear-gradient(160deg, #052e16 0%, #14532d 60%, #022c22 100%)`,
  },
  {
    id: 'cosmic',
    name: 'Cosmic',
    css: `radial-gradient(at 15% 20%, #7c3aed 0px, transparent 55%),
          radial-gradient(at 85% 25%, #db2777 0px, transparent 55%),
          radial-gradient(at 50% 85%, #2563eb 0px, transparent 55%),
          linear-gradient(135deg, #0c0a1e 0%, #1e1b4b 55%, #0c0a1e 100%)`,
  },
  {
    id: 'conway',
    name: "Conway's Life",
    live: true,
    // Fallback CSS shown briefly while the live canvas mounts.
    css: `linear-gradient(180deg, #0f172a 0%, #020617 100%)`,
  },
];

interface UIStore {
  booted: boolean;
  wallpaper: WallpaperId;
  spotlightOpen: boolean;
  theme: 'dark' | 'light';

  setBooted: (b: boolean) => void;
  setWallpaper: (id: WallpaperId) => void;
  openSpotlight: () => void;
  closeSpotlight: () => void;
  toggleSpotlight: () => void;
  setTheme: (t: 'dark' | 'light') => void;
}

export const useUIStore = create<UIStore>((set) => ({
  booted: false,
  wallpaper: 'aurora',
  spotlightOpen: false,
  theme: 'dark',

  setBooted: (b) => set({ booted: b }),
  setWallpaper: (id) => set({ wallpaper: id }),
  openSpotlight: () => set({ spotlightOpen: true }),
  closeSpotlight: () => set({ spotlightOpen: false }),
  toggleSpotlight: () => set((s) => ({ spotlightOpen: !s.spotlightOpen })),
  setTheme: (t) => set({ theme: t }),
}));
