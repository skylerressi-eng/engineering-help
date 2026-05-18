/**
 * Turn an arbitrary 3D mesh into something AeroSim can test:
 *   - a 2D silhouette polygon (used as the airfoil cross-section + CFD obstacle)
 *   - normalized to unit chord, centred on the quarter-chord, like the NACA gen
 *
 * The silhouette is the convex hull of every vertex projected onto the X-Y
 * plane. Convex hull is robust for wing/airfoil-like extrusions and never
 * produces self-intersecting outlines, which keeps the potential-flow and
 * stable-fluids solvers stable.
 */
import * as THREE from 'three';
import type { Vec2 } from '../physics2d/math';

/** Andrew's monotone-chain convex hull. Returns CCW points. */
function convexHull(points: Vec2[]): Vec2[] {
  if (points.length < 3) return points.slice();
  const pts = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: Vec2, a: Vec2, b: Vec2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Project a geometry's vertices onto X-Y, hull them, then normalise so the
 * chord (x-extent) is 1 and the shape is positioned like generateAirfoil()
 * output (leading edge near x=0, trailing edge near x=1).
 */
export function extractSilhouette(geometry: THREE.BufferGeometry): Vec2[] {
  const posAttr = geometry.getAttribute('position');
  if (!posAttr) return [];
  const raw: Vec2[] = [];
  for (let i = 0; i < posAttr.count; i++) {
    raw.push({ x: posAttr.getX(i), y: posAttr.getY(i) });
  }
  if (raw.length < 3) return [];
  const hull = convexHull(raw);
  if (hull.length < 3) return [];

  // Normalize: shift so min x = 0, scale so x-extent = 1
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of hull) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const span = Math.max(1e-6, maxX - minX);
  const cy = (minY + maxY) / 2;
  return hull.map((p) => ({
    x: (p.x - minX) / span,
    y: (p.y - cy) / span,
  }));
}

