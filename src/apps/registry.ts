import type { AppModule } from '@/os/types';
import hello from './hello';
import calculator from './calculator';
import converter from './converter';
import notes from './notes';
import logiclab from './logiclab';

export const APPS: Record<string, AppModule> = {
  [logiclab.manifest.id]: logiclab,
  [calculator.manifest.id]: calculator,
  [converter.manifest.id]: converter,
  [notes.manifest.id]: notes,
  [hello.manifest.id]: hello,
};

export const APP_LIST: AppModule[] = Object.values(APPS);

export function getApp(id: string): AppModule | undefined {
  return APPS[id];
}
