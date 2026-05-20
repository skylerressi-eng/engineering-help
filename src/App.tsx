import { useCallback, useEffect } from 'react';
import Desktop from '@/os/Desktop';
import MenuBar from '@/os/MenuBar';
import Dock from '@/os/Dock';
import Window from '@/os/Window';
import Spotlight from '@/os/Spotlight';
import BootScreen from '@/os/BootScreen';
import LoginScreen from '@/os/LoginScreen';
import MobileFallback from '@/os/MobileFallback';
import Toaster from '@/os/Toaster';
import PowerOverlay from '@/os/PowerOverlay';
import AiChat from '@/ai/AiChat';
import AiFloatingButton from '@/ai/AiFloatingButton';
import { useWindowStore } from '@/store/windowStore';
import { useUIStore } from '@/store/uiStore';
import { useAiStore } from '@/store/aiStore';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore, applyTheme } from '@/store/settingsStore';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
import { getApp } from '@/apps/registry';

export default function App() {
  const user = useAuthStore((s) => s.user);
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
    if (!booted || !user) return;
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
    // Only run once after boot + login
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted, user]);

  useKeyboardShortcut({ key: 'k', meta: true }, useCallback(() => toggleSpotlight(), [toggleSpotlight]));
  useKeyboardShortcut({ key: ' ', meta: true }, useCallback(() => toggleSpotlight(), [toggleSpotlight]));
  useKeyboardShortcut({ key: 'i', meta: true }, useCallback(() => toggleChat(), [toggleChat]));
  useKeyboardShortcut({ key: 'Escape' }, useCallback(() => closeSpotlight(), [closeSpotlight]));
  useKeyboardShortcut(
    { key: 'w', meta: true },
    useCallback(() => {
      const { focusedId, closeWindow } = useWindowStore.getState();
      if (focusedId) closeWindow(focusedId);
    }, []),
  );
  useKeyboardShortcut(
    { key: 'm', meta: true },
    useCallback(() => {
      const { focusedId, minimizeWindow } = useWindowStore.getState();
      if (focusedId) minimizeWindow(focusedId);
    }, []),
  );

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

      <Toaster />
      <PowerOverlay />

      {!booted && <BootScreen />}
      {booted && !user && <LoginScreen />}
      <MobileFallback />
    </div>
  );
}
