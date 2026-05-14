import { useState } from 'react';
import { Rnd } from 'react-rnd';
import { motion, AnimatePresence } from 'framer-motion';
import type { WindowState } from '@/os/types';
import { useWindowStore } from '@/store/windowStore';
import { getApp } from '@/apps/registry';
import ErrorBoundary from '@/os/ErrorBoundary';

const TITLE_BAR_HEIGHT = 36;

export default function Window({ state }: { state: WindowState }) {
  const focusedId = useWindowStore((s) => s.focusedId);
  const focusWindow = useWindowStore((s) => s.focusWindow);
  const closeWindow = useWindowStore((s) => s.closeWindow);
  const minimizeWindow = useWindowStore((s) => s.minimizeWindow);
  const toggleMaximize = useWindowStore((s) => s.toggleMaximize);
  const moveWindow = useWindowStore((s) => s.moveWindow);
  const resizeWindow = useWindowStore((s) => s.resizeWindow);
  const [closing, setClosing] = useState(false);
  const [hoverChrome, setHoverChrome] = useState(false);

  const app = getApp(state.appId);
  if (!app) return null;
  const focused = focusedId === state.id;

  const onClose = () => {
    setClosing(true);
    window.setTimeout(() => closeWindow(state.id), 160);
  };

  const onMax = () => {
    toggleMaximize(state.id, { w: window.innerWidth, h: window.innerHeight });
  };

  return (
    <AnimatePresence>
      {!closing && !state.minimized && (
        <Rnd
          size={{ width: state.width, height: state.height }}
          position={{ x: state.x, y: state.y }}
          minWidth={320}
          minHeight={200}
          bounds="parent"
          dragHandleClassName="window-drag-handle"
          disableDragging={state.maximized}
          enableResizing={!state.maximized}
          onDragStart={() => focusWindow(state.id)}
          onDragStop={(_, d) => moveWindow(state.id, d.x, d.y)}
          onResizeStart={() => focusWindow(state.id)}
          onResizeStop={(_, __, ref, ___, position) =>
            resizeWindow(state.id, {
              x: position.x,
              y: position.y,
              width: parseInt(ref.style.width, 10),
              height: parseInt(ref.style.height, 10),
            })
          }
          style={{ zIndex: state.zIndex }}
          className="absolute"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.93 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.93 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onMouseDown={() => focusWindow(state.id)}
            className={`flex flex-col w-full h-full overflow-hidden rounded-2xl border ${
              focused
                ? 'border-white/20 shadow-window'
                : 'border-white/10 shadow-window-unfocused'
            } glass-window`}
            style={{
              backdropFilter: 'blur(36px) saturate(180%)',
              WebkitBackdropFilter: 'blur(36px) saturate(180%)',
              boxShadow: focused
                ? '0 22px 50px -12px rgba(0,0,0,0.55), 0 4px 10px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.08)'
                : '0 8px 24px -10px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            {/* Title bar */}
            <div
              className="window-drag-handle flex items-center px-3 relative chrome"
              style={{ height: TITLE_BAR_HEIGHT, background: 'rgba(255,255,255,0.04)' }}
              onMouseEnter={() => setHoverChrome(true)}
              onMouseLeave={() => setHoverChrome(false)}
              onDoubleClick={onMax}
            >
              {/* Traffic lights (left) */}
              <div className="flex items-center gap-2">
                <TrafficLight color="red" symbol="×" focused={focused} hover={hoverChrome} onClick={onClose} />
                <TrafficLight
                  color="yellow"
                  symbol="−"
                  focused={focused}
                  hover={hoverChrome}
                  onClick={() => minimizeWindow(state.id)}
                />
                <TrafficLight
                  color="green"
                  symbol="+"
                  focused={focused}
                  hover={hoverChrome}
                  onClick={onMax}
                />
              </div>
              {/* Centered title */}
              <div className="absolute left-1/2 -translate-x-1/2 text-[13px] font-medium text-white/85">
                {state.title}
              </div>
            </div>

            {/* App content */}
            <div className="flex-1 overflow-auto app-content text-white/90">
              <ErrorBoundary label={app.manifest.name}>
                <app.Component windowId={state.id} appId={state.appId} />
              </ErrorBoundary>
            </div>
          </motion.div>
        </Rnd>
      )}
    </AnimatePresence>
  );
}

function TrafficLight({
  color,
  symbol,
  focused,
  hover,
  onClick,
}: {
  color: 'red' | 'yellow' | 'green';
  symbol: string;
  focused: boolean;
  hover: boolean;
  onClick: () => void;
}) {
  const bg =
    !focused && !hover
      ? '#6b7280'
      : color === 'red'
        ? '#FF5F57'
        : color === 'yellow'
          ? '#FEBC2E'
          : '#28C840';
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="w-3 h-3 rounded-full flex items-center justify-center text-[8px] font-bold text-black/65 leading-none transition-colors"
      style={{ background: bg }}
      tabIndex={-1}
    >
      <span className={hover ? 'opacity-90' : 'opacity-0'}>{symbol}</span>
    </button>
  );
}
