import { useEffect } from 'react';

export interface ShortcutSpec {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

/**
 * Global keyboard shortcut. Matches on either Cmd (meta) or Ctrl when `meta` is true,
 * so the shortcut works on macOS and other platforms.
 */
export function useKeyboardShortcut(spec: ShortcutSpec, handler: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== spec.key.toLowerCase()) return;
      if (spec.meta && !(e.metaKey || e.ctrlKey)) return;
      if (spec.ctrl && !e.ctrlKey) return;
      if (spec.shift && !e.shiftKey) return;
      if (spec.alt && !e.altKey) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [spec.key, spec.meta, spec.ctrl, spec.shift, spec.alt, handler]);
}
