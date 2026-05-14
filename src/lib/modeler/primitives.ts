import * as THREE from 'three';

export type PrimitiveType =
  | 'box'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'torus'
  | 'plane';

export interface PrimitiveParams {
  size?: number;
  width?: number;
  height?: number;
  depth?: number;
  radius?: number;
  radiusTop?: number;
  radiusBottom?: number;
  tube?: number;
  segments?: number;
  rings?: number;
}

export function buildPrimitive(type: PrimitiveType, params: PrimitiveParams = {}): THREE.BufferGeometry {
  switch (type) {
    case 'box': {
      const w = params.width ?? params.size ?? 1;
      const h = params.height ?? params.size ?? 1;
      const d = params.depth ?? params.size ?? 1;
      return new THREE.BoxGeometry(w, h, d, 1, 1, 1);
    }
    case 'sphere': {
      const r = params.radius ?? params.size ?? 0.5;
      const s = params.segments ?? 24;
      const r2 = params.rings ?? Math.max(8, Math.floor(s / 2));
      return new THREE.SphereGeometry(r, s, r2);
    }
    case 'cylinder': {
      const rt = params.radiusTop ?? params.radius ?? 0.5;
      const rb = params.radiusBottom ?? params.radius ?? 0.5;
      const h = params.height ?? params.size ?? 1;
      const s = params.segments ?? 24;
      return new THREE.CylinderGeometry(rt, rb, h, s);
    }
    case 'cone': {
      const r = params.radius ?? params.size ?? 0.5;
      const h = params.height ?? params.size ?? 1;
      const s = params.segments ?? 24;
      return new THREE.ConeGeometry(r, h, s);
    }
    case 'torus': {
      const r = params.radius ?? 0.5;
      const tube = params.tube ?? 0.18;
      const s = params.segments ?? 16;
      const r2 = params.rings ?? 32;
      return new THREE.TorusGeometry(r, tube, s, r2);
    }
    case 'plane': {
      const w = params.width ?? params.size ?? 1;
      const h = params.height ?? params.size ?? 1;
      return new THREE.PlaneGeometry(w, h);
    }
  }
}
