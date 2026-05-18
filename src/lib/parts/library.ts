/**
 * Unified CAD library. Combines the procedural PARTS catalog (every part is
 * automatically available at its default size — no "save" step required) with
 * the user's saved Modeler3D models. AeroSim, PhysicsBench and FEAForge all
 * read from here so a single base library of CAD files is importable anywhere.
 */
import * as THREE from 'three';
import { PARTS, defaultParams } from './catalog';
import { useLibraryStore, geometryFromJSON } from '@/store/libraryStore';

export type LibrarySource = 'catalog' | 'saved';

export interface LibraryItem {
  id: string;
  name: string;
  category: string;
  source: LibrarySource;
  color: string;
  /** Build a fresh BufferGeometry for this item. Caller owns disposal. */
  build: () => THREE.BufferGeometry;
}

const CATALOG_COLOR = '#9aa6b8';

/** Every catalog part (at default params) plus every saved model. */
export function getLibraryItems(): LibraryItem[] {
  const catalog: LibraryItem[] = PARTS.map((p) => ({
    id: `catalog:${p.id}`,
    name: p.name,
    category: p.category,
    source: 'catalog',
    color: CATALOG_COLOR,
    build: () => p.build(defaultParams(p)),
  }));

  const saved: LibraryItem[] = useLibraryStore.getState().models.map((m) => ({
    id: `saved:${m.id}`,
    name: m.name,
    category: 'saved',
    source: 'saved',
    color: m.color,
    build: () => geometryFromJSON(m.geom),
  }));

  return [...saved, ...catalog];
}
