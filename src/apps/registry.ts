import type { AppModule } from '@/os/types';
import hello from './hello';

export const APPS: Record<string, AppModule> = {
  [hello.manifest.id]: hello,
};

export const APP_LIST: AppModule[] = Object.values(APPS);

export function getApp(id: string): AppModule | undefined {
  return APPS[id];
}
