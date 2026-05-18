import { World } from './world';
import { makeBody, makeBox, makeCircle, type Body } from './types';
import { makeDistance, makePin, makeSpring, type Constraint } from './constraints';
import type { Vec2 } from './math';

/** Standard ground + side walls used by most demos */
function addGround(w: World, width = 24, height = 16) {
  w.add(
    makeBody(makeBox(width, 0.5), {
      pos: { x: 0, y: height / 2 + 0.5 },
      isStatic: true,
      color: '#475569',
      label: 'ground',
    }),
  );
  w.add(
    makeBody(makeBox(0.5, height / 2), {
      pos: { x: -width / 2 + 0.5, y: 0 },
      isStatic: true,
      color: '#475569',
    }),
  );
  w.add(
    makeBody(makeBox(0.5, height / 2), {
      pos: { x: width / 2 - 0.5, y: 0 },
      isStatic: true,
      color: '#475569',
    }),
  );
}

export type DemoId =
  | 'empty'
  | 'cradle'
  | 'pendulum'
  | 'tower'
  | 'ragdoll'
  | 'cloth'
  | 'conveyor'
  | 'dominoes'
  | 'seesaw'
  | 'galton'
  | 'pyramid';

export const DEMOS: { id: DemoId; label: string; description: string }[] = [
  { id: 'empty', label: 'Empty + Ground', description: 'Empty world with floor and walls' },
  { id: 'cradle', label: "Newton's Cradle", description: 'Classic momentum-conservation toy' },
  { id: 'pendulum', label: 'Pendulum Chain', description: 'Five-link chain pivoted at top' },
  { id: 'tower', label: 'Tower of Blocks', description: 'A 12-block stack' },
  { id: 'ragdoll', label: 'Ragdoll', description: '7-piece ragdoll with pin joints' },
  { id: 'cloth', label: 'Cloth', description: '8×8 grid of particles connected by springs' },
  { id: 'conveyor', label: 'Conveyor Belt', description: 'Static blocks with high friction' },
  { id: 'dominoes', label: 'Dominoes', description: 'A toppling row — give the first a nudge' },
  { id: 'seesaw', label: 'See-saw + Load', description: 'A plank on a pivot with a drop weight' },
  { id: 'galton', label: 'Galton Board', description: 'Balls bouncing through a peg lattice' },
  { id: 'pyramid', label: 'Block Pyramid', description: 'A stable stacked pyramid of boxes' },
];

export function buildDemo(id: DemoId): World {
  const w = new World({ gravity: { x: 0, y: 9.81 } });
  switch (id) {
    case 'empty':
      addGround(w);
      break;
    case 'cradle':
      buildCradle(w);
      break;
    case 'pendulum':
      buildPendulum(w);
      break;
    case 'tower':
      buildTower(w);
      break;
    case 'ragdoll':
      buildRagdoll(w);
      break;
    case 'cloth':
      buildCloth(w);
      break;
    case 'conveyor':
      buildConveyor(w);
      break;
    case 'dominoes':
      buildDominoes(w);
      break;
    case 'seesaw':
      buildSeesaw(w);
      break;
    case 'galton':
      buildGalton(w);
      break;
    case 'pyramid':
      buildPyramid(w);
      break;
  }
  return w;
}

function buildDominoes(w: World) {
  addGround(w);
  const ground = w.bodies[0];
  const top = ground.pos.y - 0.5;
  for (let i = 0; i < 12; i++) {
    w.add(
      makeBody(makeBox(0.06, 0.55), {
        pos: { x: -6 + i * 1.0, y: top - 0.55 },
        friction: 0.6,
        restitution: 0.02,
        color: i === 0 ? '#f59e0b' : '#38bdf8',
      }),
    );
  }
  // A ball poised to knock the first domino over
  w.add(
    makeBody(makeCircle(0.35), {
      pos: { x: -8, y: top - 2.5 },
      vel: { x: 4, y: 0 },
      restitution: 0.1,
      friction: 0.4,
      color: '#fb7185',
    }),
  );
}

function buildSeesaw(w: World) {
  addGround(w);
  const ground = w.bodies[0];
  const top = ground.pos.y - 0.5;
  const fulcrum = makeBody(makeBox(0.3, 0.6), {
    pos: { x: 0, y: top - 0.6 },
    isStatic: true,
    color: '#475569',
  });
  w.add(fulcrum);
  const plank = makeBody(makeBox(3.2, 0.1), {
    pos: { x: 0, y: top - 1.3 },
    friction: 0.7,
    color: '#a16207',
  });
  w.add(plank);
  w.addConstraint(makePin(plank, fulcrum, { x: 0, y: 0 }, { x: 0, y: -0.6 }));
  // light box resting on the left, heavy weight dropping on the right
  w.add(
    makeBody(makeBox(0.3, 0.3), {
      pos: { x: -2.4, y: top - 1.7 },
      density: 0.7,
      color: '#34d399',
    }),
  );
  w.add(
    makeBody(makeBox(0.45, 0.45), {
      pos: { x: 2.4, y: top - 6 },
      density: 8,
      color: '#94a3b8',
    }),
  );
}

function buildGalton(w: World) {
  addGround(w, 20, 18);
  const top = -8;
  const rows = 7;
  const dx = 1.0;
  for (let r = 0; r < rows; r++) {
    const count = r + 1;
    for (let i = 0; i < count; i++) {
      w.add(
        makeBody(makeCircle(0.1), {
          pos: { x: (i - r / 2) * dx, y: top + r * 0.9 },
          isStatic: true,
          color: '#64748b',
        }),
      );
    }
  }
  for (let i = 0; i < 14; i++) {
    w.add(
      makeBody(makeCircle(0.16), {
        pos: { x: (Math.random() - 0.5) * 0.4, y: top - 2 - i * 0.5 },
        restitution: 0.25,
        friction: 0.2,
        color: '#f0abfc',
      }),
    );
  }
}

function buildPyramid(w: World) {
  addGround(w);
  const ground = w.bodies[0];
  const top = ground.pos.y - 0.5;
  const hw = 0.45;
  const hh = 0.4;
  const rows = 6;
  for (let r = 0; r < rows; r++) {
    const n = rows - r;
    for (let i = 0; i < n; i++) {
      w.add(
        makeBody(makeBox(hw, hh), {
          pos: {
            x: (i - (n - 1) / 2) * (hw * 2 + 0.01),
            y: top - hh - r * (hh * 2 + 0.005),
          },
          friction: 0.7,
          restitution: 0.02,
          color: (r + i) % 2 === 0 ? '#34d399' : '#22d3ee',
        }),
      );
    }
  }
}

function buildCradle(w: World) {
  addGround(w);
  const anchorY = -4;
  const r = 0.4;
  const cordLen = 4;
  const count = 5;
  const spacing = r * 2 + 0.005;
  const startX = -((count - 1) * spacing) / 2;
  for (let i = 0; i < count; i++) {
    const ball = makeBody(makeCircle(r), {
      pos: { x: startX + i * spacing, y: anchorY + cordLen },
      restitution: 0.95,
      friction: 0.01,
      color: '#fbbf24',
    });
    if (i === 0) {
      ball.pos.x -= 3;
      ball.pos.y = anchorY + 1;
      ball.angle = 0;
    }
    w.add(ball);
    w.addConstraint(
      makeDistance(
        ball,
        null,
        { x: 0, y: 0 },
        { x: startX + i * spacing, y: anchorY },
        Math.hypot(ball.pos.x - (startX + i * spacing), ball.pos.y - anchorY),
      ),
    );
  }
}

function buildPendulum(w: World) {
  addGround(w);
  const links = 5;
  const linkLen = 1.0;
  let prev: Body | null = null;
  for (let i = 0; i < links; i++) {
    const body = makeBody(makeBox(0.5, 0.1), {
      pos: { x: -4 + (i + 1) * linkLen, y: -5 },
      friction: 0.3,
      color: '#60a5fa',
    });
    w.add(body);
    if (prev === null) {
      w.addConstraint(makePin(body, null, { x: -0.5, y: 0 }, { x: -4, y: -5 }));
    } else {
      w.addConstraint(
        makePin(prev, body, { x: 0.5, y: 0 }, { x: -0.5, y: 0 }),
      );
    }
    prev = body;
  }
}

function buildTower(w: World) {
  addGround(w);
  const ground = w.bodies[0];
  const top = ground.pos.y - 0.5; // ground.y is centered
  const halfW = 0.5;
  const halfH = 0.4;
  for (let i = 0; i < 12; i++) {
    w.add(
      makeBody(makeBox(halfW, halfH), {
        pos: { x: (i % 2 === 0 ? -0.05 : 0.05), y: top - halfH - i * (halfH * 2 + 0.005) },
        friction: 0.6,
        restitution: 0.05,
        color: i % 2 === 0 ? '#34d399' : '#22d3ee',
      }),
    );
  }
}

function buildRagdoll(w: World) {
  addGround(w);
  const cx = 0;
  const cy = -3;
  const head = makeBody(makeCircle(0.35), {
    pos: { x: cx, y: cy - 1.5 },
    color: '#fcd34d',
  });
  const torso = makeBody(makeBox(0.45, 0.8), {
    pos: { x: cx, y: cy },
    color: '#fb7185',
  });
  const lArm = makeBody(makeBox(0.45, 0.12), {
    pos: { x: cx - 0.8, y: cy - 0.5 },
    color: '#a78bfa',
  });
  const rArm = makeBody(makeBox(0.45, 0.12), {
    pos: { x: cx + 0.8, y: cy - 0.5 },
    color: '#a78bfa',
  });
  const lLeg = makeBody(makeBox(0.15, 0.6), {
    pos: { x: cx - 0.2, y: cy + 1.2 },
    color: '#818cf8',
  });
  const rLeg = makeBody(makeBox(0.15, 0.6), {
    pos: { x: cx + 0.2, y: cy + 1.2 },
    color: '#818cf8',
  });
  [head, torso, lArm, rArm, lLeg, rLeg].forEach((b) => w.add(b));
  w.addConstraint(makePin(head, torso, { x: 0, y: 0.35 }, { x: 0, y: -0.7 }));
  w.addConstraint(makePin(lArm, torso, { x: 0.4, y: 0 }, { x: -0.4, y: -0.55 }));
  w.addConstraint(makePin(rArm, torso, { x: -0.4, y: 0 }, { x: 0.4, y: -0.55 }));
  w.addConstraint(makePin(lLeg, torso, { x: 0, y: -0.55 }, { x: -0.2, y: 0.75 }));
  w.addConstraint(makePin(rLeg, torso, { x: 0, y: -0.55 }, { x: 0.2, y: 0.75 }));
}

function buildCloth(w: World) {
  addGround(w, 24, 18);
  const N = 8;
  const spacing = 0.4;
  const x0 = -((N - 1) * spacing) / 2;
  const y0 = -6;
  const grid: (Body | null)[][] = [];
  for (let j = 0; j < N; j++) {
    grid.push([]);
    for (let i = 0; i < N; i++) {
      const body = makeBody(makeCircle(0.08), {
        pos: { x: x0 + i * spacing, y: y0 + j * spacing },
        isStatic: j === 0 && (i === 0 || i === N - 1),
        color: j === 0 && (i === 0 || i === N - 1) ? '#475569' : '#e879f9',
        density: 0.1,
        friction: 0.1,
      });
      w.add(body);
      grid[j].push(body);
    }
  }
  const STIFF = 60;
  const DAMP = 0.5;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const me = grid[j][i]!;
      if (i + 1 < N) {
        const r = grid[j][i + 1]!;
        w.addConstraint(makeSpring(me, r, { x: 0, y: 0 }, { x: 0, y: 0 }, STIFF, DAMP, spacing));
      }
      if (j + 1 < N) {
        const d = grid[j + 1][i]!;
        w.addConstraint(makeSpring(me, d, { x: 0, y: 0 }, { x: 0, y: 0 }, STIFF, DAMP, spacing));
      }
    }
  }
}

function buildConveyor(w: World) {
  addGround(w);
  // High-friction inclined belt made of static boxes
  const segs = 12;
  for (let i = 0; i < segs; i++) {
    w.add(
      makeBody(makeBox(0.5, 0.15), {
        pos: { x: -5 + i * 0.95, y: -2 + i * 0.4 },
        angle: 0.4,
        isStatic: true,
        friction: 0.95,
        color: '#fbbf24',
      }),
    );
  }
  // Drop a few circles to ride down the belt
  for (let i = 0; i < 6; i++) {
    w.add(
      makeBody(makeCircle(0.3), {
        pos: { x: -6 + i * 0.3, y: -6 - i * 0.5 },
        friction: 0.6,
        restitution: 0.2,
        color: '#60a5fa',
      }),
    );
  }
}

// keep TS happy with unused exports
export type { Vec2, Constraint };
