import { useCallback } from 'react';
import Desktop from '@/os/Desktop';
import MenuBar from '@/os/MenuBar';
import Dock from '@/os/Dock';
import Window from '@/os/Window';
import Spotlight from '@/os/Spotlight';
import BootScreen from '@/os/BootScreen';
import { useWindowStore } from '@/store/windowStore';
import { useUIStore } from '@/store/uiStore';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';

export default function App() {
  const windows = useWindowStore((s) => s.windows);
  const toggleSpotlight = useUIStore((s) => s.toggleSpotlight);
  const closeSpotlight = useUIStore((s) => s.closeSpotlight);
  const booted = useUIStore((s) => s.booted);

  useKeyboardShortcut({ key: 'k', meta: true }, useCallback(() => toggleSpotlight(), [toggleSpotlight]));
  useKeyboardShortcut({ key: ' ', meta: true }, useCallback(() => toggleSpotlight(), [toggleSpotlight]));
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
      <Spotlight />

      {!booted && <BootScreen />}
    </div>
  );
}
