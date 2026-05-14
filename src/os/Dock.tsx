import { useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, useSpring, type MotionValue } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { useWindowStore } from '@/store/windowStore';
import { useUIStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { APP_LIST } from '@/apps/registry';
import type { AppManifest } from '@/os/types';

const MAGNIFY_RADIUS = 110;

export default function Dock() {
  const booted = useUIStore((s) => s.booted);
  const dockSize = useSettingsStore((s) => s.dockSize);
  const ICON_MAX = dockSize;
  const ICON_BASE = Math.max(40, Math.round(dockSize * 0.67));
  const mouseX = useMotionValue<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <motion.div
      initial={{ y: 120, opacity: 0 }}
      animate={booted ? { y: 0, opacity: 1 } : { y: 120, opacity: 0 }}
      transition={{ delay: 0.1, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      className="fixed bottom-2 left-0 right-0 z-[3500] flex justify-center pointer-events-none"
    >
      <div
        ref={containerRef}
        onMouseMove={(e) => {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) mouseX.set(e.clientX - rect.left);
        }}
        onMouseLeave={() => mouseX.set(null)}
        className="pointer-events-auto rounded-3xl px-3 flex items-end gap-2"
        style={{
          height: ICON_MAX,
          paddingBottom: 6,
          paddingTop: 6,
          background: 'rgba(28, 28, 36, 0.55)',
          backdropFilter: 'blur(34px) saturate(180%)',
          WebkitBackdropFilter: 'blur(34px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.16)',
          boxShadow:
            '0 12px 36px -8px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.18)',
        }}
      >
        {APP_LIST.filter((a) => !a.manifest.hideFromDock).map((app, i) => (
          <DockIcon
            key={app.manifest.id}
            app={app.manifest}
            mouseX={mouseX}
            index={i}
            iconBase={ICON_BASE}
            iconMax={ICON_MAX}
          />
        ))}

        <div className="w-px h-12 bg-white/15 mx-1 self-center" />

        <TrashIcon mouseX={mouseX} iconBase={ICON_BASE} iconMax={ICON_MAX} />
      </div>
    </motion.div>
  );
}

function useIconSize(
  mouseX: MotionValue<number | null>,
  ref: React.RefObject<HTMLDivElement>,
  iconBase: number,
  iconMax: number,
) {
  // Compute distance-based size. Re-derived each frame via useTransform on the parent's mouseX.
  const distance = useTransform(mouseX, (mx) => {
    if (mx === null || !ref.current) return MAGNIFY_RADIUS * 2;
    const parent = ref.current.parentElement!;
    const pr = parent.getBoundingClientRect();
    const ir = ref.current.getBoundingClientRect();
    const center = ir.left - pr.left + ir.width / 2;
    return Math.abs(mx - center);
  });
  const sizeRaw = useTransform(distance, [0, MAGNIFY_RADIUS], [iconMax, iconBase], {
    clamp: true,
  });
  return useSpring(sizeRaw, { stiffness: 320, damping: 26, mass: 0.4 });
}

function DockIcon({
  app,
  mouseX,
  iconBase,
  iconMax,
}: {
  app: AppManifest;
  mouseX: MotionValue<number | null>;
  index: number;
  iconBase: number;
  iconMax: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useIconSize(mouseX, ref, iconBase, iconMax);
  const openApp = useWindowStore((s) => s.openApp);
  const windows = useWindowStore((s) => s.windows);
  const focusWindow = useWindowStore((s) => s.focusWindow);
  const restoreWindow = useWindowStore((s) => s.restoreWindow);
  const setLaunching = useWindowStore((s) => s.setLaunching);
  const launching = useWindowStore((s) => s.launchingApps.has(app.id));
  const [hover, setHover] = useState(false);

  const running = windows.some((w) => w.appId === app.id);

  const onClick = () => {
    const existing = windows.find((w) => w.appId === app.id);
    if (existing) {
      if (existing.minimized) restoreWindow(existing.id);
      else focusWindow(existing.id);
      return;
    }
    setLaunching(app.id, true);
    // Open the window immediately so the user sees a response, then clear the
    // bouncing flag a moment later for the visual flourish.
    openApp(app.id, {
      title: app.name,
      width: app.defaultSize?.width,
      height: app.defaultSize?.height,
      x: app.defaultPosition?.x,
      y: app.defaultPosition?.y,
    });
    window.setTimeout(() => setLaunching(app.id, false), 600);
  };

  const Icon = app.icon;

  return (
    <div
      ref={ref}
      className="relative flex flex-col items-center justify-end"
      style={{ width: iconMax, height: iconMax }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hover && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md text-[12px] glass-strong text-white whitespace-nowrap pointer-events-none">
          {app.name}
        </div>
      )}
      <motion.button
        onClick={onClick}
        style={{ width: size, height: size, borderRadius: '26%' }}
        whileTap={{ scale: 0.92 }}
        className={`relative flex items-center justify-center shadow-lg border border-white/15 overflow-hidden ${
          launching ? 'animate-dock-bounce' : ''
        }`}
      >
        {/* base gradient */}
        <div
          className="absolute inset-0"
          style={{
            background:
              app.accent ?? 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
          }}
        />
        {/* glossy top sheen */}
        <div
          className="absolute inset-x-0 top-0 h-1/2 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.00) 100%)',
          }}
        />
        {/* inner ring + soft inset shadow at the bottom */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: '26%',
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -8px 14px -8px rgba(0,0,0,0.40)',
          }}
        />
        <Icon
          className="text-white drop-shadow relative z-10"
          size={Math.max(20, iconBase * 0.52)}
          strokeWidth={1.8}
        />
      </motion.button>
      {/* running indicator */}
      <div
        className={`absolute -bottom-0.5 w-1.5 h-1.5 rounded-full transition-all ${
          running ? 'bg-white/90 shadow-[0_0_4px_rgba(255,255,255,0.5)]' : 'bg-transparent'
        }`}
      />
    </div>
  );
}

function TrashIcon({
  mouseX,
  iconBase,
  iconMax,
}: {
  mouseX: MotionValue<number | null>;
  iconBase: number;
  iconMax: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useIconSize(mouseX, ref, iconBase, iconMax);
  return (
    <div
      ref={ref}
      className="relative flex flex-col items-center justify-end"
      style={{ width: iconMax, height: iconMax }}
    >
      <motion.button
        style={{ width: size, height: size, borderRadius: '26%' }}
        whileTap={{ scale: 0.92 }}
        className="relative flex items-center justify-center bg-white/8 border border-white/15 backdrop-blur-md overflow-hidden"
        title="Trash"
      >
        <div
          className="absolute inset-x-0 top-0 h-1/2 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%)',
          }}
        />
        <Trash2
          className="text-white/85 relative z-10"
          size={Math.max(20, iconBase * 0.46)}
          strokeWidth={1.8}
        />
      </motion.button>
    </div>
  );
}
