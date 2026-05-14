/**
 * Procedural parts catalog. Each part has a generator function that returns a
 * Three.js BufferGeometry built from primitives + boolean ops + extrusions.
 * Parameters expose sliders so users (and the AI) can resize a part.
 */
import * as THREE from 'three';
import { csg } from '@/lib/modeler/csg';

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: string;
}

export interface PartDef {
  id: string;
  name: string;
  category: string;
  description: string;
  params: ParamDef[];
  /** Build geometry from parameter values */
  build: (p: Record<string, number>) => THREE.BufferGeometry;
}

export const CATEGORIES = [
  { id: 'fasteners', label: 'Fasteners' },
  { id: 'gears', label: 'Gears' },
  { id: 'bearings', label: 'Bearings' },
  { id: 'brackets', label: 'Brackets' },
  { id: 'springs', label: 'Springs' },
  { id: 'shafts', label: 'Shafts' },
] as const;

/* ---------------- Fasteners ---------------- */

function hexBolt(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const L = p.length;
  const headH = D * 0.7;
  const headR = D * 0.9;
  // Hex head: 6-sided prism via CylinderGeometry with 6 segments
  const head = new THREE.CylinderGeometry(headR, headR, headH, 6);
  // Shank
  const shank = new THREE.CylinderGeometry(D / 2, D / 2, L, 24);
  // Position pieces in world: head at top, shank descends.
  const headMat = new THREE.Matrix4().makeTranslation(0, headH / 2, 0);
  const shankMat = new THREE.Matrix4().makeTranslation(0, -L / 2, 0);
  // Combine via CSG union for a clean welded result
  return csg(head, headMat, shank, shankMat, 'union');
}

function socketScrew(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const L = p.length;
  const headH = D * 0.9;
  const headR = D * 0.85;
  const head = new THREE.CylinderGeometry(headR, headR, headH, 24);
  const shank = new THREE.CylinderGeometry(D / 2, D / 2, L, 24);
  // Hex socket: a small hexagonal hole in the head
  const socket = new THREE.CylinderGeometry(D * 0.45, D * 0.45, headH * 0.7, 6);
  const headMat = new THREE.Matrix4().makeTranslation(0, headH / 2, 0);
  const shankMat = new THREE.Matrix4().makeTranslation(0, -L / 2, 0);
  const socketMat = new THREE.Matrix4().makeTranslation(0, headH * 0.7, 0);
  const headWithSocket = csg(head, headMat, socket, socketMat, 'subtract');
  return csg(headWithSocket, new THREE.Matrix4(), shank, shankMat, 'union');
}

function nutHex(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const ring = new THREE.CylinderGeometry(D * 0.85, D * 0.85, D * 0.7, 6);
  const hole = new THREE.CylinderGeometry(D / 2, D / 2, D, 24);
  return csg(ring, new THREE.Matrix4(), hole, new THREE.Matrix4(), 'subtract');
}

function washer(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const od = D * 2;
  const t = D * 0.18;
  const outer = new THREE.CylinderGeometry(od / 2, od / 2, t, 32);
  const hole = new THREE.CylinderGeometry(D / 2, D / 2, t * 2, 32);
  return csg(outer, new THREE.Matrix4(), hole, new THREE.Matrix4(), 'subtract');
}

/* ---------------- Gears ---------------- */

function spurGear(p: Record<string, number>): THREE.BufferGeometry {
  const teeth = Math.round(p.teeth);
  const module_ = p.module;
  const thickness = p.thickness;
  const pitchR = (module_ * teeth) / 2;
  const addendum = module_;
  const dedendum = 1.25 * module_;
  const outerR = pitchR + addendum;
  const rootR = pitchR - dedendum;
  // Approximate involute by trapezoidal teeth
  const shape = new THREE.Shape();
  const angularPitch = (2 * Math.PI) / teeth;
  const toothWidthRoot = angularPitch * 0.55;
  const toothWidthTip = angularPitch * 0.32;
  for (let i = 0; i < teeth; i++) {
    const a0 = i * angularPitch - toothWidthRoot / 2;
    const a1 = i * angularPitch - toothWidthTip / 2;
    const a2 = i * angularPitch + toothWidthTip / 2;
    const a3 = i * angularPitch + toothWidthRoot / 2;
    if (i === 0) {
      shape.moveTo(Math.cos(a0) * rootR, Math.sin(a0) * rootR);
    }
    shape.lineTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR);
    shape.lineTo(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
    shape.lineTo(Math.cos(a3) * rootR, Math.sin(a3) * rootR);
    const a3Next = i * angularPitch + (angularPitch - toothWidthRoot / 2);
    shape.lineTo(Math.cos(a3Next) * rootR, Math.sin(a3Next) * rootR);
  }
  // Center hole
  const hole = new THREE.Path();
  const bore = p.bore ?? module_ * teeth * 0.15;
  hole.absarc(0, 0, bore / 2, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 16,
  });
  geom.center();
  geom.rotateX(Math.PI / 2);
  return geom;
}

/* ---------------- Bearings ---------------- */

function ballBearing(p: Record<string, number>): THREE.BufferGeometry {
  const id = p.id_;
  const od = p.od;
  const width = p.width;
  // Outer race
  const outer = new THREE.CylinderGeometry(od / 2, od / 2, width, 48);
  const outerInner = new THREE.CylinderGeometry((id + (od - id) * 0.7) / 2, (id + (od - id) * 0.7) / 2, width * 1.05, 48);
  const outerRace = csg(outer, new THREE.Matrix4(), outerInner, new THREE.Matrix4(), 'subtract');
  // Inner race
  const inner = new THREE.CylinderGeometry((id + (od - id) * 0.3) / 2, (id + (od - id) * 0.3) / 2, width, 48);
  const bore = new THREE.CylinderGeometry(id / 2, id / 2, width * 1.05, 48);
  const innerRace = csg(inner, new THREE.Matrix4(), bore, new THREE.Matrix4(), 'subtract');
  // Merge races
  let combined = csg(outerRace, new THREE.Matrix4(), innerRace, new THREE.Matrix4(), 'union');
  // Add a few balls
  const ballR = (od - id) * 0.13;
  const ringR = (od + id) / 4;
  const nBalls = 10;
  for (let i = 0; i < nBalls; i++) {
    const a = (i / nBalls) * Math.PI * 2;
    const ball = new THREE.SphereGeometry(ballR, 16, 8);
    const m = new THREE.Matrix4().makeTranslation(Math.cos(a) * ringR, 0, Math.sin(a) * ringR);
    combined = csg(combined, new THREE.Matrix4(), ball, m, 'union');
  }
  return combined;
}

/* ---------------- Brackets ---------------- */

function lBracket(p: Record<string, number>): THREE.BufferGeometry {
  const length = p.length;
  const wall = p.thickness;
  const width = p.width;
  // L-shape: two rectangular slabs
  const a = new THREE.BoxGeometry(length, wall, width);
  const aMat = new THREE.Matrix4().makeTranslation(0, wall / 2, 0);
  const b = new THREE.BoxGeometry(wall, length, width);
  const bMat = new THREE.Matrix4().makeTranslation(-length / 2 + wall / 2, length / 2, 0);
  let combined = csg(a, aMat, b, bMat, 'union');
  // 4 mounting holes
  const holeR = p.hole_d / 2;
  const holes = [
    new THREE.Vector3(length / 4, wall, width / 3),
    new THREE.Vector3(length / 4, wall, -width / 3),
    new THREE.Vector3(-length / 4, wall, width / 3),
    new THREE.Vector3(-length / 4, wall, -width / 3),
  ];
  for (const h of holes) {
    const hole = new THREE.CylinderGeometry(holeR, holeR, wall * 3, 16);
    const m = new THREE.Matrix4().makeTranslation(h.x, h.y - wall / 2, h.z);
    combined = csg(combined, new THREE.Matrix4(), hole, m, 'subtract');
  }
  return combined;
}

function tBracket(p: Record<string, number>): THREE.BufferGeometry {
  const length = p.length;
  const wall = p.thickness;
  const width = p.width;
  const a = new THREE.BoxGeometry(length, wall, width);
  const aMat = new THREE.Matrix4().makeTranslation(0, wall / 2, 0);
  const b = new THREE.BoxGeometry(wall, length, width);
  const bMat = new THREE.Matrix4().makeTranslation(0, length / 2, 0);
  return csg(a, aMat, b, bMat, 'union');
}

/* ---------------- Springs ---------------- */

function helicalSpring(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const wireD = p.wire_diameter;
  const length = p.length;
  const turns = p.turns;
  // Sample the helix densely and feed it to a CatmullRomCurve3, then tube it.
  const N = Math.max(64, Math.floor(turns * 32));
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const angle = t * turns * 2 * Math.PI;
    pts.push(
      new THREE.Vector3(
        (D / 2) * Math.cos(angle),
        t * length - length / 2,
        (D / 2) * Math.sin(angle),
      ),
    );
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  return new THREE.TubeGeometry(curve, N * 2, wireD / 2, 12, false);
}

/* ---------------- Shafts ---------------- */

function shaftKeyed(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const L = p.length;
  const shaft = new THREE.CylinderGeometry(D / 2, D / 2, L, 32);
  // Add a small keyway slot (rectangular subtract)
  const keyW = D * 0.25;
  const keyDepth = D * 0.12;
  const slot = new THREE.BoxGeometry(keyW, L * 0.45, keyDepth);
  const slotMat = new THREE.Matrix4().makeTranslation(0, L * 0.2, D / 2 - keyDepth / 2);
  return csg(shaft, new THREE.Matrix4(), slot, slotMat, 'subtract');
}

function steppedShaft(p: Record<string, number>): THREE.BufferGeometry {
  const D1 = p.diameter1;
  const D2 = p.diameter2;
  const L1 = p.length1;
  const L2 = p.length2;
  const s1 = new THREE.CylinderGeometry(D1 / 2, D1 / 2, L1, 32);
  const s2 = new THREE.CylinderGeometry(D2 / 2, D2 / 2, L2, 32);
  const m1 = new THREE.Matrix4().makeTranslation(0, L1 / 2, 0);
  const m2 = new THREE.Matrix4().makeTranslation(0, L1 + L2 / 2, 0);
  return csg(s1, m1, s2, m2, 'union');
}

export const PARTS: PartDef[] = [
  {
    id: 'hex-bolt',
    name: 'Hex Head Bolt',
    category: 'fasteners',
    description: 'Standard hex head bolt with a smooth shank.',
    params: [
      { key: 'diameter', label: 'Diameter', min: 0.2, max: 2, step: 0.05, default: 0.6, unit: 'cm' },
      { key: 'length', label: 'Length', min: 0.5, max: 6, step: 0.1, default: 2.5, unit: 'cm' },
    ],
    build: hexBolt,
  },
  {
    id: 'socket-screw',
    name: 'Socket Head Cap Screw',
    category: 'fasteners',
    description: 'Allen-key socket head screw.',
    params: [
      { key: 'diameter', label: 'Diameter', min: 0.2, max: 2, step: 0.05, default: 0.5, unit: 'cm' },
      { key: 'length', label: 'Length', min: 0.5, max: 6, step: 0.1, default: 2.0, unit: 'cm' },
    ],
    build: socketScrew,
  },
  {
    id: 'hex-nut',
    name: 'Hex Nut',
    category: 'fasteners',
    description: 'Standard hex nut.',
    params: [{ key: 'diameter', label: 'Thread Ø', min: 0.2, max: 2, step: 0.05, default: 0.6, unit: 'cm' }],
    build: nutHex,
  },
  {
    id: 'washer',
    name: 'Flat Washer',
    category: 'fasteners',
    description: 'Flat washer.',
    params: [{ key: 'diameter', label: 'Bore Ø', min: 0.2, max: 2, step: 0.05, default: 0.6, unit: 'cm' }],
    build: washer,
  },
  {
    id: 'spur-gear',
    name: 'Spur Gear',
    category: 'gears',
    description: 'Trapezoidal-tooth approximation of a spur gear with hub.',
    params: [
      { key: 'teeth', label: 'Teeth', min: 8, max: 60, step: 1, default: 20 },
      { key: 'module', label: 'Module', min: 0.1, max: 0.6, step: 0.05, default: 0.25, unit: 'cm' },
      { key: 'thickness', label: 'Thickness', min: 0.2, max: 1.5, step: 0.05, default: 0.5, unit: 'cm' },
      { key: 'bore', label: 'Bore', min: 0.2, max: 2, step: 0.05, default: 0.6, unit: 'cm' },
    ],
    build: spurGear,
  },
  {
    id: 'ball-bearing',
    name: 'Ball Bearing',
    category: 'bearings',
    description: 'Deep-groove ball bearing with inner/outer race + balls.',
    params: [
      { key: 'id_', label: 'Bore', min: 0.5, max: 3, step: 0.1, default: 1.0, unit: 'cm' },
      { key: 'od', label: 'OD', min: 1.2, max: 5, step: 0.1, default: 2.6, unit: 'cm' },
      { key: 'width', label: 'Width', min: 0.4, max: 2, step: 0.05, default: 0.8, unit: 'cm' },
    ],
    build: ballBearing,
  },
  {
    id: 'l-bracket',
    name: 'L Bracket',
    category: 'brackets',
    description: 'L-shaped angle bracket with 4 mounting holes.',
    params: [
      { key: 'length', label: 'Length', min: 1, max: 8, step: 0.2, default: 4, unit: 'cm' },
      { key: 'width', label: 'Width', min: 1, max: 6, step: 0.2, default: 2, unit: 'cm' },
      { key: 'thickness', label: 'Wall', min: 0.1, max: 0.6, step: 0.05, default: 0.2, unit: 'cm' },
      { key: 'hole_d', label: 'Hole Ø', min: 0.2, max: 1, step: 0.05, default: 0.4, unit: 'cm' },
    ],
    build: lBracket,
  },
  {
    id: 't-bracket',
    name: 'T Bracket',
    category: 'brackets',
    description: 'T-shaped support bracket.',
    params: [
      { key: 'length', label: 'Length', min: 1, max: 8, step: 0.2, default: 4, unit: 'cm' },
      { key: 'width', label: 'Width', min: 1, max: 6, step: 0.2, default: 2, unit: 'cm' },
      { key: 'thickness', label: 'Thickness', min: 0.1, max: 0.6, step: 0.05, default: 0.2, unit: 'cm' },
    ],
    build: tBracket,
  },
  {
    id: 'helical-spring',
    name: 'Helical Spring',
    category: 'springs',
    description: 'Coil compression spring.',
    params: [
      { key: 'diameter', label: 'Coil Ø', min: 0.5, max: 3, step: 0.1, default: 1.5, unit: 'cm' },
      { key: 'wire_diameter', label: 'Wire Ø', min: 0.05, max: 0.4, step: 0.01, default: 0.15, unit: 'cm' },
      { key: 'length', label: 'Length', min: 1, max: 8, step: 0.2, default: 4, unit: 'cm' },
      { key: 'turns', label: 'Turns', min: 3, max: 24, step: 1, default: 10 },
    ],
    build: helicalSpring,
  },
  {
    id: 'keyed-shaft',
    name: 'Keyed Shaft',
    category: 'shafts',
    description: 'Cylindrical shaft with a keyway slot.',
    params: [
      { key: 'diameter', label: 'Ø', min: 0.4, max: 3, step: 0.05, default: 1.0, unit: 'cm' },
      { key: 'length', label: 'Length', min: 2, max: 12, step: 0.2, default: 6, unit: 'cm' },
    ],
    build: shaftKeyed,
  },
  {
    id: 'stepped-shaft',
    name: 'Stepped Shaft',
    category: 'shafts',
    description: 'Two-diameter stepped shaft.',
    params: [
      { key: 'diameter1', label: 'Ø1', min: 0.4, max: 3, step: 0.05, default: 1.2, unit: 'cm' },
      { key: 'length1', label: 'L1', min: 1, max: 6, step: 0.2, default: 3, unit: 'cm' },
      { key: 'diameter2', label: 'Ø2', min: 0.2, max: 3, step: 0.05, default: 0.8, unit: 'cm' },
      { key: 'length2', label: 'L2', min: 1, max: 6, step: 0.2, default: 2, unit: 'cm' },
    ],
    build: steppedShaft,
  },
];

export function defaultParams(part: PartDef): Record<string, number> {
  const r: Record<string, number> = {};
  for (const p of part.params) r[p.key] = p.default;
  return r;
}

export function findPart(id: string): PartDef | undefined {
  return PARTS.find((p) => p.id === id);
}

export function searchParts(query: string): PartDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return PARTS;
  return PARTS.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q),
  );
}
