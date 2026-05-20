import { create } from 'zustand';

const STORAGE_KEY = 'engos.sub.v1';

export type SubscriptionTier = 'free' | 'pro';

interface SubStore {
  tier: SubscriptionTier;
  /** Unix ms when the current billing period ends (null = permanent/unknown) */
  expiresAt: number | null;
  activatePro: (expiresAt?: number) => void;
  clearSub: () => void;
}

function load(): { tier: SubscriptionTier; expiresAt: number | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { tier: 'free', expiresAt: null };
    const p = JSON.parse(raw) as { tier?: string; expiresAt?: number | null };
    if (p.tier === 'pro') {
      if (p.expiresAt && Date.now() > p.expiresAt)
        return { tier: 'free', expiresAt: null };
      return { tier: 'pro', expiresAt: p.expiresAt ?? null };
    }
    return { tier: 'free', expiresAt: null };
  } catch {
    return { tier: 'free', expiresAt: null };
  }
}

function save(tier: SubscriptionTier, expiresAt: number | null) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tier, expiresAt }));
  } catch { /* storage unavailable */ }
}

export const useSubStore = create<SubStore>((set) => ({
  ...load(),
  activatePro: (expiresAt) => {
    // Default to 30 days from now if Stripe doesn't tell us the exact date
    const exp = expiresAt ?? Date.now() + 30 * 24 * 60 * 60 * 1000;
    save('pro', exp);
    set({ tier: 'pro', expiresAt: exp });
  },
  clearSub: () => {
    save('free', null);
    set({ tier: 'free', expiresAt: null });
  },
}));

export function isPro(): boolean {
  const { tier, expiresAt, clearSub } = useSubStore.getState();
  if (tier !== 'pro') return false;
  if (expiresAt && Date.now() > expiresAt) { clearSub(); return false; }
  return true;
}

/**
 * Call on app boot. If the URL contains `?subscribed=1` (set as the Stripe
 * Payment Link success_url), grant Pro access and strip the query param.
 */
export function detectStripeCallback(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get('subscribed') !== '1') return false;
  useSubStore.getState().activatePro();
  params.delete('subscribed');
  const clean = params.toString() ? `?${params}` : window.location.pathname;
  window.history.replaceState({}, '', clean);
  return true;
}
