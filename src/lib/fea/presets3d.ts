import type { FeaModel3D, Node3D, Element3D } from './truss3d';

const STEEL_E = 2.0e11;
const STEEL_ALPHA = 12e-6;
const A = 1e-4; // 1 cm²

function n(
  id: string,
  x: number,
  y: number,
  z: number,
  fix = false,
): Node3D {
  return { id, x, y, z, fixX: fix, fixY: fix, fixZ: fix };
}
function e(id: string, a: string, b: string): Element3D {
  return { id, a, b, E: STEEL_E, A, alpha: STEEL_ALPHA };
}

export interface FeaPreset3D {
  id: string;
  name: string;
  description: string;
  model: FeaModel3D;
}

const baseModel = (
  nodes: Node3D[],
  elements: Element3D[],
  loads: FeaModel3D['loads'],
): FeaModel3D => ({
  nodes,
  elements,
  loads,
  test: 'force',
  pressure: 5000,
  tribArea: 0.25,
  pDir: [0, -1, 0],
  deltaT: 60,
});

export const FEA_PRESETS_3D: FeaPreset3D[] = [
  {
    id: 'space-cantilever',
    name: 'Space Cantilever',
    description: 'Box-section cantilever rooted in a wall, tip vertical load.',
    model: baseModel(
      [
        n('r1', 0, 0, 0, true),
        n('r2', 0, 1, 0, true),
        n('r3', 0, 1, 1, true),
        n('r4', 0, 0, 1, true),
        n('a1', 2, 0, 0),
        n('a2', 2, 1, 0),
        n('a3', 2, 1, 1),
        n('a4', 2, 0, 1),
        n('b1', 4, 0.2, 0.2),
        n('b2', 4, 0.8, 0.2),
        n('b3', 4, 0.8, 0.8),
        n('b4', 4, 0.2, 0.8),
      ],
      [
        e('c1', 'r1', 'a1'), e('c2', 'r2', 'a2'),
        e('c3', 'r3', 'a3'), e('c4', 'r4', 'a4'),
        e('c5', 'a1', 'b1'), e('c6', 'a2', 'b2'),
        e('c7', 'a3', 'b3'), e('c8', 'a4', 'b4'),
        e('ring_a12', 'a1', 'a2'), e('ring_a23', 'a2', 'a3'),
        e('ring_a34', 'a3', 'a4'), e('ring_a41', 'a4', 'a1'),
        e('ring_b12', 'b1', 'b2'), e('ring_b23', 'b2', 'b3'),
        e('ring_b34', 'b3', 'b4'), e('ring_b41', 'b4', 'b1'),
        e('d_a13', 'a1', 'a3'), e('d_b13', 'b1', 'b3'),
        e('x1', 'r1', 'a2'), e('x2', 'a1', 'b2'),
        e('x3', 'r4', 'a3'), e('x4', 'a4', 'b3'),
      ],
      [
        { node: 'b1', fx: 0, fy: -4000, fz: 0 },
        { node: 'b4', fx: 0, fy: -4000, fz: 0 },
      ],
    ),
  },
  {
    id: 'pyramid',
    name: 'Pyramid Mast',
    description: 'Four-legged pyramid with an apex point load.',
    model: baseModel(
      [
        n('p1', -2, 0, -2, true),
        n('p2', 2, 0, -2, true),
        n('p3', 2, 0, 2, true),
        n('p4', -2, 0, 2, true),
        n('apex', 0, 4, 0),
      ],
      [
        e('l1', 'p1', 'apex'),
        e('l2', 'p2', 'apex'),
        e('l3', 'p3', 'apex'),
        e('l4', 'p4', 'apex'),
        e('b12', 'p1', 'p2'),
        e('b23', 'p2', 'p3'),
        e('b34', 'p3', 'p4'),
        e('b41', 'p4', 'p1'),
      ],
      [{ node: 'apex', fx: 2000, fy: -8000, fz: 1000 }],
    ),
  },
  {
    id: 'tower3d',
    name: '3D Lattice Tower',
    description: 'Two-storey square lattice tower with wind load up top.',
    model: (() => {
      const nodes: Node3D[] = [];
      const elements: Element3D[] = [];
      const levels = 3;
      const s = 1.5;
      const h = 2;
      const corner = (lv: number, c: number): string => `L${lv}c${c}`;
      const cpos: [number, number][] = [
        [-s, -s],
        [s, -s],
        [s, s],
        [-s, s],
      ];
      for (let lv = 0; lv < levels; lv++) {
        cpos.forEach(([cx, cz], c) => {
          nodes.push(n(corner(lv, c), cx, lv * h, cz, lv === 0));
        });
      }
      for (let lv = 0; lv < levels; lv++) {
        // horizontal ring
        for (let c = 0; c < 4; c++) {
          elements.push(
            e(`h${lv}_${c}`, corner(lv, c), corner(lv, (c + 1) % 4)),
          );
        }
        if (lv < levels - 1) {
          for (let c = 0; c < 4; c++) {
            // vertical leg
            elements.push(
              e(`v${lv}_${c}`, corner(lv, c), corner(lv + 1, c)),
            );
            // face brace
            elements.push(
              e(`x${lv}_${c}`, corner(lv, c), corner(lv + 1, (c + 1) % 4)),
            );
          }
        }
      }
      return baseModel(nodes, elements, [
        { node: corner(levels - 1, 2), fx: 3000, fy: -1000, fz: 1500 },
        { node: corner(levels - 1, 3), fx: 3000, fy: -1000, fz: 1500 },
      ]);
    })(),
  },
  {
    id: 'roof-truss',
    name: 'Hip-Roof Truss',
    description: 'Pitched roof grid — try the Pressure test (snow/wind load).',
    model: baseModel(
      [
        n('c1', -3, 0, -2, true),
        n('c2', 3, 0, -2, true),
        n('c3', 3, 0, 2, true),
        n('c4', -3, 0, 2, true),
        n('e1', -1.5, 2, 0),
        n('e2', 1.5, 2, 0),
      ],
      [
        e('r1', 'c1', 'e1'),
        e('r2', 'c4', 'e1'),
        e('r3', 'c2', 'e2'),
        e('r4', 'c3', 'e2'),
        e('ridge', 'e1', 'e2'),
        e('tie14', 'c1', 'c4'),
        e('tie23', 'c2', 'c3'),
        e('tie12', 'c1', 'c2'),
        e('tie34', 'c3', 'c4'),
        e('br1', 'c1', 'e2'),
        e('br2', 'c3', 'e1'),
      ],
      [],
    ),
  },
];
