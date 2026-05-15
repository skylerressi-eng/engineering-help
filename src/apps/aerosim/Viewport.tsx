import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useAerosimStore } from '@/store/aerosimStore';
import { generateAirfoil, naca4Custom, placeShape } from '@/lib/cfd/naca';
import type { Vec2 } from '@/lib/physics2d/math';
import { advectRK2, makeFlowField } from '@/lib/cfd/potential';
import {
  makeGrid,
  stampObstacle,
  step as fluidStep,
  vorticity,
  IX,
  type Grid as FluidGrid,
} from '@/lib/cfd/stableFluids';

const PARTICLE_COUNT = 80;
const FLOW_DOMAIN = { x: -3.5, y: -2, w: 7, h: 4 };
const FLUID_W = 192;
const FLUID_H = 96;

export default function Viewport() {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 50, near: 0.05, far: 200 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      style={{ background: 'transparent' }}
    >
      <color attach="background" args={['#0b1020']} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[6, 10, 5]} intensity={1.2} />
      <directionalLight position={[-4, -2, -6]} intensity={0.4} />

      <CameraSwitcher />
      <SceneContents />

      <Grid
        args={[20, 20]}
        cellColor="#1f2937"
        sectionColor="#334155"
        sectionThickness={1}
        cellThickness={0.6}
        fadeDistance={30}
        infiniteGrid
        position={[0, 0, -0.05]}
      />
      <OrbitControls enableDamping makeDefault />
      <GizmoHelper alignment="top-right" margin={[60, 50]}>
        <GizmoViewport axisColors={["#ef4444", "#22c55e", "#0ea5e9"]} labelColor="white" />
      </GizmoHelper>
    </Canvas>
  );
}

function CameraSwitcher() {
  const threeD = useAerosimStore((s) => s.threeD);
  const { camera } = useThree();
  useEffect(() => {
    if (!threeD) {
      camera.position.set(0, 0, 6);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
    } else {
      camera.position.set(3.5, 3, 5);
      camera.lookAt(0, 0, 0);
    }
  }, [threeD, camera]);
  return null;
}

function SceneContents() {
  const mode = useAerosimStore((s) => s.mode);
  const threeD = useAerosimStore((s) => s.threeD);
  const aoaDeg = useAerosimStore((s) => s.aoaDeg);
  const chord = useAerosimStore((s) => s.chord);
  const aoa = (aoaDeg * Math.PI) / 180;

  return (
    <>
      <AirfoilMesh chord={chord} aoa={aoa} threeD={threeD} />
      {mode === 'simple' ? (
        <Streamlines chord={chord} aoa={aoa} />
      ) : (
        <FluidField chord={chord} aoa={aoa} />
      )}
    </>
  );
}

/** Resolve the active 2D outline (unit-chord verts) from the current source. */
export function useActiveSilhouette(): Vec2[] {
  const source = useAerosimStore((s) => s.source);
  const airfoil = useAerosimStore((s) => s.airfoil);
  const customM = useAerosimStore((s) => s.customM);
  const customP = useAerosimStore((s) => s.customP);
  const customT = useAerosimStore((s) => s.customT);
  const imported = useAerosimStore((s) => s.imported);
  return useMemo(() => {
    if (source === 'import' && imported?.silhouette.length) return imported.silhouette;
    if (source === 'naca') return naca4Custom(customM, customP, customT, 60);
    return generateAirfoil(airfoil, 60);
  }, [source, airfoil, customM, customP, customT, imported]);
}

function AirfoilMesh({
  chord,
  aoa,
  threeD,
}: {
  chord: number;
  aoa: number;
  threeD: boolean;
}) {
  const source = useAerosimStore((s) => s.source);
  const imported = useAerosimStore((s) => s.imported);
  const verts = useActiveSilhouette();

  const geom = useMemo(() => {
    // In 3D mode, prefer the *actual* imported mesh so users see their model.
    if (threeD && source === 'import' && imported?.geometry) {
      const g = imported.geometry.clone();
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      const size = bb.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const s = (chord * 2.4) / maxDim;
      g.center();
      g.scale(s, s, s);
      g.rotateZ(-aoa);
      return g;
    }
    const placed = placeShape(verts, { x: 0, y: 0 }, chord, aoa);
    const shape = new THREE.Shape();
    shape.moveTo(placed[0].x, -placed[0].y);
    for (let i = 1; i < placed.length; i++) shape.lineTo(placed[i].x, -placed[i].y);
    shape.lineTo(placed[0].x, -placed[0].y);
    if (threeD) {
      const ex = new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false });
      ex.center();
      return ex;
    }
    return new THREE.ShapeGeometry(shape);
  }, [verts, chord, aoa, threeD, source, imported]);

  return (
    <mesh geometry={geom} castShadow receiveShadow>
      <meshStandardMaterial
        color="#e2e8f0"
        metalness={0.45}
        roughness={0.3}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/* Streamlines: a packed buffer of N segments updated each frame */
function Streamlines({
  chord,
  aoa,
}: {
  chord: number;
  aoa: number;
}) {
  const V = useAerosimStore((s) => s.V);
  const airfoil = useAerosimStore((s) => s.airfoil);
  const source = useAerosimStore((s) => s.source);
  const isCyl = source === 'preset' && airfoil === 'cylinder';
  const fieldRef = useRef(
    makeFlowField({ V, aoa, chord, isCylinder: isCyl, center: { x: 0, y: 0 } }),
  );

  // Reset field when inputs change
  useEffect(() => {
    fieldRef.current = makeFlowField({
      V,
      aoa,
      chord,
      isCylinder: isCyl,
      center: { x: 0, y: 0 },
    });
  }, [V, aoa, chord, isCyl]);

  // Particle state: positions + per-particle "trail" (history)
  const TRAIL = 28;
  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, () =>
      seedParticle(),
    ),
  );

  const segGeom = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * TRAIL * 6); // 2 verts × 3
    const colors = new Float32Array(PARTICLE_COUNT * TRAIL * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, []);

  useFrame((_, dt) => {
    if (!useAerosimStore.getState().running) return;
    const cappedDt = Math.min(0.05, dt);
    const positions = segGeom.attributes.position.array as Float32Array;
    const colors = segGeom.attributes.color.array as Float32Array;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles.current[i];
      // Advance
      const next = advectRK2(fieldRef.current, { x: p.x, y: p.y }, cappedDt);
      p.history.push({ x: next.x, y: next.y });
      if (p.history.length > TRAIL + 1) p.history.shift();
      p.x = next.x;
      p.y = next.y;
      // Recycle if out of bounds
      if (
        p.x > FLOW_DOMAIN.x + FLOW_DOMAIN.w ||
        p.x < FLOW_DOMAIN.x - 0.5 ||
        Math.abs(p.y) > FLOW_DOMAIN.h
      ) {
        const fresh = seedParticle();
        p.x = fresh.x;
        p.y = fresh.y;
        p.history = fresh.history;
      }

      // Fill in segments
      for (let k = 0; k < TRAIL; k++) {
        const aIdx = (i * TRAIL + k) * 6;
        if (k + 1 >= p.history.length) {
          positions[aIdx + 0] = positions[aIdx + 3] = 0;
          positions[aIdx + 1] = positions[aIdx + 4] = 0;
          positions[aIdx + 2] = positions[aIdx + 5] = -100;
          continue;
        }
        const a = p.history[p.history.length - 1 - k];
        const b = p.history[p.history.length - 2 - k];
        positions[aIdx + 0] = a.x;
        positions[aIdx + 1] = -a.y;
        positions[aIdx + 2] = 0;
        positions[aIdx + 3] = b.x;
        positions[aIdx + 4] = -b.y;
        positions[aIdx + 5] = 0;

        // Color by speed at this point — fast = red, slow = blue
        const vel = fieldRef.current.velocity({ x: a.x, y: a.y });
        const spd = Math.hypot(vel.x, vel.y);
        const t = Math.min(1, spd / Math.max(0.001, V * 1.6));
        const r = t;
        const g = 0.4;
        const bl = 1 - t;
        colors[aIdx + 0] = colors[aIdx + 3] = r;
        colors[aIdx + 1] = colors[aIdx + 4] = g;
        colors[aIdx + 2] = colors[aIdx + 5] = bl;
      }
    }
    segGeom.attributes.position.needsUpdate = true;
    segGeom.attributes.color.needsUpdate = true;
  });

  return (
    <lineSegments geometry={segGeom}>
      <lineBasicMaterial vertexColors transparent opacity={0.85} />
    </lineSegments>
  );
}

function seedParticle() {
  const x = FLOW_DOMAIN.x + Math.random() * 0.3;
  const y = (Math.random() - 0.5) * FLOW_DOMAIN.h * 1.8;
  return { x, y, history: [{ x, y }] };
}

/* Stable-fluids grid + textured plane visualization */
function FluidField({
  chord,
  aoa,
}: {
  chord: number;
  aoa: number;
}) {
  const V = useAerosimStore((s) => s.V);
  const viz = useAerosimStore((s) => s.viz);
  const verts = useActiveSilhouette();

  const gridRef = useRef<FluidGrid>(makeGrid(FLUID_W, FLUID_H));
  const tex = useRef<THREE.DataTexture>();

  // Lazy-init texture
  if (!tex.current) {
    const data = new Uint8Array(FLUID_W * FLUID_H * 4);
    const t = new THREE.DataTexture(data, FLUID_W, FLUID_H, THREE.RGBAFormat);
    t.needsUpdate = true;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    tex.current = t;
  }

  // Re-stamp obstacle whenever shape changes
  useEffect(() => {
    const g = gridRef.current;
    const placed = placeShape(verts, { x: 0, y: 0 }, chord, aoa);
    // Map world (FLOW_DOMAIN) → grid cells
    const toGrid = (p: { x: number; y: number }) => ({
      x: ((p.x - FLOW_DOMAIN.x) / FLOW_DOMAIN.w) * (FLUID_W - 2) + 1,
      y: ((p.y + FLOW_DOMAIN.h / 2) / FLOW_DOMAIN.h) * (FLUID_H - 2) + 1,
    });
    const poly = placed.map(toGrid);
    stampObstacle(g, poly);
  }, [verts, chord, aoa]);

  useFrame((_, dtRaw) => {
    if (!useAerosimStore.getState().running) return;
    const g = gridRef.current;
    // Roughly match Re by scaling viscosity; cap dt for stability
    const dt = Math.min(0.05, dtRaw) * 1.0;
    const inflow = Math.max(0.2, Math.min(2.0, V / 30));
    fluidStep(g, dt, 5e-5, 1e-4, inflow);

    // Write texture
    const data = tex.current!.image.data as Uint8Array;
    let maxSpd = 1e-6;
    let maxAbsVort = 1e-6;
    for (let j = 0; j < g.H; j++) {
      for (let i = 0; i < g.W; i++) {
        const u = g.u[IX(g.W, i, j)];
        const v = g.v[IX(g.W, i, j)];
        const sp = Math.hypot(u, v);
        if (sp > maxSpd) maxSpd = sp;
        if (viz === 'vorticity') {
          const w = Math.abs(vorticity(g, i, j));
          if (w > maxAbsVort) maxAbsVort = w;
        }
      }
    }
    const norm = (x: number, m: number) => Math.min(1, Math.max(0, x / m));
    for (let j = 0; j < g.H; j++) {
      for (let i = 0; i < g.W; i++) {
        const idx = (j * g.W + i) * 4;
        const k = IX(g.W, i, j);
        if (g.solid[k]) {
          data[idx + 0] = 32;
          data[idx + 1] = 36;
          data[idx + 2] = 44;
          data[idx + 3] = 255;
          continue;
        }
        if (viz === 'streamlines') {
          const sp = Math.hypot(g.u[k], g.v[k]);
          const t = norm(sp, maxSpd);
          data[idx + 0] = Math.floor(40 + 200 * t);
          data[idx + 1] = Math.floor(60 + 60 * (1 - t));
          data[idx + 2] = Math.floor(220 - 180 * t);
          data[idx + 3] = 255;
        } else if (viz === 'vorticity') {
          const w = vorticity(g, i, j);
          const t = w / Math.max(1e-6, maxAbsVort); // -1..1
          const pos = Math.max(0, t);
          const neg = Math.max(0, -t);
          data[idx + 0] = Math.floor(220 * pos + 30);
          data[idx + 1] = Math.floor(30);
          data[idx + 2] = Math.floor(220 * neg + 30);
          data[idx + 3] = 255;
        } else {
          // Pressure ≈ -|v|² (Bernoulli, scaled)
          const sp2 = g.u[k] * g.u[k] + g.v[k] * g.v[k];
          const t = norm(sp2, maxSpd * maxSpd);
          // High pressure: red, low pressure: blue
          data[idx + 0] = Math.floor(30 + 200 * (1 - t));
          data[idx + 1] = 60;
          data[idx + 2] = Math.floor(30 + 200 * t);
          data[idx + 3] = 255;
        }
      }
    }
    tex.current!.needsUpdate = true;
  });

  return (
    <mesh position={[0, 0, -0.02]}>
      <planeGeometry args={[FLOW_DOMAIN.w, FLOW_DOMAIN.h]} />
      <meshBasicMaterial map={tex.current} transparent opacity={0.85} />
    </mesh>
  );
}
