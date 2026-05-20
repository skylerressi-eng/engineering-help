import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { LogIn, User as UserIcon, AlertCircle } from 'lucide-react';
import { EngOSMark } from './BootScreen';
import { useAuthStore } from '@/store/authStore';
import {
  isGoogleConfigured,
  renderGoogleSignInButton,
} from '@/lib/googleAuth';

export default function LoginScreen() {
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signInAsGuest = useAuthStore((s) => s.signInAsGuest);
  const btnRef = useRef<HTMLDivElement>(null);
  const [guestName, setGuestName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [googleReady, setGoogleReady] = useState(false);

  useEffect(() => {
    if (!isGoogleConfigured()) return;
    let cancelled = false;
    const target = btnRef.current;
    if (!target) return;
    renderGoogleSignInButton(target, (profile) => {
      if (!cancelled) signInWithGoogle(profile);
    })
      .then(() => {
        if (!cancelled) setGoogleReady(true);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Google sign-in unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [signInWithGoogle]);

  const onGuest = () => {
    signInAsGuest(guestName);
  };

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 30%, #1d2547 0%, #0a0f1e 55%, #050813 100%)',
        }}
      />
      {/* Subtle grain / orbs */}
      <div
        className="absolute inset-0 opacity-50 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 20% 80%, rgba(99,102,241,0.25) 0%, transparent 45%), radial-gradient(circle at 80% 20%, rgba(236,72,153,0.18) 0%, transparent 45%)',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-[400px] max-w-[92vw] rounded-3xl glass-strong glass-edge shadow-window p-8"
      >
        <div className="flex flex-col items-center text-center">
          <EngOSMark size={64} />
          <h1 className="mt-4 text-2xl font-semibold text-white tracking-tight">
            Welcome to EngOS
          </h1>
          <p className="mt-1.5 text-sm text-white/55 max-w-[280px]">
            Sign in to sync your settings, layouts, and app state across sessions.
          </p>
        </div>

        <div className="mt-7 space-y-3">
          {isGoogleConfigured() ? (
            <div className="flex flex-col items-center gap-2">
              <div
                ref={btnRef}
                className="flex justify-center min-h-[44px] w-full"
              />
              {!googleReady && !error && (
                <div className="text-[11px] text-white/40">
                  Loading Google sign-in…
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-amber-500/10 border border-amber-400/25 px-3 py-2.5 flex gap-2 text-[12px] text-amber-200/95">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                Google sign-in is not configured. Set{' '}
                <code className="font-mono text-[11px] bg-black/30 px-1 py-0.5 rounded">
                  VITE_GOOGLE_CLIENT_ID
                </code>{' '}
                in your env to enable it.
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-400/25 px-3 py-2 text-[12px] text-red-200/95 flex gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-white/12" />
            <span className="text-[10px] uppercase tracking-wider text-white/40">
              or continue as
            </span>
            <div className="flex-1 h-px bg-white/12" />
          </div>

          {/* Guest sign-in */}
          <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 h-11 focus-within:border-white/25 transition-colors">
            <UserIcon size={15} className="text-white/55 shrink-0" />
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onGuest();
              }}
              placeholder="Your name (optional)"
              className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-white/35"
            />
          </div>
          <button
            onClick={onGuest}
            className="w-full h-11 rounded-xl bg-white/10 hover:bg-white/15 border border-white/12 text-sm font-medium text-white flex items-center justify-center gap-2 transition-colors"
          >
            <LogIn size={15} />
            Continue as guest
          </button>
        </div>

        <div className="mt-6 text-center text-[10px] text-white/35 leading-relaxed">
          By signing in you agree to keep your robot designs civilised.
          <br />
          EngOS · {new Date().getFullYear()}
        </div>
      </motion.div>
    </div>
  );
}
