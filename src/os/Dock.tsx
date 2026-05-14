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
        className="pointer-events-auto glass-strong glass-edge rounded-2xl px-3 flex items-end gap-2 shadow-window"
        style={{
          height: ICON_MAX,
          paddingBottom: 6,
          paddingTop: 6,
          background: 'rgba(255,255,255,0.16)',
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
    window.setTimeout(() => {
      openApp(app.id, {
        title: app.name,
        width: app.defaultSize?.width,
        height: app.defaultSize?.height,
        x: app.defaultPosition?.x,
        y: app.defaultPosition?.y,
      });
      setLaunching(app.id, false);
    }, 380);
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
        style={{ width: size, height: size }}
        whileTap={{ scale: 0.92 }}
        className={`relative rounded-xl flex items-center justify-center shadow-lg border border-white/10 overflow-hidden ${
          launching ? 'animate-dock-bounce' : ''
        }`}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              app.accent ?? 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
          }}
        />
        <Icon className="text-white drop-shadow relative z-10" size={Math.max(20, iconBase * 0.5)} />
      </motion.button>
      {/* running indicator */}
      <div
        className={`absolute -bottom-1 w-1 h-1 rounded-full transition-all ${
          running ? 'bg-white/90' : 'bg-transparent'
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
        style={{ width: size, height: size }}
        whileTap={{ scale: 0.92 }}
        className="rounded-xl flex items-center justify-center bg-white/10 border border-white/15 backdrop-blur-md"
        title="Trash"
      >
        <Trash2 className="text-white/85" size={Math.max(20, iconBase * 0.45)} />
      </motion.button>
    </div>
  );
}
