/**
 * DemoGate — wraps the RoboSim viewport. When the user is on the free tier:
 *   • Shows a countdown banner for the 3-minute demo session.
 *   • When time runs out, renders a full paywall overlay (robot still visible
 *     but frozen behind a blur).
 *   • Offers "Subscribe" and "Restart demo" (resets the session timer only).
 * Pro users see none of this.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, RotateCcw, Lock, CheckCircle2 } from 'lucide-react';
import { RoboIcon } from '@/apps/icons';
import { useSubStore, isPro } from '@/store/subscriptionStore';
import { openCheckout, isStripeConfigured, STRIPE_PRICE, STRIPE_PERIOD } from '@/lib/stripe';

export const DEMO_SECONDS = 3 * 60; // 3 minutes per session

interface Props {
  children: React.ReactNode;
  /** Called when demo gate freezes the sim (expired). Parent should stop physics. */
  onFreeze: (frozen: boolean) => void;
}

export default function DemoGate({ children, onFreeze }: Props) {
  const tier = useSubStore((s) => s.tier);
  const pro = tier === 'pro' && isPro();
  const [secondsLeft, setSecondsLeft] = useState(DEMO_SECONDS);
  const [expired, setExpired] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = () => {
    setSecondsLeft(DEMO_SECONDS);
    setExpired(false);
    onFreeze(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current!);
          setExpired(true);
          onFreeze(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    if (pro) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      onFreeze(false);
      return;
    }
    startTimer();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // intentionally runs only once on mount (or when pro status changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pro]);

  if (pro) return <>{children}</>;

  const mins = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, '0');
  const urgency = secondsLeft <= 30;

  return (
    <div className="relative w-full h-full">
      {children}

      {/* Demo countdown banner — thin bar at the very top of the viewport */}
      {!expired && (
        <div
          className={`absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-3 py-1 text-[11px] font-mono transition-colors ${
            urgency
              ? 'bg-red-500/30 border-b border-red-400/40 text-red-200'
              : 'bg-black/40 border-b border-white/10 text-white/70'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <RoboIcon size={12} />
            <span className="font-sans text-[10px] uppercase tracking-wider opacity-70">
              Free demo
            </span>
          </div>
          <div className={urgency ? 'font-bold animate-pulse' : ''}>
            {mins}:{secs}
          </div>
          {isStripeConfigured() ? (
            <button
              onClick={openCheckout}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-semibold text-white"
              style={{ background: 'linear-gradient(90deg,#f59e0b,#ef4444)' }}
            >
              <Zap size={9} />
              Go Pro
            </button>
          ) : (
            <span className="opacity-40 font-sans">No Stripe key set</span>
          )}
        </div>
      )}

      {/* Full paywall overlay — appears when demo expires */}
      <AnimatePresence>
        {expired && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 z-40 flex items-center justify-center"
            style={{ backdropFilter: 'blur(12px) brightness(0.45)' }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="w-72 rounded-2xl glass-strong glass-edge shadow-window p-6 text-center"
            >
              <div
                className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center border border-white/15 mb-4"
                style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}
              >
                <RoboIcon size={30} className="text-white" />
              </div>

              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Lock size={13} className="text-white/60" />
                <h2 className="text-base font-semibold text-white">Demo ended</h2>
              </div>
              <p className="text-[12px] text-white/55 leading-relaxed mb-5">
                Your 3-minute free session is up. Subscribe to keep driving
                with unlimited time, all fields, and full tuning.
              </p>

              {/* Pro feature pills */}
              <div className="flex flex-wrap justify-center gap-1.5 mb-5">
                {['Unlimited time', 'FRC field + scoring', 'All drivetrains', 'Live tuning'].map(
                  (f) => (
                    <div
                      key={f}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/8 border border-white/12 text-[10px] text-white/70"
                    >
                      <CheckCircle2 size={9} className="text-emerald-400" />
                      {f}
                    </div>
                  ),
                )}
              </div>

              <div className="space-y-2">
                {isStripeConfigured() ? (
                  <button
                    onClick={openCheckout}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
                    style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}
                  >
                    <Zap size={14} />
                    Subscribe — {STRIPE_PRICE}/{STRIPE_PERIOD}
                  </button>
                ) : (
                  <div className="text-[10px] text-white/35 px-2 py-1.5 rounded-xl bg-white/5 border border-white/10 leading-tight">
                    Add <code className="font-mono">VITE_STRIPE_PAYMENT_LINK</code> to enable payments.
                  </div>
                )}
                <button
                  onClick={startTimer}
                  className="w-full py-2 rounded-xl text-sm text-white/65 bg-white/8 hover:bg-white/12 border border-white/10 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <RotateCcw size={13} />
                  Restart demo (3 min)
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
