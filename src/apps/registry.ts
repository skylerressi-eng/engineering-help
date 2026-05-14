import type { AppModule } from '@/os/types';
import hello from './hello';
import calculator from './calculator';
import converter from './converter';
import notes from './notes';
import logiclab from './logiclab';
import physicsbench from './physicsbench';
import aerosim from './aerosim';
import modeler3d from './modeler3d';
import circuitsim from './circuitsim';

export const APPS: Record<string, AppModule> = {
  [logiclab.manifest.id]: logiclab,
  [circuitsim.manifest.id]: circuitsim,
  [physicsbench.manifest.id]: physicsbench,
  [aerosim.manifest.id]: aerosim,
  [modeler3d.manifest.id]: modeler3d,
  [calculator.manifest.id]: calculator,
  [converter.manifest.id]: converter,
  [notes.manifest.id]: notes,
  [hello.manifest.id]: hello,
};

export const APP_LIST: AppModule[] = Object.values(APPS);

export function getApp(id: string): AppModule | undefined {
  return APPS[id];
}
