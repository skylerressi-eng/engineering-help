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
import pcbdesign from './pcbdesign';
import dataviz from './dataviz';
import feaforge from './feaforge';
import mechsim from './mechsim';
import partslib from './partslib';
import settings from './settings';
import conway from './conway';
import robotsim from './robotsim';

export const APPS: Record<string, AppModule> = {
  [logiclab.manifest.id]: logiclab,
  [circuitsim.manifest.id]: circuitsim,
  [pcbdesign.manifest.id]: pcbdesign,
  [dataviz.manifest.id]: dataviz,
  [feaforge.manifest.id]: feaforge,
  [mechsim.manifest.id]: mechsim,
  [physicsbench.manifest.id]: physicsbench,
  [robotsim.manifest.id]: robotsim,
  [aerosim.manifest.id]: aerosim,
  [modeler3d.manifest.id]: modeler3d,
  [partslib.manifest.id]: partslib,
  [conway.manifest.id]: conway,
  [calculator.manifest.id]: calculator,
  [converter.manifest.id]: converter,
  [notes.manifest.id]: notes,
  [settings.manifest.id]: settings,
  [hello.manifest.id]: hello,
};

export const APP_LIST: AppModule[] = Object.values(APPS);

export function getApp(id: string): AppModule | undefined {
  return APPS[id];
}
