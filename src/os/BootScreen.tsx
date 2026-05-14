import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';

/**
 * First-load boot animation: black background, EngOS gear/logo fades + scales in,
 * then transitions out to reveal the desktop. The dock-slide-up is handled by
 * the dock itself watching `booted`.
 */
export default function BootScreen() {
  const setBooted = useUIStore((s) => s.setBooted);

  useEffect(() => {
    const t = window.setTimeout(() => setBooted(true), 1700);
    return () => window.clearTimeout(t);
  }, [setBooted]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ delay: 1.35, duration: 0.55, ease: 'easeOut' }}
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center pointer-events-none"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center"
      >
        <EngOSMark size={84} />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-5 text-white/80 text-base tracking-[0.3em] font-medium"
        >
          ENG OS
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="mt-6 w-44 h-1 rounded-full bg-white/8 overflow-hidden"
        >
          <motion.div
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ delay: 0.6, duration: 0.9, ease: 'easeOut' }}
            className="h-full bg-white/70 rounded-full"
          />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export function EngOSMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  // A custom gear-meets-apple inspired mark drawn in SVG.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="engos-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="50%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      <g transform="translate(50 50)">
        {[...Array(8)].map((_, i) => (
          <rect
            key={i}
            x={-5}
            y={-44}
            width={10}
            height={14}
            rx={2}
            transform={`rotate(${i * 45})`}
            fill="url(#engos-grad)"
          />
        ))}
        <circle r={26} fill="url(#engos-grad)" />
        <circle r={10} fill="#0b1020" />
      </g>
    </svg>
  );
}
