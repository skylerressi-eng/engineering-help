import { useEffect, useState } from 'react';
import { Monitor } from 'lucide-react';

/**
 * EngOS targets desktop-sized viewports. On narrow screens we show a soft
 * paywall-style overlay explaining the situation; the user can dismiss to
 * continue anyway, after which we enable touch event passthrough.
 */
export default function MobileFallback() {
  const [narrow, setNarrow] = useState(() => window.innerWidth < 900);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!narrow || dismissed) return null;

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/85 backdrop-blur-md p-6">
      <div className="max-w-sm w-full rounded-2xl glass-strong glass-edge p-6 text-center text-white shadow-window">
        <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center bg-gradient-to-br from-sky-500 to-indigo-500">
          <Monitor size={26} className="text-white" />
        </div>
        <div className="mt-4 text-xl font-semibold">EngOS is designed for desktop</div>
        <div className="mt-2 text-sm text-white/70 leading-relaxed">
          We need at least a 900px wide viewport for the windowing system, 3D viewports, and
          circuit canvases to work well. You can still try it on this device, but expect rough
          edges.
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="mt-5 w-full py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium"
        >
          View anyway
        </button>
      </div>
    </div>
  );
}
