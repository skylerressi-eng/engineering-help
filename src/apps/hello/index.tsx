import type { AppModule } from '@/os/types';
import { HelloIcon } from '@/apps/icons';

function HelloApp() {
  return (
    <div className="flex flex-col items-center justify-center h-full app-content">
      <div className="text-5xl font-semibold tracking-tight bg-gradient-to-br from-white via-white to-white/60 bg-clip-text text-transparent">
        Hello, EngOS
      </div>
      <div className="mt-3 text-sm text-white/55">
        Phase 1 placeholder · window system verified
      </div>
    </div>
  );
}

const module: AppModule = {
  manifest: {
    id: 'hello',
    name: 'Hello',
    description: 'Phase 1 test app — confirms the window system works',
    icon: HelloIcon,
    defaultSize: { width: 560, height: 360 },
    accent: 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)',
    hideFromDock: true,
  },
  Component: HelloApp,
};

export default module;
