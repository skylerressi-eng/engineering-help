import { useCallback, useEffect } from 'react';
import Desktop from '@/os/Desktop';
import MenuBar from '@/os/MenuBar';
import Dock from '@/os/Dock';
import Window from '@/os/Window';
import Spotlight from '@/os/Spotlight';
import BootScreen from '@/os/BootScreen';
import MobileFallback from '@/os/MobileFallback';
import AiChat from '@/ai/AiChat';
import AiFloatingButton from '@/ai/AiFloatingButton';
import { useWindowStore } from '@/store/windowStore';
import { useUIStore } from '@/store/uiStore';
import { useAiStore } from '@/store/aiStore';
import { useSettingsStore, applyTheme } from '@/store/settingsStore';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
import { getApp } from '@/apps/registry';

export default function App() {
  const windows = useWindowStore((s) => s.windows);
  const toggleSpotlight = useUIStore((s) => s.toggleSpotlight);
  const closeSpotlight = useUIStore((s) => s.closeSpotlight);
  const booted = useUIStore((s) => s.booted);
  const toggleChat = useAiStore((s) => s.toggleChat);
  const startupApps = useSettingsStore((s) => s.startupApps);

  // Apply persisted theme on first paint
  useEffect(() => {
    applyTheme();
  }, []);

  // Open startup apps once the boot animation completes
  useEffect(() => {
    if (!booted) return;
    for (const id of startupApps) {
      const app = getApp(id);
      if (app) {
        useWindowStore.getState().openApp(id, {
          title: app.manifest.name,
          width: app.manifest.defaultSize?.width,
          height: app.manifest.defaultSize?.height,
        });
      }
    }
    // Only run once after boot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted]);

  useKeyboardShortcut({ key: 'k', meta: true }, useCallback(() => toggleSpotlight(), [toggleSpotlight]));
  useKeyboardShortcut({ key: ' ', meta: true }, useCallback(() => toggleSpotlight(), [toggleSpotlight]));
  useKeyboardShortcut({ key: 'i', meta: true }, useCallback(() => toggleChat(), [toggleChat]));
  useKeyboardShortcut({ key: 'Escape' }, useCallback(() => closeSpotlight(), [closeSpotlight]));

  return (
    <div className="fixed inset-0 overflow-hidden">
      <Desktop>
        {/* Windows live above the wallpaper, below menu bar and dock */}
        <div className="absolute inset-0" style={{ paddingTop: 28 }}>
          {windows.map((w) => (
            <Window key={w.id} state={w} />
          ))}
        </div>
      </Desktop>

      <MenuBar />
      <Dock />
      <AiFloatingButton />
      <AiChat />
      <Spotlight />

      {!booted && <BootScreen />}
      <MobileFallback />
    </div>
  );
}
