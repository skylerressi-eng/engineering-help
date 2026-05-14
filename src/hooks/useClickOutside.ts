import { useEffect, type RefObject } from 'react';

/**
 * Call `handler` when the user mouses-down outside the referenced element.
 * Pass `enabled=false` to disable the listener (avoids extra handlers when a
 * popover is closed).
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handler: (e: MouseEvent) => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) handler(e);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [ref, handler, enabled]);
}
