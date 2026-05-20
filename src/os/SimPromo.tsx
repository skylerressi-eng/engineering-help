/**
 * SimPromo — a desktop widget that lives on the OS home screen. It showcases
 * RoboSim, lets guests try a free demo, and surfaces the Pro subscription.
 * Dismissed per-session via local state; re-appears after page reload.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Lock, CheckCircle2, Gauge, Radio } from 'lucide-react';
import { RoboIcon } from '@/apps/icons';
import { useWindowStore } from '@/store/windowStore';
import { useSubStore, isPro } from '@/store/subscriptionStore';
import { openCheckout, isStripeConfigured, STRIPE_PRICE, STRIPE_PERIOD } from '@/lib/stripe';
import { getApp } from '@/apps/registry';

const PRO_FEATURES = [
  { icon: <Gauge size={12} />, label: 'Unlimited drive time' },
  { icon: <Radio size={12} />, label: 'FRC, open & obstacle fields' },
  { icon: <Zap size={12} />, label: 'All drivetrains + live tuning' },
];

const FREE_FEATURES = [
  '3-minute demo sessions',
  'Open field only',
  'Competition drivetrain only',
];

export default function SimPromo() {
  const [dismissed, setDismissed] = useState(false);
  const tier = useSubStore((s) => s.tier);
  const expiresAt = useSubStore((s) => s.expiresAt);
  const openApp = useWindowStore((s) => s.openApp);
  const pro = tier === 'pro' && isPro();

  const launch = () => {
    const app = getApp('robosim');
    if (!app) return;
    openApp('robosim', {
      title: app.manifest.name,
      width: app.manifest.defaultSize?.width,
      height: app.manifest.defaultSize?.height,
    });
  };

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, x: -12, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -12, scale: 0.97 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="absolute z-[100] w-64 rounded-2xl overflow-hidden glass-strong glass-edge shadow-window select-none"
          style={{ top: 44, left: 16 }}
        >
          {/* Header banner */}
          <div
            className="relative px-4 pt-4 pb-3 flex flex-col"
            style={{ background: 'linear-gradient(135deg,#f59e0b22 0%,#ef444422 100%)' }}
          >
            <button
              onClick={() => setDismissed(true)}
              className="absolute top-2 right-2 text-white/40 hover:text-white/80 transition-colors"
            >
              <X size={13} />
            </button>

            <div className="flex items-center gap-2.5">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center border border-white/15 shrink-0"
                style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}
              >
                <RoboIcon size={22} className="text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white leading-tight">RoboSim Pro</div>
                <div className="text-[11px] text-white/55 leading-tight">Ultimate driving simulator</div>
              </div>
            </div>

            {pro ? (
              <div className="mt-2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 w-fit">
                <CheckCircle2 size={11} className="text-emerald-400" />
                <span className="text-[11px] font-semibold text-emerald-300">
                  Pro active
                  {expiresAt ? ` · renews ${new Date(expiresAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : ''}
                </span>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/8 border border-white/12 w-fit">
                <Lock size={10} className="text-white/50" />
                <span className="text-[11px] text-white/55">
                  {STRIPE_PRICE}/{STRIPE_PERIOD} after free trial
                </span>
              </div>
            )}
          </div>

          {/* Feature list */}
          <div className="px-4 py-3 border-t border-white/8 space-y-1.5">
            {pro ? (
              PRO_FEATURES.map((f) => (
                <div key={f.label} className="flex items-center gap-2 text-[12px] text-white/80">
                  <span className="text-emerald-400">{f.icon}</span>
                  {f.label}
                </div>
              ))
            ) : (
              <>
                <div className="text-[10px] uppercase tracking-wide text-white/40 mb-1">Free demo includes</div>
                {FREE_FEATURES.map((f) => (
                  <div key={f} className="flex items-center gap-1.5 text-[12px] text-white/65">
                    <span className="w-1 h-1 rounded-full bg-white/35 shrink-0" />
                    {f}
                  </div>
                ))}
              </>
            )}
          </div>

          {/* CTA buttons */}
          <div className="px-3 pb-3 flex flex-col gap-1.5">
            {pro ? (
              <button
                onClick={launch}
                className="w-full py-2 rounded-xl text-[13px] font-semibold text-white flex items-center justify-center gap-1.5"
                style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}
              >
                <RoboIcon size={14} />
                Open RoboSim
              </button>
            ) : (
              <>
                {isStripeConfigured() ? (
                  <button
                    onClick={openCheckout}
                    className="w-full py-2 rounded-xl text-[13px] font-semibold text-white flex items-center justify-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}
                  >
                    <Zap size={13} />
                    Subscribe — {STRIPE_PRICE}/{STRIPE_PERIOD}
                  </button>
                ) : (
                  <div className="text-[10px] text-white/35 text-center leading-tight px-1">
                    Set <code className="font-mono bg-black/25 px-0.5 rounded">VITE_STRIPE_PAYMENT_LINK</code> to enable payments
                  </div>
                )}
                <button
                  onClick={launch}
                  className="w-full py-1.5 rounded-xl text-[12px] font-medium text-white/75 bg-white/8 hover:bg-white/12 border border-white/10 transition-colors"
                >
                  Try free demo (3 min)
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
