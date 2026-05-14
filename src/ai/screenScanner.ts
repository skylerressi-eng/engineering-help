/**
 * Apps publish a serializable snapshot of their state via `publishAppState`.
 * The Scan Screen button reads the focused window's appId and returns the
 * latest published state. If an app doesn't publish, the scanner returns a
 * minimal "I see app X" stub.
 */

import { useWindowStore } from '@/store/windowStore';
import { getApp } from '@/apps/registry';

export interface AppStateSnapshot {
  /** Human-readable summary so the model has prose context */
  summary: string;
  /** Structured state — kept small */
  state: Record<string, unknown>;
}

type Publisher = () => AppStateSnapshot;
const publishers = new Map<string, Publisher>();

export function publishAppState(appId: string, publisher: Publisher): () => void {
  publishers.set(appId, publisher);
  return () => {
    if (publishers.get(appId) === publisher) publishers.delete(appId);
  };
}

export interface ScanResult {
  appId: string | null;
  appName: string;
  windowTitle: string | null;
  snapshot: AppStateSnapshot;
}

export function scanFocusedScreen(): ScanResult {
  const { focusedId, windows } = useWindowStore.getState();
  const win = focusedId ? windows.find((w) => w.id === focusedId) : undefined;
  if (!win) {
    return {
      appId: null,
      appName: 'Desktop',
      windowTitle: null,
      snapshot: {
        summary: 'The user is looking at the desktop with no app focused.',
        state: {},
      },
    };
  }
  const app = getApp(win.appId);
  const publisher = publishers.get(win.appId);
  const snapshot = publisher
    ? publisher()
    : {
        summary: `The user has ${app?.manifest.name ?? win.appId} open. ${
          app?.manifest.description ?? ''
        }`,
        state: {},
      };
  return {
    appId: win.appId,
    appName: app?.manifest.name ?? win.appId,
    windowTitle: win.title,
    snapshot,
  };
}

export function formatScanForPrompt(scan: ScanResult): string {
  const stateStr = Object.keys(scan.snapshot.state).length
    ? `\nStructured state: ${JSON.stringify(scan.snapshot.state, null, 2)}`
    : '';
  return `Here is what the user is currently looking at:
App: ${scan.appName}${scan.windowTitle ? ` (window: ${scan.windowTitle})` : ''}
${scan.snapshot.summary}${stateStr}`;
}
