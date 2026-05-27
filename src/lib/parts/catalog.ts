/**
 * Procedural parts catalog. Each part has a generator function that returns a
 * Three.js BufferGeometry built from primitives + boolean ops + extrusions.
 * Parameters expose sliders so users (and the AI) can resize a part.
 */
import * as THREE from 'three';
import { csg } from '@/lib/modeler/csg';

/* ---------------- Geometry helpers ---------------- */

/** Concatenate buffer geometries into one — much cheaper than CSG when the
 *  shapes don't actually intersect (e.g. layering a thread spiral on top of a
 *  shank, dotting rollers around a hub). */
function mergeMany(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const g of geoms) {
    const pg = g.index ? g.toNonIndexed() : g;
    const pos = pg.attributes.position.array as Float32Array;
    for (let i = 0; i < pos.length; i++) positions.push(pos[i]);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.computeVertexNormals();
  return out;
}

/** Helical thread ridge — a thin tube wound around the +Y axis between
 *  yBottom..yTop. Used to give bolts and screws a real machined-thread look
 *  instead of a smooth shank. */
function helicalThread(opts: {
  D: number;
  yBottom: number;
  yTop: number;
  pitch?: number;
  depth?: number;
  radial?: number;
}): THREE.BufferGeometry {
  const { D, yBottom, yTop } = opts;
  const length = yTop - yBottom;
  if (length <= 0) return new THREE.BufferGeometry();
  const pitch = opts.pitch ?? Math.max(D * 0.35, 0.08);
  const depth = opts.depth ?? D * 0.08;
  const radial = opts.radial ?? 6;
  const turns = Math.max(1, length / pitch);
  const segs = Math.max(48, Math.floor(turns * 24));
  const pts: THREE.Vector3[] = [];
  // Lead-in and lead-out below/above the actual thread span so the tube ends
  // tuck into the shank rather than floating in air.
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const angle = t * turns * Math.PI * 2;
    const r = (D / 2) + depth * 0.5;
    pts.push(
      new THREE.Vector3(
        r * Math.cos(angle),
        yBottom + t * length,
        r * Math.sin(angle),
      ),
    );
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  return new THREE.TubeGeometry(curve, segs, depth, radial, false);
}

/** Phillips cross-slot — two thin boxes crossing at 90°, sized to bite into a
 *  screw head. Caller subtracts this from the head. */
function phillipsSlot(D: number, depth: number, headTop: number): {
  geom: THREE.BufferGeometry;
  mat: THREE.Matrix4;
} {
  const w = D * 0.18;
  const l = D * 1.0;
  const a = new THREE.BoxGeometry(l, depth, w);
  const b = new THREE.BoxGeometry(w, depth, l);
  const merged = mergeMany([a, b]);
  const m = new THREE.Matrix4().makeTranslation(0, headTop - depth / 2, 0);
  return { geom: merged, mat: m };
}

/** Straight slot — single bar across a screw head. */
function slotHead(D: number, depth: number, headTop: number): {
  geom: THREE.BufferGeometry;
  mat: THREE.Matrix4;
} {
  const w = D * 0.18;
  const l = D * 1.4;
  const slot = new THREE.BoxGeometry(l, depth, w);
  const m = new THREE.Matrix4().makeTranslation(0, headTop - depth / 2, 0);
  return { geom: slot, mat: m };
}

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
  { id: 'pulleys', label: 'Pulleys & Belts' },
  { id: 'couplings', label: 'Couplings & Hubs' },
  { id: 'profiles', label: 'Structural Profiles' },
  { id: 'wheels', label: 'Wheels' },
  { id: 'pneumatic', label: 'Pneumatic / Plumbing' },
  { id: 'electronics', label: 'Electronics' },
] as const;

/* ---------------- Fasteners ---------------- */

function hexBolt(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const L = p.length;
  const headH = D * 0.7;
  const headR = D * 0.95;
  // Hex head with chamfered top edge — two stacked frustums for the bevel.
  const headChamfer = D * 0.12;
  const headTop = new THREE.CylinderGeometry(headR * 0.92, headR, headChamfer, 6);
  const headMid = new THREE.CylinderGeometry(headR, headR, headH - headChamfer * 2, 6);
  const headBot = new THREE.CylinderGeometry(headR, headR * 0.92, headChamfer, 6);
  const head = mergeMany([
    moved(headTop, 0, headH - headChamfer / 2, 0),
    moved(headMid, 0, headH / 2, 0),
    moved(headBot, 0, headChamfer / 2, 0),
  ]);
  const shank = new THREE.CylinderGeometry(D / 2, D / 2, L, 28);
  const shankMat = new THREE.Matrix4().makeTranslation(0, -L / 2, 0);
  // Helical thread on the bottom ~70% of the shank (the upper 30% is the
  // unthreaded shoulder — that's how real hex bolts are machined).
  const threadTop = -L * 0.25;
  const threadBot = -L + D * 0.15;
  const threads = helicalThread({ D, yBottom: threadBot, yTop: threadTop, pitch: D * 0.4 });
  // Chamfered tip
  const tip = new THREE.CylinderGeometry(D / 2, D * 0.32, D * 0.18, 24);
  const tipMat = new THREE.Matrix4().makeTranslation(0, -L + D * 0.09, 0);
  return mergeMany([
    head,
    transformed(shank, shankMat),
    threads,
    transformed(tip, tipMat),
  ]);
}

function moved(g: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry {
  const c = g.clone();
  c.translate(x, y, z);
  return c;
}

function transformed(g: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  const c = g.clone();
  c.applyMatrix4(m);
  return c;
}

function socketScrew(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const L = p.length;
  const headH = D * 0.95;
  const headR = D * 0.82;
  // Cylindrical head with a knurled-style rim by stacking two small frustums
  // (top chamfer) so the silhouette looks like a real socket cap screw.
  const headTop = new THREE.CylinderGeometry(headR * 0.93, headR, D * 0.1, 32);
  const headBody = new THREE.CylinderGeometry(headR, headR, headH - D * 0.1, 32);
  const headRaw = mergeMany([
    moved(headTop, 0, headH - D * 0.05, 0),
    moved(headBody, 0, (headH - D * 0.1) / 2, 0),
  ]);
  // Internal hex socket — subtract a 6-sided prism (real screws are hex, not
  // round). Using csg here gives a clean hole.
  const socket = new THREE.CylinderGeometry(D * 0.4, D * 0.4, headH * 0.7, 6);
  const headWithSocket = csg(
    headRaw,
    new THREE.Matrix4(),
    socket,
    new THREE.Matrix4().makeTranslation(0, headH * 0.65, 0),
    'subtract',
  );
  const shank = new THREE.CylinderGeometry(D / 2, D / 2, L, 28);
  const threads = helicalThread({
    D,
    yBottom: -L + D * 0.12,
    yTop: -D * 0.1,
    pitch: D * 0.35,
  });
  const tip = new THREE.CylinderGeometry(D / 2, D * 0.3, D * 0.18, 24);
  return mergeMany([
    headWithSocket,
    moved(shank, 0, -L / 2, 0),
    threads,
    moved(tip, 0, -L + D * 0.09, 0),
  ]);
}

function nutHex(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const acrossFlats = D * 1.7;
  const acrossCorners = acrossFlats / Math.cos(Math.PI / 6);
  const h = D * 0.85;
  const chamfer = D * 0.12;
  // Chamfered hex: top + bottom frustums + straight middle.
  const top = new THREE.CylinderGeometry(acrossCorners / 2 * 0.92, acrossCorners / 2, chamfer, 6);
  const mid = new THREE.CylinderGeometry(acrossCorners / 2, acrossCorners / 2, h - chamfer * 2, 6);
  const bot = new THREE.CylinderGeometry(acrossCorners / 2, acrossCorners / 2 * 0.92, chamfer, 6);
  const body = mergeMany([
    moved(top, 0, h / 2 - chamfer / 2, 0),
    moved(mid, 0, 0, 0),
    moved(bot, 0, -h / 2 + chamfer / 2, 0),
  ]);
  const hole = new THREE.CylinderGeometry(D / 2, D / 2, h * 1.5, 32);
  const bored = csg(body, new THREE.Matrix4(), hole, new THREE.Matrix4(), 'subtract');
  // Internal threads visible looking into the bore
  const threads = helicalThread({
    D: D * 1.02,
    yBottom: -h / 2 + chamfer,
    yTop: h / 2 - chamfer,
    pitch: D * 0.35,
    depth: D * 0.05,
  });
  return mergeMany([bored, threads]);
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

/* ---------------- More fasteners ---------------- */

function flatHeadScrew(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const L = p.length;
  const headH = D * 0.45;
  const headR = D * 1.05;
  // Countersunk cone (wide top tapering down to the shank radius).
  const head = new THREE.CylinderGeometry(headR, D / 2, headH, 32);
  const headRaw = moved(head, 0, headH / 2, 0);
  // Phillips slot in the top
  const slot = phillipsSlot(D, D * 0.18, headH);
  const headSlotted = csg(headRaw, new THREE.Matrix4(), slot.geom, slot.mat, 'subtract');
  const shank = new THREE.CylinderGeometry(D / 2, D / 2, L, 28);
  const threads = helicalThread({
    D,
    yBottom: -L + D * 0.12,
    yTop: -D * 0.05,
    pitch: D * 0.32,
  });
  const tip = new THREE.CylinderGeometry(D / 2, 0, D * 0.5, 24); // pointed self-tapping tip
  return mergeMany([
    headSlotted,
    moved(shank, 0, -L / 2 + D * 0.12, 0),
    threads,
    moved(tip, 0, -L + D * 0.12, 0),
  ]);
}

function panHeadScrew(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const L = p.length;
  const headH = D * 0.5;
  const headR = D * 0.95;
  // Domed top — a sphere section sliced flat at its equator gives the
  // classic pan-head profile.
  const head = new THREE.SphereGeometry(headR, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const headBase = new THREE.CylinderGeometry(headR, headR * 0.96, headH * 0.2, 32);
  const headRaw = mergeMany([
    moved(head, 0, headH * 0.2, 0),
    moved(headBase, 0, headH * 0.1, 0),
  ]);
  const slot = phillipsSlot(D, D * 0.18, headH * 1.1);
  const headSlotted = csg(headRaw, new THREE.Matrix4(), slot.geom, slot.mat, 'subtract');
  const shank = new THREE.CylinderGeometry(D / 2, D / 2, L, 28);
  const threads = helicalThread({
    D,
    yBottom: -L + D * 0.12,
    yTop: -D * 0.05,
    pitch: D * 0.32,
  });
  const tip = new THREE.CylinderGeometry(D / 2, D * 0.25, D * 0.22, 24);
  return mergeMany([
    headSlotted,
    moved(shank, 0, -L / 2, 0),
    threads,
    moved(tip, 0, -L + D * 0.11, 0),
  ]);
}

function buttonHeadScrew(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const L = p.length;
  const headR = D * 0.9;
  const head = new THREE.SphereGeometry(headR, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  // Internal hex socket
  const socket = new THREE.CylinderGeometry(D * 0.32, D * 0.32, headR * 0.7, 6);
  const headBored = csg(
    head,
    new THREE.Matrix4(),
    socket,
    new THREE.Matrix4().makeTranslation(0, headR * 0.55, 0),
    'subtract',
  );
  const shank = new THREE.CylinderGeometry(D / 2, D / 2, L, 28);
  const threads = helicalThread({
    D,
    yBottom: -L + D * 0.12,
    yTop: -D * 0.05,
    pitch: D * 0.32,
  });
  const tip = new THREE.CylinderGeometry(D / 2, D * 0.3, D * 0.18, 24);
  return mergeMany([
    headBored,
    moved(shank, 0, -L / 2, 0),
    threads,
    moved(tip, 0, -L + D * 0.09, 0),
  ]);
}

function setScrew(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const L = p.length;
  const body = new THREE.CylinderGeometry(D / 2, D / 2, L, 28);
  const socket = new THREE.CylinderGeometry(D * 0.32, D * 0.32, L * 0.35, 6);
  const bored = csg(
    body,
    new THREE.Matrix4(),
    socket,
    new THREE.Matrix4().makeTranslation(0, L * 0.33, 0),
    'subtract',
  );
  // Full-length thread (set screws are threaded end-to-end)
  const threads = helicalThread({
    D,
    yBottom: -L / 2 + D * 0.1,
    yTop: L / 2 - D * 0.1,
    pitch: D * 0.32,
  });
  // Cup-point bottom (concave)
  const cup = new THREE.CylinderGeometry(D * 0.35, D * 0.35, D * 0.12, 16);
  const bottomed = csg(
    bored,
    new THREE.Matrix4(),
    cup,
    new THREE.Matrix4().makeTranslation(0, -L / 2 + D * 0.05, 0),
    'subtract',
  );
  return mergeMany([bottomed, threads]);
}

function threadedRod(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const L = p.length;
  const core = new THREE.CylinderGeometry(D / 2, D / 2, L, 28);
  const threads = helicalThread({
    D,
    yBottom: -L / 2 + D * 0.1,
    yTop: L / 2 - D * 0.1,
    pitch: D * 0.4,
  });
  return mergeMany([core, threads]);
}

function eyeBolt(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const L = p.length;
  const eyeR = D * 1.2;
  const ring = new THREE.TorusGeometry(eyeR, D * 0.25, 12, 24);
  const ringMat = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  ringMat.setPosition(0, eyeR + D * 0.1, 0);
  const shank = new THREE.CylinderGeometry(D / 2, D / 2, L, 24);
  return csg(ring, ringMat, shank, new THREE.Matrix4().makeTranslation(0, -L / 2, 0), 'union');
}

function uBolt(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const W = p.width;
  const L = p.length;
  // Two parallel shanks + a top arc
  const shankL = new THREE.CylinderGeometry(D / 2, D / 2, L, 24);
  const shankR = new THREE.CylinderGeometry(D / 2, D / 2, L, 24);
  const arc = new THREE.TorusGeometry(W / 2, D / 2, 8, 16, Math.PI);
  const arcMat = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  arcMat.multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
  arcMat.setPosition(0, L / 2, 0);
  let g = csg(
    shankL, new THREE.Matrix4().makeTranslation(-W / 2, 0, 0),
    shankR, new THREE.Matrix4().makeTranslation(W / 2, 0, 0),
    'union',
  );
  g = csg(g, new THREE.Matrix4(), arc, arcMat, 'union');
  return g;
}

function lockNut(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const ring = new THREE.CylinderGeometry(D * 0.85, D * 0.85, D * 0.85, 6);
  const hole = new THREE.CylinderGeometry(D / 2, D / 2, D, 24);
  // Nylon insert: smaller cylinder on top
  const insert = new THREE.CylinderGeometry(D * 0.55, D * 0.55, D * 0.18, 24);
  let g = csg(ring, new THREE.Matrix4(), hole, new THREE.Matrix4(), 'subtract');
  g = csg(g, new THREE.Matrix4(), insert, new THREE.Matrix4().makeTranslation(0, D * 0.5, 0), 'union');
  return g;
}

function wingNut(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const ring = new THREE.CylinderGeometry(D * 0.7, D * 0.7, D * 0.6, 24);
  const hole = new THREE.CylinderGeometry(D / 2, D / 2, D, 24);
  let g = csg(ring, new THREE.Matrix4(), hole, new THREE.Matrix4(), 'subtract');
  // Two wings
  const wing = new THREE.BoxGeometry(D * 1.6, D * 0.6, D * 0.18);
  g = csg(g, new THREE.Matrix4(), wing, new THREE.Matrix4().makeTranslation(0, 0, 0), 'union');
  return g;
}

function squareNut(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const block = new THREE.BoxGeometry(D * 1.6, D * 0.6, D * 1.6);
  const hole = new THREE.CylinderGeometry(D / 2, D / 2, D, 24);
  return csg(block, new THREE.Matrix4(), hole, new THREE.Matrix4(), 'subtract');
}

function lockWasher(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const od = D * 1.8;
  const t = D * 0.22;
  // Approximate as washer with a small splay; simple ring + hole
  const outer = new THREE.CylinderGeometry(od / 2, od / 2, t, 32);
  const hole = new THREE.CylinderGeometry(D / 2, D / 2, t * 2, 32);
  return csg(outer, new THREE.Matrix4(), hole, new THREE.Matrix4(), 'subtract');
}

function fenderWasher(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const od = D * 3;
  const t = D * 0.18;
  const outer = new THREE.CylinderGeometry(od / 2, od / 2, t, 32);
  const hole = new THREE.CylinderGeometry(D / 2, D / 2, t * 2, 32);
  return csg(outer, new THREE.Matrix4(), hole, new THREE.Matrix4(), 'subtract');
}

function rivet(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const L = p.length;
  const head = new THREE.SphereGeometry(D * 0.9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const shank = new THREE.CylinderGeometry(D / 2, D / 2, L, 24);
  // Mandrel — central pull-pin that protrudes from the head (typical pop rivet)
  const mandrel = new THREE.CylinderGeometry(D * 0.18, D * 0.18, D * 1.3, 16);
  return mergeMany([
    head,
    moved(shank, 0, -L / 2, 0),
    moved(mandrel, 0, D * 0.7, 0),
  ]);
}

/* ---------------- Gears ---------------- */

function helicalGear(p: Record<string, number>): THREE.BufferGeometry {
  // Approximated by stacking a stack of slightly-rotated spur gear slabs.
  const teeth = Math.round(p.teeth);
  const module_ = p.module;
  const thickness = p.thickness;
  const helix = p.helix; // total twist in rad
  const slabs = 6;
  const slabH = thickness / slabs;
  let composite: THREE.BufferGeometry | null = null;
  for (let i = 0; i < slabs; i++) {
    const slab = spurGear({ teeth, module: module_, thickness: slabH, bore: p.bore });
    slab.rotateY((i / (slabs - 1) - 0.5) * helix);
    slab.translate(0, (i - slabs / 2 + 0.5) * slabH, 0);
    composite = composite
      ? csg(composite, new THREE.Matrix4(), slab, new THREE.Matrix4(), 'union')
      : slab;
  }
  return composite ?? new THREE.BoxGeometry(1, 1, 1);
}

function bevelGear(p: Record<string, number>): THREE.BufferGeometry {
  // Approximate as cone with crenellated rim — easier-to-render frustum
  const teeth = Math.max(8, Math.floor(p.teeth));
  const r = p.radius;
  const rTop = r * 0.65;
  const h = p.thickness;
  const body = new THREE.CylinderGeometry(rTop, r, h, teeth);
  return body;
}

function gearRack(p: Record<string, number>): THREE.BufferGeometry {
  const length = p.length;
  const teeth = Math.max(6, Math.floor(p.teeth));
  const toothH = p.module;
  const baseH = toothH * 1.2;
  const width = p.width;
  // Base bar
  let g: THREE.BufferGeometry = new THREE.BoxGeometry(length, baseH, width);
  // Trapezoidal teeth as small boxes on top
  const pitch = length / teeth;
  for (let i = 0; i < teeth; i++) {
    const tooth = new THREE.BoxGeometry(pitch * 0.5, toothH, width);
    const m = new THREE.Matrix4().makeTranslation(
      -length / 2 + (i + 0.5) * pitch,
      baseH / 2 + toothH / 2,
      0,
    );
    g = csg(g, new THREE.Matrix4(), tooth, m, 'union');
  }
  return g;
}

function wormGear(p: Record<string, number>): THREE.BufferGeometry {
  // Helical sweep similar to spring but thicker, fewer turns.
  const D = p.diameter;
  const wireD = p.toothH;
  const length = p.length;
  const turns = p.turns;
  const N = Math.max(48, Math.floor(turns * 24));
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
  // Tube + a central shaft
  const tube = new THREE.TubeGeometry(curve, N * 2, wireD / 2, 10, false);
  const shaft = new THREE.CylinderGeometry(D / 2 - wireD / 2, D / 2 - wireD / 2, length, 24);
  return csg(tube, new THREE.Matrix4(), shaft, new THREE.Matrix4(), 'union');
}

/* ---------------- Bearings ---------------- */

function thrustBearing(p: Record<string, number>): THREE.BufferGeometry {
  const id = p.id_;
  const od = p.od;
  const t = p.thickness;
  // Two flat washers + a row of balls between
  const top = new THREE.CylinderGeometry(od / 2, od / 2, t * 0.35, 48);
  const topBore = new THREE.CylinderGeometry(id / 2, id / 2, t, 48);
  const bottom = new THREE.CylinderGeometry(od / 2, od / 2, t * 0.35, 48);
  const ballR = (od - id) * 0.18;
  const ringR = (od + id) / 4;
  let g = csg(top, new THREE.Matrix4().makeTranslation(0, t * 0.32, 0), topBore, new THREE.Matrix4(), 'subtract');
  g = csg(
    g,
    new THREE.Matrix4(),
    bottom,
    new THREE.Matrix4().makeTranslation(0, -t * 0.32, 0),
    'union',
  );
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const ball = new THREE.SphereGeometry(ballR, 14, 8);
    g = csg(
      g,
      new THREE.Matrix4(),
      ball,
      new THREE.Matrix4().makeTranslation(Math.cos(a) * ringR, 0, Math.sin(a) * ringR),
      'union',
    );
  }
  return g;
}

function needleBearing(p: Record<string, number>): THREE.BufferGeometry {
  const id = p.id_;
  const od = p.od;
  const w = p.width;
  const outer = new THREE.CylinderGeometry(od / 2, od / 2, w, 48);
  const inner = new THREE.CylinderGeometry((od - 0.05) / 2, (od - 0.05) / 2, w * 1.05, 48);
  let g = csg(outer, new THREE.Matrix4(), inner, new THREE.Matrix4(), 'subtract');
  // Needles
  const needleR = (od - id) * 0.08;
  const ringR = (od + id) / 4;
  const N = 16;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const needle = new THREE.CylinderGeometry(needleR, needleR, w * 0.95, 8);
    g = csg(
      g,
      new THREE.Matrix4(),
      needle,
      new THREE.Matrix4().makeTranslation(Math.cos(a) * ringR, 0, Math.sin(a) * ringR),
      'union',
    );
  }
  return g;
}

function pillowBlock(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.bore;
  const w = D * 3.2;
  const h = D * 2.2;
  const block = new THREE.BoxGeometry(w, h, D * 1.4);
  const bore = new THREE.CylinderGeometry(D / 2, D / 2, D * 2, 32);
  bore.rotateX(Math.PI / 2);
  let g = csg(block, new THREE.Matrix4(), bore, new THREE.Matrix4().makeTranslation(0, D * 0.2, 0), 'subtract');
  // Mounting holes
  for (const x of [-w / 2 + D * 0.4, w / 2 - D * 0.4]) {
    const hole = new THREE.CylinderGeometry(D * 0.28, D * 0.28, h, 16);
    g = csg(g, new THREE.Matrix4(), hole, new THREE.Matrix4().makeTranslation(x, 0, 0), 'subtract');
  }
  return g;
}

function bushing(p: Record<string, number>): THREE.BufferGeometry {
  const id = p.id_;
  const od = p.od;
  const len = p.length;
  const outer = new THREE.CylinderGeometry(od / 2, od / 2, len, 32);
  const bore = new THREE.CylinderGeometry(id / 2, id / 2, len * 1.05, 32);
  return csg(outer, new THREE.Matrix4(), bore, new THREE.Matrix4(), 'subtract');
}

function linearBearing(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.bore;
  const len = p.length;
  const outer = new THREE.CylinderGeometry(D * 0.95, D * 0.95, len, 24);
  const bore = new THREE.CylinderGeometry(D / 2, D / 2, len * 1.05, 24);
  return csg(outer, new THREE.Matrix4(), bore, new THREE.Matrix4(), 'subtract');
}

/* ---------------- Brackets ---------------- */

function angleBracket(p: Record<string, number>): THREE.BufferGeometry {
  const len = p.length;
  const wall = p.thickness;
  const w = p.width;
  const a = new THREE.BoxGeometry(len, wall, w);
  const b = new THREE.BoxGeometry(wall, len, w);
  const aMat = new THREE.Matrix4().makeTranslation(0, wall / 2, 0);
  const bMat = new THREE.Matrix4().makeTranslation(0, len / 2, 0);
  let g = csg(a, aMat, b, bMat, 'union');
  // Gusset (triangular brace)
  const gusset = new THREE.BufferGeometry();
  const verts = new Float32Array([
    0, wall, 0,
    len * 0.4, wall, 0,
    0, len * 0.4, 0,
    0, wall, w,
    len * 0.4, wall, w,
    0, len * 0.4, w,
  ]);
  gusset.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  gusset.setIndex([
    0, 1, 2,
    3, 5, 4,
    0, 2, 5, 0, 5, 3,
    0, 3, 4, 0, 4, 1,
    1, 4, 5, 1, 5, 2,
  ]);
  gusset.computeVertexNormals();
  g = csg(g, new THREE.Matrix4(), gusset, new THREE.Matrix4(), 'union');
  return g;
}

function shelfBracket(p: Record<string, number>): THREE.BufferGeometry {
  const length = p.length;
  const wall = p.thickness;
  const w = p.width;
  const h = p.height;
  const horiz = new THREE.BoxGeometry(length, wall, w);
  const vert = new THREE.BoxGeometry(wall, h, w);
  const m1 = new THREE.Matrix4().makeTranslation(0, wall / 2, 0);
  const m2 = new THREE.Matrix4().makeTranslation(-length / 2 + wall / 2, h / 2, 0);
  return csg(horiz, m1, vert, m2, 'union');
}

function cornerBracket(p: Record<string, number>): THREE.BufferGeometry {
  const len = p.length;
  const wall = p.thickness;
  const a = new THREE.BoxGeometry(len, wall, len);
  const b = new THREE.BoxGeometry(wall, len, len);
  const c = new THREE.BoxGeometry(len, len, wall);
  let g = csg(a, new THREE.Matrix4().makeTranslation(0, wall / 2, 0), b, new THREE.Matrix4().makeTranslation(-len / 2 + wall / 2, len / 2, 0), 'union');
  g = csg(g, new THREE.Matrix4(), c, new THREE.Matrix4().makeTranslation(0, len / 2, -len / 2 + wall / 2), 'union');
  return g;
}

/* ---------------- Springs ---------------- */

function extensionSpring(p: Record<string, number>): THREE.BufferGeometry {
  // Same as compression but with closed end loops — visually similar.
  return helicalSpring(p);
}

function conicalSpring(p: Record<string, number>): THREE.BufferGeometry {
  const D1 = p.diameter1;
  const D2 = p.diameter2;
  const wireD = p.wire_diameter;
  const length = p.length;
  const turns = p.turns;
  const N = Math.max(48, Math.floor(turns * 28));
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = D1 / 2 + (D2 - D1) / 2 * t;
    const angle = t * turns * 2 * Math.PI;
    pts.push(new THREE.Vector3(r * Math.cos(angle), t * length - length / 2, r * Math.sin(angle)));
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  return new THREE.TubeGeometry(curve, N * 2, wireD / 2, 12, false);
}

function torsionSpring(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const wireD = p.wire_diameter;
  const length = p.length;
  const turns = p.turns;
  const N = Math.max(48, Math.floor(turns * 28));
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const angle = t * turns * 2 * Math.PI;
    pts.push(new THREE.Vector3((D / 2) * Math.cos(angle), t * length - length / 2, (D / 2) * Math.sin(angle)));
  }
  // Add two straight legs
  const legL = D * 0.8;
  pts.push(new THREE.Vector3((D / 2) + legL, length / 2, 0));
  pts.unshift(new THREE.Vector3((D / 2) + legL, -length / 2, 0));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
  return new THREE.TubeGeometry(curve, N * 2, wireD / 2, 10, false);
}

/* ---------------- Shafts ---------------- */

function splinedShaft(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const L = p.length;
  const teeth = Math.max(6, Math.floor(p.splines));
  let g: THREE.BufferGeometry = new THREE.CylinderGeometry(D / 2, D / 2, L, teeth * 2);
  // Add raised splines
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const slot = new THREE.BoxGeometry(D * 0.06, L * 0.95, D * 0.06);
    const m = new THREE.Matrix4()
      .makeTranslation(Math.cos(a) * D * 0.5, 0, Math.sin(a) * D * 0.5);
    g = csg(g, new THREE.Matrix4(), slot, m, 'union');
  }
  return g;
}

function threadedShaft(p: Record<string, number>): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(p.diameter / 2, p.diameter / 2, p.length, 24);
}

function hollowShaft(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const L = p.length;
  const w = p.wall;
  const outer = new THREE.CylinderGeometry(D / 2, D / 2, L, 32);
  const inner = new THREE.CylinderGeometry(D / 2 - w, D / 2 - w, L * 1.05, 32);
  return csg(outer, new THREE.Matrix4(), inner, new THREE.Matrix4(), 'subtract');
}

function shoulderBolt(p: Record<string, number>): THREE.BufferGeometry {
  const Dh = p.head_diameter;
  const D1 = p.diameter1;
  const D2 = p.diameter2;
  const L1 = p.length1;
  const L2 = p.length2;
  const headH = Dh * 0.6;
  const head = new THREE.CylinderGeometry(Dh / 2, Dh / 2, headH, 24);
  const shoulder = new THREE.CylinderGeometry(D1 / 2, D1 / 2, L1, 24);
  const thread = new THREE.CylinderGeometry(D2 / 2, D2 / 2, L2, 24);
  let g = csg(
    head, new THREE.Matrix4().makeTranslation(0, headH / 2, 0),
    shoulder, new THREE.Matrix4().makeTranslation(0, -L1 / 2, 0),
    'union',
  );
  g = csg(g, new THREE.Matrix4(), thread, new THREE.Matrix4().makeTranslation(0, -L1 - L2 / 2, 0), 'union');
  return g;
}

/* ---------------- Pulleys & Belts ---------------- */

function vBeltPulley(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const w = p.width;
  const bore = p.bore;
  const body = new THREE.CylinderGeometry(D / 2, D / 2, w, 48);
  // V-groove via subtracting a torus with a square cross-section
  const groove = new THREE.TorusGeometry(D / 2, w * 0.3, 8, 48);
  groove.rotateX(Math.PI / 2);
  const boreCyl = new THREE.CylinderGeometry(bore / 2, bore / 2, w * 1.1, 32);
  let g = csg(body, new THREE.Matrix4(), groove, new THREE.Matrix4(), 'subtract');
  g = csg(g, new THREE.Matrix4(), boreCyl, new THREE.Matrix4(), 'subtract');
  return g;
}

function timingPulley(p: Record<string, number>): THREE.BufferGeometry {
  const teeth = Math.round(p.teeth);
  const r = (p.module * teeth) / 2;
  const w = p.width;
  const bore = p.bore;
  let g: THREE.BufferGeometry = new THREE.CylinderGeometry(r, r, w, teeth * 2);
  // Add evenly-spaced groove indents
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const cut = new THREE.BoxGeometry(p.module * 0.55, w * 1.05, p.module * 0.45);
    cut.rotateY(a);
    const m = new THREE.Matrix4()
      .makeTranslation(Math.cos(a) * r, 0, Math.sin(a) * r);
    g = csg(g, new THREE.Matrix4(), cut, m, 'subtract');
  }
  const boreCyl = new THREE.CylinderGeometry(bore / 2, bore / 2, w * 1.1, 32);
  g = csg(g, new THREE.Matrix4(), boreCyl, new THREE.Matrix4(), 'subtract');
  return g;
}

function flatPulley(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const w = p.width;
  const bore = p.bore;
  const body = new THREE.CylinderGeometry(D / 2, D / 2, w, 48);
  const boreCyl = new THREE.CylinderGeometry(bore / 2, bore / 2, w * 1.05, 32);
  return csg(body, new THREE.Matrix4(), boreCyl, new THREE.Matrix4(), 'subtract');
}

function idlerPulley(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const w = p.width;
  const bore = p.bore;
  const body = new THREE.CylinderGeometry(D / 2, D / 2, w, 48);
  const flange = new THREE.CylinderGeometry(D * 0.55, D * 0.55, w * 0.18, 48);
  let g = csg(body, new THREE.Matrix4(), flange, new THREE.Matrix4().makeTranslation(0, w / 2 - w * 0.1, 0), 'union');
  g = csg(g, new THREE.Matrix4(), flange, new THREE.Matrix4().makeTranslation(0, -w / 2 + w * 0.1, 0), 'union');
  const boreCyl = new THREE.CylinderGeometry(bore / 2, bore / 2, w * 1.4, 32);
  return csg(g, new THREE.Matrix4(), boreCyl, new THREE.Matrix4(), 'subtract');
}

/* ---------------- Couplings & Hubs ---------------- */

function rigidCoupling(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const len = p.length;
  const bore = p.bore;
  const body = new THREE.CylinderGeometry(D / 2, D / 2, len, 32);
  const boreCyl = new THREE.CylinderGeometry(bore / 2, bore / 2, len * 1.05, 32);
  return csg(body, new THREE.Matrix4(), boreCyl, new THREE.Matrix4(), 'subtract');
}

function flexibleCoupling(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const len = p.length;
  const bore = p.bore;
  // Hub-spring-hub cross-section
  const hub1 = new THREE.CylinderGeometry(D / 2, D / 2, len * 0.4, 24);
  const spring = new THREE.CylinderGeometry(D * 0.42, D * 0.42, len * 0.3, 24);
  const hub2 = new THREE.CylinderGeometry(D / 2, D / 2, len * 0.4, 24);
  let g = csg(
    hub1, new THREE.Matrix4().makeTranslation(0, -len * 0.3, 0),
    spring, new THREE.Matrix4(),
    'union',
  );
  g = csg(g, new THREE.Matrix4(), hub2, new THREE.Matrix4().makeTranslation(0, len * 0.3, 0), 'union');
  const boreCyl = new THREE.CylinderGeometry(bore / 2, bore / 2, len * 1.05, 32);
  return csg(g, new THREE.Matrix4(), boreCyl, new THREE.Matrix4(), 'subtract');
}

function shaftCollar(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const w = p.width;
  const bore = p.bore;
  const body = new THREE.CylinderGeometry(D / 2, D / 2, w, 32);
  const boreCyl = new THREE.CylinderGeometry(bore / 2, bore / 2, w * 1.1, 32);
  let g = csg(body, new THREE.Matrix4(), boreCyl, new THREE.Matrix4(), 'subtract');
  // Set screw hole in the side
  const screw = new THREE.CylinderGeometry(bore * 0.18, bore * 0.18, D, 16);
  screw.rotateX(Math.PI / 2);
  g = csg(g, new THREE.Matrix4(), screw, new THREE.Matrix4().makeTranslation(0, 0, 0), 'subtract');
  return g;
}

function key(p: Record<string, number>): THREE.BufferGeometry {
  return new THREE.BoxGeometry(p.length, p.height, p.width);
}

function keyHub(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const w = p.width;
  const bore = p.bore;
  const body = new THREE.CylinderGeometry(D / 2, D / 2, w, 32);
  const boreCyl = new THREE.CylinderGeometry(bore / 2, bore / 2, w * 1.1, 32);
  let g = csg(body, new THREE.Matrix4(), boreCyl, new THREE.Matrix4(), 'subtract');
  // Keyway
  const slot = new THREE.BoxGeometry(bore * 0.3, w * 1.1, bore * 0.18);
  g = csg(g, new THREE.Matrix4(), slot, new THREE.Matrix4().makeTranslation(0, 0, bore / 2), 'subtract');
  return g;
}

/* ---------------- Profiles ---------------- */

function tSlot2020(p: Record<string, number>): THREE.BufferGeometry {
  const len = p.length;
  const profile = new THREE.BoxGeometry(2, len, 2);
  // Subtract a center hole
  const bore = new THREE.CylinderGeometry(0.42, 0.42, len * 1.1, 24);
  return csg(profile, new THREE.Matrix4(), bore, new THREE.Matrix4(), 'subtract');
}

function tSlot4040(p: Record<string, number>): THREE.BufferGeometry {
  const len = p.length;
  const profile = new THREE.BoxGeometry(4, len, 4);
  const bore = new THREE.CylinderGeometry(0.85, 0.85, len * 1.1, 24);
  return csg(profile, new THREE.Matrix4(), bore, new THREE.Matrix4(), 'subtract');
}

function squareTube(p: Record<string, number>): THREE.BufferGeometry {
  const len = p.length;
  const w = p.width;
  const wall = p.wall;
  const outer = new THREE.BoxGeometry(w, len, w);
  const inner = new THREE.BoxGeometry(w - 2 * wall, len * 1.1, w - 2 * wall);
  return csg(outer, new THREE.Matrix4(), inner, new THREE.Matrix4(), 'subtract');
}

function roundTube(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const len = p.length;
  const wall = p.wall;
  const outer = new THREE.CylinderGeometry(D / 2, D / 2, len, 32);
  const inner = new THREE.CylinderGeometry(D / 2 - wall, D / 2 - wall, len * 1.05, 32);
  return csg(outer, new THREE.Matrix4(), inner, new THREE.Matrix4(), 'subtract');
}

function uChannel(p: Record<string, number>): THREE.BufferGeometry {
  const len = p.length;
  const w = p.width;
  const h = p.height;
  const wall = p.wall;
  const outer = new THREE.BoxGeometry(w, h, len);
  const cut = new THREE.BoxGeometry(w - 2 * wall, h, len * 1.1);
  return csg(outer, new THREE.Matrix4(), cut, new THREE.Matrix4().makeTranslation(0, wall, 0), 'subtract');
}

function iBeam(p: Record<string, number>): THREE.BufferGeometry {
  const len = p.length;
  const flange = p.flange;
  const web = p.web;
  const h = p.height;
  const top = new THREE.BoxGeometry(flange, web, len);
  const bot = new THREE.BoxGeometry(flange, web, len);
  const center = new THREE.BoxGeometry(web, h, len);
  let g = csg(
    top, new THREE.Matrix4().makeTranslation(0, h / 2 - web / 2, 0),
    center, new THREE.Matrix4(),
    'union',
  );
  g = csg(g, new THREE.Matrix4(), bot, new THREE.Matrix4().makeTranslation(0, -h / 2 + web / 2, 0), 'union');
  return g;
}

function angleIron(p: Record<string, number>): THREE.BufferGeometry {
  const len = p.length;
  const w = p.width;
  const wall = p.wall;
  const a = new THREE.BoxGeometry(w, wall, len);
  const b = new THREE.BoxGeometry(wall, w, len);
  return csg(
    a, new THREE.Matrix4().makeTranslation(0, wall / 2, 0),
    b, new THREE.Matrix4().makeTranslation(-w / 2 + wall / 2, w / 2, 0),
    'union',
  );
}

/* ---------------- Wheels ---------------- */

/** Build a wheel whose axis is the world X axis. Returns:
 *  - a black tire profile (outer toroidal band with a tread groove)
 *  - a metallic hub disc with spoke cut-outs
 *  - a central bore for the axle  */
function buildRoadWheel(D: number, w: number, bore: number, spokes: number): THREE.BufferGeometry {
  const tireR = D / 2;
  const rimR = D * 0.36;
  const hubR = D * 0.18;

  // Tire: extruded ring with a slight crown — make it from a Lathe so the
  // sidewall has a real profile.
  const tirePts: THREE.Vector2[] = [];
  const halfW = w / 2;
  // start at inner radius bottom, walk outwards to outer crown then back.
  tirePts.push(new THREE.Vector2(rimR, -halfW));
  tirePts.push(new THREE.Vector2(rimR + D * 0.02, -halfW));
  tirePts.push(new THREE.Vector2(tireR * 0.985, -halfW * 0.7));
  tirePts.push(new THREE.Vector2(tireR, -halfW * 0.35));
  tirePts.push(new THREE.Vector2(tireR, halfW * 0.35));
  tirePts.push(new THREE.Vector2(tireR * 0.985, halfW * 0.7));
  tirePts.push(new THREE.Vector2(rimR + D * 0.02, halfW));
  tirePts.push(new THREE.Vector2(rimR, halfW));
  const tire = new THREE.LatheGeometry(tirePts, 64);
  // Tread blocks — small box bumps around the outer crown
  const treadParts: THREE.BufferGeometry[] = [];
  const N = 28;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const tb = new THREE.BoxGeometry(D * 0.05, w * 0.7, D * 0.025);
    tb.translate(0, 0, tireR + D * 0.01);
    tb.rotateY(a);
    treadParts.push(tb);
  }

  // Rim — narrow ring at rimR
  const rim = new THREE.CylinderGeometry(rimR, rimR, w * 0.6, 48);
  const rimInner = new THREE.CylinderGeometry(rimR * 0.92, rimR * 0.92, w * 0.7, 48);
  const rimShell = csg(rim, new THREE.Matrix4(), rimInner, new THREE.Matrix4(), 'subtract');

  // Hub disc with spoke holes
  let hubDisc: THREE.BufferGeometry = new THREE.CylinderGeometry(rimR * 0.98, rimR * 0.98, w * 0.18, 48);
  // Cut spoke windows
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const win = new THREE.BoxGeometry(rimR * 0.55, w * 0.4, D * 0.07);
    win.translate(rimR * 0.55, 0, 0);
    win.rotateY(a);
    hubDisc = csg(hubDisc, new THREE.Matrix4(), win, new THREE.Matrix4(), 'subtract');
  }
  // Central hub
  const centerHub = new THREE.CylinderGeometry(hubR, hubR, w * 0.55, 32);
  hubDisc = csg(hubDisc, new THREE.Matrix4(), centerHub, new THREE.Matrix4(), 'union');

  // Bore through everything
  const boreCyl = new THREE.CylinderGeometry(bore / 2, bore / 2, w * 1.5, 24);
  const tireBored = csg(tire, new THREE.Matrix4(), boreCyl, new THREE.Matrix4(), 'subtract');
  const hubBored = csg(hubDisc, new THREE.Matrix4(), boreCyl, new THREE.Matrix4(), 'subtract');
  const rimBored = csg(rimShell, new THREE.Matrix4(), boreCyl, new THREE.Matrix4(), 'subtract');

  // Lay axis along X (so positive X = wheel face direction)
  const out = mergeMany([tireBored, hubBored, rimBored, ...treadParts]);
  out.rotateZ(Math.PI / 2);
  return out;
}

function casterWheel(p: Record<string, number>): THREE.BufferGeometry {
  // Smaller wheel with no spokes — just a solid hub.
  const D = p.diameter;
  const w = p.width;
  const bore = p.bore;
  return buildRoadWheel(D, w, bore, 3);
}

function plainWheel(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const w = p.width;
  const bore = p.bore;
  const spokes = Math.max(4, Math.round(p.spokes ?? 6));
  return buildRoadWheel(D, w, bore, spokes);
}

/** Roller-wheel: rollers oriented so their axes are TANGENT to the wheel rim
 *  (perpendicular to the spoke radius). This is what makes an omni wheel
 *  actually slide laterally. */
function omniWheel(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const w = p.width;
  const bore = p.bore;
  const N = Math.max(8, Math.round(p.rollers ?? 12));
  const rollerR = D * 0.075;
  const ringR = D / 2 - rollerR * 1.05;
  // Wheel-axis is X (we'll rotate at the end). Spokes lie in the Y/Z plane.
  // Central hub
  const hub = new THREE.CylinderGeometry(ringR * 0.55, ringR * 0.55, w * 0.95, 32);
  // Two annular side plates that retain the rollers
  const sideR = D / 2 * 0.96;
  const side = new THREE.CylinderGeometry(sideR, sideR, w * 0.08, 48);
  const sideBoreCut = new THREE.CylinderGeometry(ringR * 0.8, ringR * 0.8, w * 0.2, 48);
  const sideCut = csg(side, new THREE.Matrix4(), sideBoreCut, new THREE.Matrix4(), 'subtract');
  const sideA = transformed(sideCut, new THREE.Matrix4().makeTranslation(0, w * 0.46, 0));
  const sideB = transformed(sideCut, new THREE.Matrix4().makeTranslation(0, -w * 0.46, 0));
  // Spokes between hub and the side rings
  const spokes: THREE.BufferGeometry[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const sp = new THREE.BoxGeometry(ringR * 0.92, w * 0.85, D * 0.04);
    sp.translate(ringR * 0.46, 0, 0);
    sp.rotateY(a);
    spokes.push(sp);
  }
  // Rollers — barrel-shaped (slightly tapered) and oriented so their length
  // runs TANGENT to the rim circle (perpendicular to both the radial spoke
  // and the wheel's central axis). After the final rotateZ at the bottom of
  // this function, the wheel axis is +X.
  const rollers: THREE.BufferGeometry[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const barrelPts: THREE.Vector2[] = [];
    const halfRL = ringR * Math.PI / N * 0.98;
    const segs = 10;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const y = (t - 0.5) * 2 * halfRL;
      const rad = rollerR * (1 - 0.6 * (t * 2 - 1) * (t * 2 - 1));
      barrelPts.push(new THREE.Vector2(Math.max(rad, 0.001), y));
    }
    const roller = new THREE.LatheGeometry(barrelPts, 14);
    // Lathe → axis Y. Wheel axis is also Y here (pre-final rotateZ at the
    // bottom). Rotate axis Y→Z so the roller lies along the rim's tangent,
    // translate out to the rim radius, then orbit around Y to angle a.
    roller.rotateX(Math.PI / 2);
    roller.translate(ringR, 0, 0);
    roller.rotateY(a);
    rollers.push(roller);
  }
  // Bore through wheel axis
  const boreCyl = new THREE.CylinderGeometry(bore / 2, bore / 2, w * 1.5, 24);
  let body = mergeMany([hub, sideA, sideB, ...spokes]);
  body = csg(body, new THREE.Matrix4(), boreCyl, new THREE.Matrix4(), 'subtract');
  const merged = mergeMany([body, ...rollers]);
  merged.rotateZ(Math.PI / 2); // wheel axis along world X
  return merged;
}

/** Mecanum wheel: rollers offset at ±45° helix angle (a + or − chirality
 *  depending on which corner of the robot). We pick + here. */
function mecanumWheel(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const w = p.width;
  const bore = p.bore;
  const N = Math.max(8, Math.round(p.rollers ?? 12));
  const rollerR = D * 0.085;
  const ringR = D / 2 - rollerR * 1.0;
  const helixAngle = Math.PI / 4; // 45°

  // Hub + side plates same as omni
  const hub = new THREE.CylinderGeometry(ringR * 0.55, ringR * 0.55, w * 0.95, 32);
  const sideR = D / 2 * 0.95;
  const sideRing = new THREE.CylinderGeometry(sideR, sideR, w * 0.08, 48);
  const sideCutDisc = new THREE.CylinderGeometry(ringR * 0.78, ringR * 0.78, w * 0.2, 48);
  const sidePlate = csg(sideRing, new THREE.Matrix4(), sideCutDisc, new THREE.Matrix4(), 'subtract');
  const sideA = transformed(sidePlate, new THREE.Matrix4().makeTranslation(0, w * 0.46, 0));
  const sideB = transformed(sidePlate, new THREE.Matrix4().makeTranslation(0, -w * 0.46, 0));

  const rollers: THREE.BufferGeometry[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const barrelPts: THREE.Vector2[] = [];
    const halfRL = ringR * Math.PI / N * 1.05;
    const segs = 10;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const y = (t - 0.5) * 2 * halfRL;
      const rad = rollerR * (1 - 0.55 * (t * 2 - 1) * (t * 2 - 1));
      barrelPts.push(new THREE.Vector2(Math.max(rad, 0.001), y));
    }
    const roller = new THREE.LatheGeometry(barrelPts, 14);
    // Start with axis Y, rotate to Z (tangent), then tilt by helix angle
    // about X so the axis picks up a Y (wheel-axis) component — that 45°
    // tilt is what distinguishes a mecanum roller from an omni roller.
    roller.rotateX(Math.PI / 2);
    roller.rotateX(helixAngle);
    roller.translate(ringR, 0, 0);
    roller.rotateY(a);
    rollers.push(roller);
  }
  const boreCyl = new THREE.CylinderGeometry(bore / 2, bore / 2, w * 1.5, 24);
  let body = mergeMany([hub, sideA, sideB]);
  body = csg(body, new THREE.Matrix4(), boreCyl, new THREE.Matrix4(), 'subtract');
  const merged = mergeMany([body, ...rollers]);
  merged.rotateZ(Math.PI / 2);
  return merged;
}

/* ---------------- Pneumatic / Plumbing ---------------- */

function pipe(p: Record<string, number>): THREE.BufferGeometry {
  return roundTube(p);
}

function elbow(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const wall = p.wall;
  const r = D * 1.2;
  const outer = new THREE.TorusGeometry(r, D / 2, 12, 32, Math.PI / 2);
  const inner = new THREE.TorusGeometry(r, D / 2 - wall, 10, 32, Math.PI / 2);
  return csg(outer, new THREE.Matrix4(), inner, new THREE.Matrix4(), 'subtract');
}

function teeFitting(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const wall = p.wall;
  const len = D * 3;
  const a = new THREE.CylinderGeometry(D / 2, D / 2, len, 24);
  const b = new THREE.CylinderGeometry(D / 2, D / 2, len * 0.6, 24);
  b.rotateZ(Math.PI / 2);
  let g = csg(a, new THREE.Matrix4(), b, new THREE.Matrix4(), 'union');
  // Bore through
  const aBore = new THREE.CylinderGeometry(D / 2 - wall, D / 2 - wall, len * 1.1, 24);
  const bBore = new THREE.CylinderGeometry(D / 2 - wall, D / 2 - wall, len * 1.1, 24);
  bBore.rotateZ(Math.PI / 2);
  g = csg(g, new THREE.Matrix4(), aBore, new THREE.Matrix4(), 'subtract');
  g = csg(g, new THREE.Matrix4(), bBore, new THREE.Matrix4(), 'subtract');
  return g;
}

function flange(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const od = p.od;
  const t = p.thickness;
  const disc = new THREE.CylinderGeometry(od / 2, od / 2, t, 32);
  const bore = new THREE.CylinderGeometry(D / 2, D / 2, t * 1.1, 32);
  let g = csg(disc, new THREE.Matrix4(), bore, new THREE.Matrix4(), 'subtract');
  // Bolt circle holes
  const N = 6;
  const ringR = (od + D) / 4;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const hole = new THREE.CylinderGeometry(D * 0.18, D * 0.18, t * 1.2, 16);
    g = csg(g, new THREE.Matrix4(), hole, new THREE.Matrix4().makeTranslation(Math.cos(a) * ringR, 0, Math.sin(a) * ringR), 'subtract');
  }
  return g;
}

function valveHandle(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const wheel = new THREE.TorusGeometry(D / 2, D * 0.08, 10, 32);
  wheel.rotateX(Math.PI / 2);
  // 4 spokes
  let g: THREE.BufferGeometry = wheel;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const spoke = new THREE.BoxGeometry(D, D * 0.04, D * 0.04);
    spoke.rotateY(a);
    g = csg(g, new THREE.Matrix4(), spoke, new THREE.Matrix4(), 'union');
  }
  const hub = new THREE.CylinderGeometry(D * 0.12, D * 0.12, D * 0.18, 16);
  return csg(g, new THREE.Matrix4(), hub, new THREE.Matrix4(), 'union');
}

/* ---------------- Electronics ---------------- */

function ledModule(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const len = p.length;
  const dome = new THREE.SphereGeometry(D / 2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const body = new THREE.CylinderGeometry(D / 2, D / 2, len, 24);
  return csg(dome, new THREE.Matrix4(), body, new THREE.Matrix4().makeTranslation(0, -len / 2, 0), 'union');
}

function pushButton(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const h = p.height;
  const base = new THREE.CylinderGeometry(D / 2, D / 2, h * 0.6, 32);
  const cap = new THREE.CylinderGeometry(D * 0.42, D * 0.42, h * 0.4, 32);
  return csg(base, new THREE.Matrix4(), cap, new THREE.Matrix4().makeTranslation(0, h * 0.5, 0), 'union');
}

function rotaryEncoder(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const h = p.height;
  const body = new THREE.BoxGeometry(D, h * 0.6, D);
  const shaft = new THREE.CylinderGeometry(D * 0.12, D * 0.12, h * 0.6, 16);
  return csg(body, new THREE.Matrix4(), shaft, new THREE.Matrix4().makeTranslation(0, h * 0.6, 0), 'union');
}

function dcMotor(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const len = p.length;
  const body = new THREE.CylinderGeometry(D / 2, D / 2, len, 24);
  const shaft = new THREE.CylinderGeometry(D * 0.15, D * 0.15, len * 0.3, 16);
  return csg(body, new THREE.Matrix4(), shaft, new THREE.Matrix4().makeTranslation(0, len * 0.6, 0), 'union');
}

function gearbox(p: Record<string, number>): THREE.BufferGeometry {
  const w = p.width;
  const h = p.height;
  const len = p.length;
  return new THREE.BoxGeometry(w, h, len);
}

function speakerCone(p: Record<string, number>): THREE.BufferGeometry {
  const D = p.diameter;
  const h = p.height;
  const cone = new THREE.CylinderGeometry(D / 2, D * 0.2, h, 32);
  const back = new THREE.CylinderGeometry(D * 0.2, D * 0.2, h * 0.3, 16);
  return csg(cone, new THREE.Matrix4(), back, new THREE.Matrix4().makeTranslation(0, -h * 0.5, 0), 'union');
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
  /* ----- More fasteners ----- */
  { id: 'flat-head-screw', name: 'Flat Head Screw', category: 'fasteners', description: 'Countersunk flat head screw.', params: [
    { key: 'diameter', label: 'Diameter', min: 0.2, max: 2, step: 0.05, default: 0.5, unit: 'cm' },
    { key: 'length', label: 'Length', min: 0.5, max: 6, step: 0.1, default: 2.0, unit: 'cm' },
  ], build: flatHeadScrew },
  { id: 'pan-head-screw', name: 'Pan Head Screw', category: 'fasteners', description: 'Pan-shaped rounded screw head.', params: [
    { key: 'diameter', label: 'Diameter', min: 0.2, max: 2, step: 0.05, default: 0.5, unit: 'cm' },
    { key: 'length', label: 'Length', min: 0.5, max: 6, step: 0.1, default: 1.8, unit: 'cm' },
  ], build: panHeadScrew },
  { id: 'button-head-screw', name: 'Button Head Screw', category: 'fasteners', description: 'Low-profile dome head.', params: [
    { key: 'diameter', label: 'Diameter', min: 0.2, max: 2, step: 0.05, default: 0.5, unit: 'cm' },
    { key: 'length', label: 'Length', min: 0.5, max: 6, step: 0.1, default: 1.6, unit: 'cm' },
  ], build: buttonHeadScrew },
  { id: 'set-screw', name: 'Set Screw', category: 'fasteners', description: 'Headless socket set screw.', params: [
    { key: 'diameter', label: 'Diameter', min: 0.2, max: 1.5, step: 0.05, default: 0.5, unit: 'cm' },
    { key: 'length', label: 'Length', min: 0.3, max: 3, step: 0.05, default: 0.8, unit: 'cm' },
  ], build: setScrew },
  { id: 'threaded-rod', name: 'Threaded Rod', category: 'fasteners', description: 'Plain threaded rod.', params: [
    { key: 'diameter', label: 'Diameter', min: 0.3, max: 2, step: 0.05, default: 0.8, unit: 'cm' },
    { key: 'length', label: 'Length', min: 2, max: 30, step: 0.5, default: 10, unit: 'cm' },
  ], build: threadedRod },
  { id: 'eye-bolt', name: 'Eye Bolt', category: 'fasteners', description: 'Bolt with circular eye.', params: [
    { key: 'diameter', label: 'Ø', min: 0.3, max: 1.5, step: 0.05, default: 0.6, unit: 'cm' },
    { key: 'length', label: 'Length', min: 1, max: 6, step: 0.1, default: 3, unit: 'cm' },
  ], build: eyeBolt },
  { id: 'u-bolt', name: 'U-Bolt', category: 'fasteners', description: 'U-shaped bolt for clamping pipes.', params: [
    { key: 'diameter', label: 'Ø', min: 0.3, max: 1.5, step: 0.05, default: 0.6, unit: 'cm' },
    { key: 'width', label: 'Width', min: 1.5, max: 6, step: 0.1, default: 3, unit: 'cm' },
    { key: 'length', label: 'Length', min: 2, max: 8, step: 0.1, default: 5, unit: 'cm' },
  ], build: uBolt },
  { id: 'lock-nut', name: 'Lock Nut (Nyloc)', category: 'fasteners', description: 'Hex nut with nylon insert.', params: [
    { key: 'diameter', label: 'Thread Ø', min: 0.3, max: 2, step: 0.05, default: 0.6, unit: 'cm' },
  ], build: lockNut },
  { id: 'wing-nut', name: 'Wing Nut', category: 'fasteners', description: 'Hand-tightened wing nut.', params: [
    { key: 'diameter', label: 'Thread Ø', min: 0.3, max: 1.5, step: 0.05, default: 0.6, unit: 'cm' },
  ], build: wingNut },
  { id: 'square-nut', name: 'Square Nut', category: 'fasteners', description: '4-sided nut.', params: [
    { key: 'diameter', label: 'Thread Ø', min: 0.3, max: 1.5, step: 0.05, default: 0.6, unit: 'cm' },
  ], build: squareNut },
  { id: 'lock-washer', name: 'Lock Washer', category: 'fasteners', description: 'Split-ring lock washer.', params: [
    { key: 'diameter', label: 'Bore Ø', min: 0.3, max: 1.5, step: 0.05, default: 0.6, unit: 'cm' },
  ], build: lockWasher },
  { id: 'fender-washer', name: 'Fender Washer', category: 'fasteners', description: 'Wide-OD washer.', params: [
    { key: 'diameter', label: 'Bore Ø', min: 0.3, max: 1.5, step: 0.05, default: 0.6, unit: 'cm' },
  ], build: fenderWasher },
  { id: 'rivet', name: 'Rivet', category: 'fasteners', description: 'Solid rivet.', params: [
    { key: 'diameter', label: 'Ø', min: 0.2, max: 1, step: 0.05, default: 0.4, unit: 'cm' },
    { key: 'length', label: 'Length', min: 0.4, max: 3, step: 0.05, default: 1.2, unit: 'cm' },
  ], build: rivet },

  /* ----- More gears ----- */
  { id: 'helical-gear', name: 'Helical Gear', category: 'gears', description: 'Spur gear with helical twist.', params: [
    { key: 'teeth', label: 'Teeth', min: 8, max: 60, step: 1, default: 22 },
    { key: 'module', label: 'Module', min: 0.1, max: 0.6, step: 0.05, default: 0.25, unit: 'cm' },
    { key: 'thickness', label: 'Thickness', min: 0.4, max: 2, step: 0.1, default: 1.0, unit: 'cm' },
    { key: 'helix', label: 'Helix', min: 0, max: 0.6, step: 0.02, default: 0.25, unit: 'rad' },
    { key: 'bore', label: 'Bore', min: 0.2, max: 2, step: 0.05, default: 0.6, unit: 'cm' },
  ], build: helicalGear },
  { id: 'bevel-gear', name: 'Bevel Gear', category: 'gears', description: 'Conical gear approximation.', params: [
    { key: 'teeth', label: 'Teeth', min: 8, max: 40, step: 1, default: 16 },
    { key: 'radius', label: 'Radius', min: 0.6, max: 3, step: 0.1, default: 1.2, unit: 'cm' },
    { key: 'thickness', label: 'Thickness', min: 0.3, max: 2, step: 0.1, default: 0.7, unit: 'cm' },
  ], build: bevelGear },
  { id: 'gear-rack', name: 'Gear Rack', category: 'gears', description: 'Linear gear rack.', params: [
    { key: 'length', label: 'Length', min: 3, max: 12, step: 0.5, default: 6, unit: 'cm' },
    { key: 'teeth', label: 'Teeth', min: 6, max: 30, step: 1, default: 14 },
    { key: 'module', label: 'Module', min: 0.15, max: 0.6, step: 0.05, default: 0.3, unit: 'cm' },
    { key: 'width', label: 'Width', min: 0.4, max: 2, step: 0.1, default: 0.8, unit: 'cm' },
  ], build: gearRack },
  { id: 'worm-gear', name: 'Worm Gear', category: 'gears', description: 'Worm screw shaft.', params: [
    { key: 'diameter', label: 'Ø', min: 0.6, max: 2, step: 0.05, default: 1.0, unit: 'cm' },
    { key: 'toothH', label: 'Thread', min: 0.05, max: 0.3, step: 0.02, default: 0.12, unit: 'cm' },
    { key: 'length', label: 'Length', min: 1.5, max: 6, step: 0.2, default: 3, unit: 'cm' },
    { key: 'turns', label: 'Turns', min: 4, max: 20, step: 1, default: 10 },
  ], build: wormGear },

  /* ----- More bearings ----- */
  { id: 'thrust-bearing', name: 'Thrust Bearing', category: 'bearings', description: 'Axial-load thrust bearing.', params: [
    { key: 'id_', label: 'Bore', min: 0.5, max: 3, step: 0.1, default: 1.2, unit: 'cm' },
    { key: 'od', label: 'OD', min: 1.5, max: 5, step: 0.1, default: 2.8, unit: 'cm' },
    { key: 'thickness', label: 'Thk', min: 0.3, max: 1.2, step: 0.05, default: 0.7, unit: 'cm' },
  ], build: thrustBearing },
  { id: 'needle-bearing', name: 'Needle Bearing', category: 'bearings', description: 'Cylindrical-roller needle bearing.', params: [
    { key: 'id_', label: 'Bore', min: 0.6, max: 3, step: 0.1, default: 1.2, unit: 'cm' },
    { key: 'od', label: 'OD', min: 1.2, max: 4, step: 0.1, default: 2.0, unit: 'cm' },
    { key: 'width', label: 'W', min: 0.4, max: 1.5, step: 0.05, default: 0.8, unit: 'cm' },
  ], build: needleBearing },
  { id: 'pillow-block', name: 'Pillow Block Bearing', category: 'bearings', description: 'Mounted bearing block.', params: [
    { key: 'bore', label: 'Bore', min: 0.6, max: 2.5, step: 0.05, default: 1.2, unit: 'cm' },
  ], build: pillowBlock },
  { id: 'bushing', name: 'Sleeve Bushing', category: 'bearings', description: 'Plain sleeve bushing.', params: [
    { key: 'id_', label: 'ID', min: 0.4, max: 3, step: 0.05, default: 1.0, unit: 'cm' },
    { key: 'od', label: 'OD', min: 0.8, max: 4, step: 0.05, default: 1.4, unit: 'cm' },
    { key: 'length', label: 'Length', min: 0.5, max: 4, step: 0.1, default: 1.5, unit: 'cm' },
  ], build: bushing },
  { id: 'linear-bearing', name: 'Linear Bearing', category: 'bearings', description: 'Sliding linear bearing.', params: [
    { key: 'bore', label: 'Bore', min: 0.5, max: 2, step: 0.05, default: 1.0, unit: 'cm' },
    { key: 'length', label: 'Length', min: 1.5, max: 6, step: 0.1, default: 3, unit: 'cm' },
  ], build: linearBearing },

  /* ----- More brackets ----- */
  { id: 'angle-bracket', name: 'Angle Bracket (with gusset)', category: 'brackets', description: 'L-bracket with reinforcing gusset.', params: [
    { key: 'length', label: 'Length', min: 1.5, max: 6, step: 0.2, default: 3, unit: 'cm' },
    { key: 'width', label: 'Width', min: 1, max: 4, step: 0.1, default: 2, unit: 'cm' },
    { key: 'thickness', label: 'Wall', min: 0.1, max: 0.5, step: 0.05, default: 0.2, unit: 'cm' },
  ], build: angleBracket },
  { id: 'shelf-bracket', name: 'Shelf Bracket', category: 'brackets', description: 'Tall shelf support.', params: [
    { key: 'length', label: 'Depth', min: 2, max: 10, step: 0.5, default: 5, unit: 'cm' },
    { key: 'height', label: 'Height', min: 2, max: 10, step: 0.5, default: 5, unit: 'cm' },
    { key: 'width', label: 'Width', min: 1, max: 4, step: 0.1, default: 2, unit: 'cm' },
    { key: 'thickness', label: 'Wall', min: 0.1, max: 0.5, step: 0.05, default: 0.2, unit: 'cm' },
  ], build: shelfBracket },
  { id: 'corner-bracket', name: '3D Corner Bracket', category: 'brackets', description: '3-axis corner reinforcement.', params: [
    { key: 'length', label: 'Length', min: 1.5, max: 5, step: 0.2, default: 2.5, unit: 'cm' },
    { key: 'thickness', label: 'Wall', min: 0.1, max: 0.5, step: 0.05, default: 0.2, unit: 'cm' },
  ], build: cornerBracket },

  /* ----- More springs ----- */
  { id: 'extension-spring', name: 'Extension Spring', category: 'springs', description: 'Tension coil spring.', params: [
    { key: 'diameter', label: 'Coil Ø', min: 0.5, max: 3, step: 0.1, default: 1.5, unit: 'cm' },
    { key: 'wire_diameter', label: 'Wire Ø', min: 0.05, max: 0.4, step: 0.01, default: 0.15, unit: 'cm' },
    { key: 'length', label: 'Length', min: 1, max: 8, step: 0.2, default: 4, unit: 'cm' },
    { key: 'turns', label: 'Turns', min: 4, max: 24, step: 1, default: 12 },
  ], build: extensionSpring },
  { id: 'conical-spring', name: 'Conical Spring', category: 'springs', description: 'Tapered diameter spring.', params: [
    { key: 'diameter1', label: 'Ø top', min: 0.4, max: 3, step: 0.1, default: 0.8, unit: 'cm' },
    { key: 'diameter2', label: 'Ø bot', min: 0.6, max: 4, step: 0.1, default: 1.8, unit: 'cm' },
    { key: 'wire_diameter', label: 'Wire Ø', min: 0.05, max: 0.3, step: 0.01, default: 0.15, unit: 'cm' },
    { key: 'length', label: 'Length', min: 1, max: 6, step: 0.2, default: 3, unit: 'cm' },
    { key: 'turns', label: 'Turns', min: 4, max: 16, step: 1, default: 8 },
  ], build: conicalSpring },
  { id: 'torsion-spring', name: 'Torsion Spring', category: 'springs', description: 'Spring with two straight legs.', params: [
    { key: 'diameter', label: 'Ø', min: 0.6, max: 3, step: 0.1, default: 1.4, unit: 'cm' },
    { key: 'wire_diameter', label: 'Wire Ø', min: 0.05, max: 0.3, step: 0.01, default: 0.15, unit: 'cm' },
    { key: 'length', label: 'Length', min: 1, max: 5, step: 0.2, default: 2.5, unit: 'cm' },
    { key: 'turns', label: 'Turns', min: 3, max: 14, step: 1, default: 6 },
  ], build: torsionSpring },

  /* ----- More shafts ----- */
  { id: 'splined-shaft', name: 'Splined Shaft', category: 'shafts', description: 'Shaft with axial splines.', params: [
    { key: 'diameter', label: 'Ø', min: 0.6, max: 3, step: 0.05, default: 1.2, unit: 'cm' },
    { key: 'length', label: 'Length', min: 2, max: 10, step: 0.2, default: 5, unit: 'cm' },
    { key: 'splines', label: 'Splines', min: 4, max: 16, step: 1, default: 8 },
  ], build: splinedShaft },
  { id: 'threaded-shaft', name: 'Threaded Shaft', category: 'shafts', description: 'Plain shaft (placeholder for threads).', params: [
    { key: 'diameter', label: 'Ø', min: 0.4, max: 2.5, step: 0.05, default: 1.0, unit: 'cm' },
    { key: 'length', label: 'Length', min: 1.5, max: 8, step: 0.2, default: 4, unit: 'cm' },
  ], build: threadedShaft },
  { id: 'hollow-shaft', name: 'Hollow Shaft', category: 'shafts', description: 'Tube-style hollow shaft.', params: [
    { key: 'diameter', label: 'Ø', min: 0.6, max: 3, step: 0.05, default: 1.4, unit: 'cm' },
    { key: 'wall', label: 'Wall', min: 0.1, max: 0.5, step: 0.02, default: 0.2, unit: 'cm' },
    { key: 'length', label: 'Length', min: 1.5, max: 10, step: 0.2, default: 5, unit: 'cm' },
  ], build: hollowShaft },
  { id: 'shoulder-bolt', name: 'Shoulder Bolt', category: 'shafts', description: 'Stepped bolt with thread tail.', params: [
    { key: 'head_diameter', label: 'Head Ø', min: 0.6, max: 2, step: 0.05, default: 1.0, unit: 'cm' },
    { key: 'diameter1', label: 'Shoulder Ø', min: 0.4, max: 1.5, step: 0.05, default: 0.7, unit: 'cm' },
    { key: 'length1', label: 'Shoulder L', min: 0.5, max: 3, step: 0.1, default: 1.5, unit: 'cm' },
    { key: 'diameter2', label: 'Thread Ø', min: 0.3, max: 1.2, step: 0.05, default: 0.5, unit: 'cm' },
    { key: 'length2', label: 'Thread L', min: 0.4, max: 2.5, step: 0.05, default: 1.0, unit: 'cm' },
  ], build: shoulderBolt },

  /* ----- Pulleys & Belts ----- */
  { id: 'v-pulley', name: 'V-Belt Pulley', category: 'pulleys', description: 'V-grooved belt pulley.', params: [
    { key: 'diameter', label: 'Ø', min: 1.5, max: 6, step: 0.1, default: 3, unit: 'cm' },
    { key: 'width', label: 'Width', min: 0.4, max: 1.5, step: 0.05, default: 0.8, unit: 'cm' },
    { key: 'bore', label: 'Bore', min: 0.3, max: 1.5, step: 0.05, default: 0.6, unit: 'cm' },
  ], build: vBeltPulley },
  { id: 'timing-pulley', name: 'Timing Pulley', category: 'pulleys', description: 'Toothed pulley for timing belts.', params: [
    { key: 'teeth', label: 'Teeth', min: 12, max: 60, step: 1, default: 20 },
    { key: 'module', label: 'Module', min: 0.1, max: 0.4, step: 0.02, default: 0.2, unit: 'cm' },
    { key: 'width', label: 'Width', min: 0.3, max: 1.2, step: 0.05, default: 0.6, unit: 'cm' },
    { key: 'bore', label: 'Bore', min: 0.3, max: 1.5, step: 0.05, default: 0.5, unit: 'cm' },
  ], build: timingPulley },
  { id: 'flat-pulley', name: 'Flat Pulley', category: 'pulleys', description: 'Smooth flat-rim pulley.', params: [
    { key: 'diameter', label: 'Ø', min: 1.5, max: 6, step: 0.1, default: 3, unit: 'cm' },
    { key: 'width', label: 'Width', min: 0.4, max: 2, step: 0.05, default: 1, unit: 'cm' },
    { key: 'bore', label: 'Bore', min: 0.3, max: 1.5, step: 0.05, default: 0.6, unit: 'cm' },
  ], build: flatPulley },
  { id: 'idler-pulley', name: 'Idler Pulley', category: 'pulleys', description: 'Flanged idler.', params: [
    { key: 'diameter', label: 'Ø', min: 1.5, max: 5, step: 0.1, default: 2.6, unit: 'cm' },
    { key: 'width', label: 'Width', min: 0.4, max: 1.5, step: 0.05, default: 0.8, unit: 'cm' },
    { key: 'bore', label: 'Bore', min: 0.3, max: 1.5, step: 0.05, default: 0.6, unit: 'cm' },
  ], build: idlerPulley },

  /* ----- Couplings & Hubs ----- */
  { id: 'rigid-coupling', name: 'Rigid Coupling', category: 'couplings', description: 'Solid sleeve coupling.', params: [
    { key: 'diameter', label: 'Ø', min: 1, max: 4, step: 0.05, default: 2, unit: 'cm' },
    { key: 'length', label: 'Length', min: 1.5, max: 6, step: 0.1, default: 3, unit: 'cm' },
    { key: 'bore', label: 'Bore', min: 0.4, max: 2, step: 0.05, default: 1, unit: 'cm' },
  ], build: rigidCoupling },
  { id: 'flexible-coupling', name: 'Flexible Coupling', category: 'couplings', description: 'Spider-style flexible coupling.', params: [
    { key: 'diameter', label: 'Ø', min: 1, max: 4, step: 0.05, default: 2, unit: 'cm' },
    { key: 'length', label: 'Length', min: 1.5, max: 6, step: 0.1, default: 3, unit: 'cm' },
    { key: 'bore', label: 'Bore', min: 0.4, max: 2, step: 0.05, default: 0.8, unit: 'cm' },
  ], build: flexibleCoupling },
  { id: 'shaft-collar', name: 'Shaft Collar', category: 'couplings', description: 'Set-screw shaft collar.', params: [
    { key: 'diameter', label: 'Ø', min: 1, max: 4, step: 0.05, default: 1.8, unit: 'cm' },
    { key: 'width', label: 'Width', min: 0.4, max: 1.5, step: 0.05, default: 0.7, unit: 'cm' },
    { key: 'bore', label: 'Bore', min: 0.4, max: 2, step: 0.05, default: 0.8, unit: 'cm' },
  ], build: shaftCollar },
  { id: 'machine-key', name: 'Machine Key', category: 'couplings', description: 'Rectangular key.', params: [
    { key: 'length', label: 'Length', min: 0.5, max: 3, step: 0.05, default: 1.5, unit: 'cm' },
    { key: 'width', label: 'Width', min: 0.1, max: 0.6, step: 0.02, default: 0.2, unit: 'cm' },
    { key: 'height', label: 'Height', min: 0.1, max: 0.6, step: 0.02, default: 0.2, unit: 'cm' },
  ], build: key },
  { id: 'key-hub', name: 'Keyway Hub', category: 'couplings', description: 'Hub with keyway slot.', params: [
    { key: 'diameter', label: 'Ø', min: 1, max: 4, step: 0.05, default: 2, unit: 'cm' },
    { key: 'width', label: 'Width', min: 0.4, max: 2, step: 0.05, default: 1, unit: 'cm' },
    { key: 'bore', label: 'Bore', min: 0.4, max: 2, step: 0.05, default: 0.8, unit: 'cm' },
  ], build: keyHub },

  /* ----- Profiles ----- */
  { id: 't-slot-2020', name: 'T-Slot 20×20', category: 'profiles', description: 'Aluminum extrusion 2 cm.', params: [
    { key: 'length', label: 'Length', min: 4, max: 60, step: 1, default: 20, unit: 'cm' },
  ], build: tSlot2020 },
  { id: 't-slot-4040', name: 'T-Slot 40×40', category: 'profiles', description: 'Aluminum extrusion 4 cm.', params: [
    { key: 'length', label: 'Length', min: 4, max: 60, step: 1, default: 20, unit: 'cm' },
  ], build: tSlot4040 },
  { id: 'square-tube', name: 'Square Tube', category: 'profiles', description: 'Hollow square tube.', params: [
    { key: 'length', label: 'Length', min: 4, max: 60, step: 1, default: 20, unit: 'cm' },
    { key: 'width', label: 'Width', min: 1.5, max: 8, step: 0.5, default: 3, unit: 'cm' },
    { key: 'wall', label: 'Wall', min: 0.1, max: 0.6, step: 0.05, default: 0.2, unit: 'cm' },
  ], build: squareTube },
  { id: 'round-tube', name: 'Round Tube', category: 'profiles', description: 'Hollow circular tube.', params: [
    { key: 'diameter', label: 'Ø', min: 1, max: 6, step: 0.1, default: 2.5, unit: 'cm' },
    { key: 'length', label: 'Length', min: 4, max: 60, step: 1, default: 20, unit: 'cm' },
    { key: 'wall', label: 'Wall', min: 0.1, max: 0.6, step: 0.05, default: 0.2, unit: 'cm' },
  ], build: roundTube },
  { id: 'u-channel', name: 'U-Channel', category: 'profiles', description: 'U-shaped channel.', params: [
    { key: 'length', label: 'Length', min: 4, max: 40, step: 1, default: 16, unit: 'cm' },
    { key: 'width', label: 'Width', min: 2, max: 6, step: 0.2, default: 3, unit: 'cm' },
    { key: 'height', label: 'Height', min: 1, max: 4, step: 0.2, default: 2, unit: 'cm' },
    { key: 'wall', label: 'Wall', min: 0.1, max: 0.4, step: 0.05, default: 0.2, unit: 'cm' },
  ], build: uChannel },
  { id: 'i-beam', name: 'I-Beam', category: 'profiles', description: 'Standard I-beam profile.', params: [
    { key: 'length', label: 'Length', min: 5, max: 40, step: 1, default: 20, unit: 'cm' },
    { key: 'flange', label: 'Flange', min: 1.5, max: 6, step: 0.2, default: 3, unit: 'cm' },
    { key: 'web', label: 'Web', min: 0.2, max: 1, step: 0.05, default: 0.4, unit: 'cm' },
    { key: 'height', label: 'Height', min: 2, max: 8, step: 0.2, default: 4, unit: 'cm' },
  ], build: iBeam },
  { id: 'angle-iron', name: 'Angle Iron', category: 'profiles', description: 'L-shaped angle iron.', params: [
    { key: 'length', label: 'Length', min: 5, max: 40, step: 1, default: 16, unit: 'cm' },
    { key: 'width', label: 'Leg', min: 1.5, max: 5, step: 0.2, default: 2.5, unit: 'cm' },
    { key: 'wall', label: 'Wall', min: 0.1, max: 0.5, step: 0.05, default: 0.25, unit: 'cm' },
  ], build: angleIron },

  /* ----- Wheels ----- */
  { id: 'plain-wheel', name: 'Spoked Wheel', category: 'wheels', description: 'Cast-aluminum spoked wheel with rubber tire and treaded crown.', params: [
    { key: 'diameter', label: 'Ø', min: 2, max: 10, step: 0.2, default: 5, unit: 'cm' },
    { key: 'width', label: 'Width', min: 0.5, max: 3, step: 0.1, default: 1.4, unit: 'cm' },
    { key: 'bore', label: 'Axle bore', min: 0.4, max: 2, step: 0.05, default: 0.8, unit: 'cm' },
    { key: 'spokes', label: 'Spokes', min: 3, max: 12, step: 1, default: 6 },
  ], build: plainWheel },
  { id: 'caster-wheel', name: 'Caster Wheel', category: 'wheels', description: 'Light-duty caster with solid hub and rubber tread.', params: [
    { key: 'diameter', label: 'Ø', min: 2, max: 8, step: 0.2, default: 5, unit: 'cm' },
    { key: 'width', label: 'Width', min: 0.5, max: 3, step: 0.1, default: 1.5, unit: 'cm' },
    { key: 'bore', label: 'Bore', min: 0.4, max: 2, step: 0.05, default: 0.8, unit: 'cm' },
  ], build: casterWheel },
  { id: 'omni-wheel', name: 'Omni Wheel', category: 'wheels', description: 'Hub-and-rollers omni wheel — rollers run tangent to the rim so the wheel can slide sideways.', params: [
    { key: 'diameter', label: 'Ø', min: 3, max: 10, step: 0.2, default: 6, unit: 'cm' },
    { key: 'width', label: 'Width', min: 0.6, max: 3, step: 0.1, default: 1.5, unit: 'cm' },
    { key: 'bore', label: 'Bore', min: 0.4, max: 2, step: 0.05, default: 0.8, unit: 'cm' },
    { key: 'rollers', label: 'Rollers', min: 8, max: 24, step: 1, default: 12 },
  ], build: omniWheel },
  { id: 'mecanum-wheel', name: 'Mecanum Wheel', category: 'wheels', description: 'Holonomic-drive wheel with rollers offset 45° from the wheel axis (right-hand chirality).', params: [
    { key: 'diameter', label: 'Ø', min: 4, max: 12, step: 0.5, default: 8, unit: 'cm' },
    { key: 'width', label: 'Width', min: 1, max: 4, step: 0.2, default: 2.5, unit: 'cm' },
    { key: 'bore', label: 'Bore', min: 0.5, max: 2, step: 0.05, default: 1, unit: 'cm' },
    { key: 'rollers', label: 'Rollers', min: 8, max: 24, step: 1, default: 12 },
  ], build: mecanumWheel },

  /* ----- Pneumatic / Plumbing ----- */
  { id: 'pipe', name: 'Pipe', category: 'pneumatic', description: 'Straight pipe segment.', params: [
    { key: 'diameter', label: 'Ø', min: 0.8, max: 6, step: 0.1, default: 2, unit: 'cm' },
    { key: 'length', label: 'Length', min: 4, max: 40, step: 1, default: 12, unit: 'cm' },
    { key: 'wall', label: 'Wall', min: 0.1, max: 0.5, step: 0.05, default: 0.15, unit: 'cm' },
  ], build: pipe },
  { id: 'elbow', name: 'Elbow Fitting', category: 'pneumatic', description: '90° elbow.', params: [
    { key: 'diameter', label: 'Ø', min: 0.8, max: 4, step: 0.1, default: 2, unit: 'cm' },
    { key: 'wall', label: 'Wall', min: 0.1, max: 0.4, step: 0.05, default: 0.15, unit: 'cm' },
  ], build: elbow },
  { id: 'tee-fitting', name: 'Tee Fitting', category: 'pneumatic', description: 'T-junction.', params: [
    { key: 'diameter', label: 'Ø', min: 0.8, max: 4, step: 0.1, default: 2, unit: 'cm' },
    { key: 'wall', label: 'Wall', min: 0.1, max: 0.4, step: 0.05, default: 0.15, unit: 'cm' },
  ], build: teeFitting },
  { id: 'flange', name: 'Pipe Flange', category: 'pneumatic', description: 'Bolted flange.', params: [
    { key: 'diameter', label: 'Bore', min: 0.8, max: 4, step: 0.1, default: 2, unit: 'cm' },
    { key: 'od', label: 'OD', min: 2, max: 8, step: 0.2, default: 4.5, unit: 'cm' },
    { key: 'thickness', label: 'Thk', min: 0.2, max: 1, step: 0.05, default: 0.4, unit: 'cm' },
  ], build: flange },
  { id: 'valve-handle', name: 'Valve Handle', category: 'pneumatic', description: 'Cross/wheel valve handle.', params: [
    { key: 'diameter', label: 'Ø', min: 2, max: 8, step: 0.2, default: 4, unit: 'cm' },
  ], build: valveHandle },

  /* ----- Electronics ----- */
  { id: 'led', name: '5mm LED', category: 'electronics', description: 'Through-hole LED.', params: [
    { key: 'diameter', label: 'Ø', min: 0.3, max: 1.5, step: 0.05, default: 0.5, unit: 'cm' },
    { key: 'length', label: 'Body L', min: 0.4, max: 1.5, step: 0.05, default: 0.7, unit: 'cm' },
  ], build: ledModule },
  { id: 'push-button', name: 'Push Button', category: 'electronics', description: 'Round push button.', params: [
    { key: 'diameter', label: 'Ø', min: 0.8, max: 3, step: 0.1, default: 1.6, unit: 'cm' },
    { key: 'height', label: 'Height', min: 0.4, max: 1.5, step: 0.05, default: 0.8, unit: 'cm' },
  ], build: pushButton },
  { id: 'rotary-encoder', name: 'Rotary Encoder', category: 'electronics', description: 'Square-body encoder w/ shaft.', params: [
    { key: 'diameter', label: 'Body', min: 1, max: 3, step: 0.1, default: 1.5, unit: 'cm' },
    { key: 'height', label: 'Height', min: 1, max: 3, step: 0.1, default: 1.5, unit: 'cm' },
  ], build: rotaryEncoder },
  { id: 'dc-motor', name: 'DC Motor', category: 'electronics', description: 'Cylindrical DC motor.', params: [
    { key: 'diameter', label: 'Ø', min: 1.5, max: 5, step: 0.1, default: 2.5, unit: 'cm' },
    { key: 'length', label: 'Length', min: 2, max: 8, step: 0.2, default: 4, unit: 'cm' },
  ], build: dcMotor },
  { id: 'gearbox', name: 'Gearbox Body', category: 'electronics', description: 'Rectangular gearbox enclosure.', params: [
    { key: 'width', label: 'Width', min: 1, max: 6, step: 0.2, default: 3, unit: 'cm' },
    { key: 'height', label: 'Height', min: 1, max: 6, step: 0.2, default: 2.5, unit: 'cm' },
    { key: 'length', label: 'Length', min: 1.5, max: 8, step: 0.2, default: 4, unit: 'cm' },
  ], build: gearbox },
  { id: 'speaker-cone', name: 'Speaker Cone', category: 'electronics', description: 'Speaker cone form.', params: [
    { key: 'diameter', label: 'Ø', min: 2, max: 12, step: 0.2, default: 5, unit: 'cm' },
    { key: 'height', label: 'Height', min: 1, max: 4, step: 0.1, default: 2, unit: 'cm' },
  ], build: speakerCone },
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
