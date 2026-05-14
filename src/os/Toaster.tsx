import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, XCircle, Info, X as XIcon } from 'lucide-react';
import { useToastStore, type ToastKind } from '@/store/toastStore';

const ICONS: Record<ToastKind, React.ComponentType<any>> = {
  info: Info,
  success: CheckCircle2,
  warn: AlertTriangle,
  error: XCircle,
};

const COLORS: Record<ToastKind, string> = {
  info: 'text-sky-400',
  success: 'text-emerald-400',
  warn: 'text-amber-400',
  error: 'text-rose-400',
};

export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div className="fixed bottom-24 right-6 z-[8000] flex flex-col gap-2 items-end pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 30, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 30, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="pointer-events-auto rounded-xl glass-strong glass-edge shadow-window px-3 py-2.5 max-w-[340px] flex items-start gap-2.5 border border-white/12"
              style={{
                boxShadow:
                  '0 12px 30px -8px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.10)',
              }}
            >
              <Icon size={16} className={`${COLORS[t.kind]} mt-0.5 shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{t.title}</div>
                {t.body && <div className="text-xs text-white/65 mt-0.5">{t.body}</div>}
                {t.action && (
                  <button
                    onClick={() => {
                      t.action?.onClick();
                      dismiss(t.id);
                    }}
                    className="mt-2 text-xs px-2 py-1 rounded-md bg-accent hover:bg-accent-hover text-white"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="text-white/45 hover:text-white p-0.5 rounded-md hover:bg-white/10"
                title="Dismiss"
              >
                <XIcon size={12} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
