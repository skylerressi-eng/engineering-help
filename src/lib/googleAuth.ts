/**
 * Google Identity Services (GIS) integration. The script is loaded on demand
 * the first time the login screen mounts. We use the One Tap / button flow
 * which returns a signed JWT ID token; we decode it client-side to read the
 * user's profile (sub, email, name, picture).
 *
 * Configure with `VITE_GOOGLE_CLIENT_ID` in `.env.local` — the value comes
 * from the Google Cloud Console OAuth 2.0 client credentials page. If the
 * env var is absent we fall back to guest-only mode.
 */

export const GOOGLE_CLIENT_ID =
  ((import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture: string;
}

interface GsiCredentialResponse {
  credential: string;
}

interface GsiIdApi {
  initialize: (config: {
    client_id: string;
    callback: (resp: GsiCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: Record<string, string | number | boolean>,
  ) => void;
  prompt: () => void;
  disableAutoSelect: () => void;
  revoke: (hint: string, cb: () => void) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GsiIdApi } };
  }
}

let sdkPromise: Promise<void> | null = null;

export function isGoogleConfigured(): boolean {
  return GOOGLE_CLIENT_ID.length > 0;
}

export function loadGoogleSdk(): Promise<void> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error('Failed to load Google Identity Services'));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

function base64UrlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  // atob can throw on bad input; caller handles
  return decodeURIComponent(
    Array.from(atob(b64))
      .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join(''),
  );
}

export function decodeIdToken(jwt: string): GoogleProfile | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>;
    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    const email = typeof payload.email === 'string' ? payload.email : '';
    const name =
      (typeof payload.name === 'string' && payload.name) ||
      (typeof payload.given_name === 'string' && payload.given_name) ||
      email ||
      'Google user';
    const picture = typeof payload.picture === 'string' ? payload.picture : '';
    if (!sub) return null;
    return { sub, email, name, picture };
  } catch {
    return null;
  }
}

/**
 * Initialise GIS, render the Sign-In button into `target`, and invoke
 * `onProfile` when the user completes the credential flow. No-ops when no
 * client ID is configured.
 */
export async function renderGoogleSignInButton(
  target: HTMLElement,
  onProfile: (p: GoogleProfile) => void,
): Promise<void> {
  if (!isGoogleConfigured()) return;
  await loadGoogleSdk();
  const gsi = window.google?.accounts.id;
  if (!gsi) throw new Error('Google Identity Services unavailable');
  gsi.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (resp) => {
      const profile = decodeIdToken(resp.credential);
      if (profile) onProfile(profile);
    },
    auto_select: false,
    cancel_on_tap_outside: true,
  });
  gsi.renderButton(target, {
    type: 'standard',
    theme: 'filled_blue',
    size: 'large',
    text: 'signin_with',
    shape: 'pill',
    logo_alignment: 'left',
    width: 280,
  });
}

/** Tell Google to forget the last sign-in so re-auth requires user gesture. */
export function googleSignOut(): void {
  try {
    window.google?.accounts.id.disableAutoSelect();
  } catch {
    // no-op
  }
}
