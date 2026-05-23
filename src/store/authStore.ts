import { create } from 'zustand';
import { isGoogleConfigured, type GoogleProfile } from '@/lib/googleAuth';

const STORAGE_KEY = 'engos.auth.v1';

export type AuthProvider = 'google' | 'guest';

export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  picture: string;
  provider: AuthProvider;
  signedInAt: number;
}

interface AuthStore {
  user: AuthUser | null;
  signInWithGoogle: (p: GoogleProfile) => void;
  signInAsGuest: (name?: string) => void;
  signOut: () => void;
}

function load(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    if (parsed && typeof parsed.sub === 'string' && typeof parsed.name === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function autoGuest(): AuthUser {
  const user: AuthUser = {
    sub: `guest-${Math.random().toString(36).slice(2, 10)}`,
    email: '',
    name: 'Guest',
    picture: '',
    provider: 'guest',
    signedInAt: Date.now(),
  };
  save(user);
  return user;
}

function save(user: AuthUser | null) {
  try {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage may be unavailable; sign-in still works in-memory
  }
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: load() ?? autoGuest(),
  signInWithGoogle: (p) => {
    const user: AuthUser = {
      sub: p.sub,
      email: p.email,
      name: p.name,
      picture: p.picture,
      provider: 'google',
      signedInAt: Date.now(),
    };
    save(user);
    set({ user });
  },
  signInAsGuest: (name) => {
    const trimmed = (name ?? '').trim() || 'Guest';
    const user: AuthUser = {
      sub: `guest-${Math.random().toString(36).slice(2, 10)}`,
      email: '',
      name: trimmed,
      picture: '',
      provider: 'guest',
      signedInAt: Date.now(),
    };
    save(user);
    set({ user });
  },
  signOut: () => {
    if (isGoogleConfigured()) {
      save(null);
      set({ user: null });
    } else {
      const guest = autoGuest();
      set({ user: guest });
    }
    void import('@/lib/googleAuth').then(({ googleSignOut }) => googleSignOut());
  },
}));
