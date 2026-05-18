/**
 * 3D space-truss finite-element solver — the linear direct-stiffness method
 * generalised to 3 DOF/node (ux, uy, uz). Supports three load cases:
 *
 *   - 'force'    : explicit nodal forces (Fx, Fy, Fz)
 *   - 'pressure' : a uniform surface pressure applied to every free node as
 *                  an equivalent nodal force = p · A_trib along a direction
 *   - 'thermal'  : a global temperature change ΔT; each bar gets a thermal
 *                  pre-load E·A·α·ΔT and the recovered member force subtracts
 *                  the free thermal strain  →  real thermal-stress analysis
 *
 * Reuses the dense LU solver already in the codebase.
 */
import { solve } from '@/lib/circuitSolver/linalg';

export interface Node3D {
  id: string;
  x: number;
  y: number;
  z: number;
  fixX: boolean;
  fixY: boolean;
  fixZ: boolean;
}

export interface Element3D {
  id: string;
  a: string;
  b: string;
  E: number;
  A: number;
  /** thermal expansion coefficient (1/K) */
  alpha: number;
}

export interface Load3D {
  node: string;
  fx: number;
  fy: number;
  fz: number;
}

export type TestType = 'force' | 'pressure' | 'thermal';

export interface FeaModel3D {
  nodes: Node3D[];
  elements: Element3D[];
  loads: Load3D[];
  test: TestType;
  /** pressure magnitude (Pa) and tributary area (m²) for the pressure case */
  pressure: number;
  tribArea: number;
  /** unit direction the pressure pushes (default −Y = down) */
  pDir: [number, number, number];
  /** ΔT (K) for the thermal case */
  deltaT: number;
}

export interface ElemResult3D {
  id: string;
  force: number;
  stress: number;
  length: number;
}

export interface FeaResult3D {
  disp: Record<string, { ux: number; uy: number; uz: number }>;
  reactions: Record<string, { rx: number; ry: number; rz: number }>;
  elements: ElemResult3D[];
  maxDisp: number;
  maxStress: number;
  unstable: boolean;
}

export function solveTruss3D(model: FeaModel3D): FeaResult3D {
  const { nodes, elements } = model;
  const n = nodes.length;
  const ndof = n * 3;
  const idx = new Map<string, number>();
  nodes.forEach((nd, i) => idx.set(nd.id, i));

  const K = new Float64Array(ndof * ndof);
  const F = new Float64Array(ndof);
  const geom = new Map<
    string,
    { L: number; r: [number, number, number]; thermalP: number }
  >();

  for (const el of elements) {
    const ia = idx.get(el.a);
    const ib = idx.get(el.b);
    if (ia === undefined || ib === undefined) continue;
    const na = nodes[ia];
    const nb = nodes[ib];
    const dx = nb.x - na.x;
    const dy = nb.y - na.y;
    const dz = nb.z - na.z;
    const L = Math.hypot(dx, dy, dz) || 1e-9;
    const r: [number, number, number] = [dx / L, dy / L, dz / L];
    const k = (el.E * el.A) / L;
    const map = [ia * 3, ia * 3 + 1, ia * 3 + 2, ib * 3, ib * 3 + 1, ib * 3 + 2];
    // 6×6 = k * [[B,-B],[-B,B]] with B = r⊗r
    for (let p = 0; p < 3; p++) {
      for (let q = 0; q < 3; q++) {
        const v = k * r[p] * r[q];
        K[map[p] * ndof + map[q]] += v;
        K[map[p] * ndof + map[3 + q]] -= v;
        K[map[3 + p] * ndof + map[q]] -= v;
        K[map[3 + p] * ndof + map[3 + q]] += v;
      }
    }
    // Thermal pre-load (only used in the thermal case)
    const thermalP =
      model.test === 'thermal' ? el.E * el.A * el.alpha * model.deltaT : 0;
    if (thermalP !== 0) {
      for (let d = 0; d < 3; d++) {
        F[map[d]] -= thermalP * r[d];
        F[map[3 + d]] += thermalP * r[d];
      }
    }
    geom.set(el.id, { L, r, thermalP });
  }

  // Load vector by test type
  if (model.test === 'force') {
    for (const ld of model.loads) {
      const i = idx.get(ld.node);
      if (i === undefined) continue;
      F[i * 3] += ld.fx;
      F[i * 3 + 1] += ld.fy;
      F[i * 3 + 2] += ld.fz;
    }
  } else if (model.test === 'pressure') {
    const mag = model.pressure * model.tribArea;
    const d = model.pDir;
    const dl = Math.hypot(d[0], d[1], d[2]) || 1;
    nodes.forEach((nd, i) => {
      const free = !(nd.fixX && nd.fixY && nd.fixZ);
      if (!free) return;
      F[i * 3] += (mag * d[0]) / dl;
      F[i * 3 + 1] += (mag * d[1]) / dl;
      F[i * 3 + 2] += (mag * d[2]) / dl;
    });
  }

  // Boundary conditions
  const fixed: boolean[] = new Array(ndof).fill(false);
  nodes.forEach((nd, i) => {
    if (nd.fixX) fixed[i * 3] = true;
    if (nd.fixY) fixed[i * 3 + 1] = true;
    if (nd.fixZ) fixed[i * 3 + 2] = true;
  });
  const free: number[] = [];
  for (let i = 0; i < ndof; i++) if (!fixed[i]) free.push(i);

  const u = new Float64Array(ndof);
  let unstable = false;
  if (free.length) {
    const m = free.length;
    const Kr = new Float64Array(m * m);
    const Fr = new Float64Array(m);
    for (let p = 0; p < m; p++) {
      Fr[p] = F[free[p]];
      for (let q = 0; q < m; q++) Kr[p * m + q] = K[free[p] * ndof + free[q]];
    }
    try {
      const x = solve(Kr, Fr, m);
      for (let p = 0; p < m; p++) u[free[p]] = x[p];
    } catch {
      unstable = true;
    }
  }

  const elemResults: ElemResult3D[] = [];
  let maxStress = 0;
  for (const el of elements) {
    const ia = idx.get(el.a)!;
    const ib = idx.get(el.b)!;
    const g = geom.get(el.id);
    if (!g) continue;
    const du = [
      u[ib * 3] - u[ia * 3],
      u[ib * 3 + 1] - u[ia * 3 + 1],
      u[ib * 3 + 2] - u[ia * 3 + 2],
    ];
    const elong = du[0] * g.r[0] + du[1] * g.r[1] + du[2] * g.r[2];
    // total strain minus free thermal strain → mechanical (stress) strain
    const thermalStrain = model.test === 'thermal' ? el.alpha * model.deltaT : 0;
    const stress = el.E * (elong / g.L - thermalStrain);
    const force = stress * el.A;
    if (Math.abs(stress) > maxStress) maxStress = Math.abs(stress);
    elemResults.push({ id: el.id, force, stress, length: g.L });
  }

  const disp: Record<string, { ux: number; uy: number; uz: number }> = {};
  let maxDisp = 0;
  nodes.forEach((nd, i) => {
    const ux = u[i * 3];
    const uy = u[i * 3 + 1];
    const uz = u[i * 3 + 2];
    disp[nd.id] = { ux, uy, uz };
    maxDisp = Math.max(maxDisp, Math.hypot(ux, uy, uz));
  });

  const reactions: Record<string, { rx: number; ry: number; rz: number }> = {};
  nodes.forEach((nd, i) => {
    if (!nd.fixX && !nd.fixY && !nd.fixZ) return;
    let rx = -F[i * 3];
    let ry = -F[i * 3 + 1];
    let rz = -F[i * 3 + 2];
    for (let j = 0; j < ndof; j++) {
      rx += K[i * 3 * ndof + j] * u[j];
      ry += K[(i * 3 + 1) * ndof + j] * u[j];
      rz += K[(i * 3 + 2) * ndof + j] * u[j];
    }
    reactions[nd.id] = {
      rx: nd.fixX ? rx : 0,
      ry: nd.fixY ? ry : 0,
      rz: nd.fixZ ? rz : 0,
    };
  });

  return { disp, reactions, elements: elemResults, maxDisp, maxStress, unstable };
}
