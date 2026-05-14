import { useState, useEffect, useRef } from 'react';
import { useUIStore, WALLPAPERS } from '@/store/uiStore';
import { useWindowStore } from '@/store/windowStore';

interface ContextMenuState {
  x: number;
  y: number;
}

export default function Desktop({ children }: { children: React.ReactNode }) {
  const wallpaperId = useUIStore((s) => s.wallpaper);
  const setWallpaper = useUIStore((s) => s.setWallpaper);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [submenu, setSubmenu] = useState<string | null>(null);
  const openApp = useWindowStore((s) => s.openApp);
  const menuRef = useRef<HTMLDivElement>(null);

  const wp = WALLPAPERS.find((w) => w.id === wallpaperId) ?? WALLPAPERS[0];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menu && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
        setSubmenu(null);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [menu]);

  const onContextMenu = (e: React.MouseEvent) => {
    // Only show our menu when the click is on the desktop background itself
    if ((e.target as HTMLElement).dataset.desktopBg !== 'true') return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
    setSubmenu(null);
  };

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      onContextMenu={onContextMenu}
      style={{
        backgroundImage: wp.css,
        backgroundSize: 'cover',
        backgroundColor: '#0b1020',
      }}
    >
      {/* The background layer that captures right-clicks for the desktop menu */}
      <div data-desktop-bg="true" className="absolute inset-0" />

      {/* Subtle vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.35) 100%)',
        }}
        data-desktop-bg="true"
      />

      {children}

      {menu && (
        <div
          ref={menuRef}
          className="fixed glass-strong glass-edge rounded-xl py-1.5 shadow-window text-sm text-white/90 min-w-[200px] z-[5000]"
          style={{ left: menu.x, top: menu.y }}
        >
          <ContextItem
            label="Change Wallpaper"
            hasSubmenu
            active={submenu === 'wallpaper'}
            onHover={() => setSubmenu('wallpaper')}
          />
          {submenu === 'wallpaper' && (
            <div
              className="absolute left-full top-0 ml-1 glass-strong glass-edge rounded-xl py-1.5 shadow-window min-w-[160px]"
              onMouseLeave={() => setSubmenu(null)}
            >
              {WALLPAPERS.map((w) => (
                <button
                  key={w.id}
                  onClick={() => {
                    setWallpaper(w.id);
                    setMenu(null);
                    setSubmenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2"
                >
                  <span
                    className="w-4 h-4 rounded-md border border-white/20"
                    style={{ backgroundImage: w.css, backgroundSize: 'cover' }}
                  />
                  {w.name}
                  {w.id === wallpaperId && <span className="ml-auto text-accent">✓</span>}
                </button>
              ))}
            </div>
          )}
          <div className="my-1 h-px bg-white/10" />
          <ContextItem
            label="New Note"
            onClick={() => {
              setMenu(null);
              // Notes app not built yet — fallback: open hello so the menu still feels alive.
              openApp('hello', { title: 'Hello' });
            }}
          />
          <div className="my-1 h-px bg-white/10" />
          <ContextItem
            label="About EngOS"
            onClick={() => {
              setMenu(null);
              alert('EngOS v0.1\nA macOS-style desktop for engineering students.');
            }}
          />
        </div>
      )}
    </div>
  );
}

function ContextItem({
  label,
  onClick,
  hasSubmenu,
  active,
  onHover,
}: {
  label: string;
  onClick?: () => void;
  hasSubmenu?: boolean;
  active?: boolean;
  onHover?: () => void;
}) {
  return (
    <button
      onMouseEnter={onHover}
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${
        active ? 'bg-white/10' : 'hover:bg-white/10'
      }`}
    >
      <span className="flex-1">{label}</span>
      {hasSubmenu && <span className="text-white/40 text-xs">›</span>}
    </button>
  );
}
