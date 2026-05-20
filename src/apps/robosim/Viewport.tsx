import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useRoboStore } from '@/store/robosimStore';
import { stepRobot, constrainToField, constrainToObstacles } from './physics';
import {
  robot,
  rawInput,
  pieces,
  loadPieces,
  FIELD_BOUNDS as FIELD,
  OBSTACLE_BOXES,
  DEPOSIT_ZONES,
} from './shared';

const ROBOT_RADIUS = 0.42;

export default function Viewport({ frozen = false }: { frozen?: boolean }) {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 6, 9], fov: 55, near: 0.05, far: 200 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      style={{ background: 'transparent' }}
    >
      <color attach="background" args={['#0a0f1e']} />
      <fog attach="fog" args={['#0a0f1e', 22, 48]} />
      <hemisphereLight args={['#aac4ff', '#1a2030', 0.55]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[8, 14, 6]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
      />
      <directionalLight position={[-6, 5, -8]} intensity={0.4} color="#9ec5ff" />

      <Scene frozen={frozen} />
      <CameraRig />
      <OrbitControls
        makeDefault
        enableDamping
        maxPolarAngle={Math.PI * 0.49}
        minDistance={2}
        maxDistance={40}
      />
    </Canvas>
  );
}

function Scene({ frozen }: { frozen: boolean }) {
  const field = useRoboStore((s) => s.field);
  return (
    <>
      <FieldGeometry field={field} />
      <RobotModel frozen={frozen} />
      <GamePieces field={field} />
    </>
  );
}

/* ───────────────────────── Robot ───────────────────────── */

function RobotModel({ frozen }: { frozen: boolean }) {
  const group = useRef<THREE.Group>(null);
  const wheelRefs = useRef<(THREE.Mesh | null)[]>([null, null, null, null]);
  const wheelAngle = useRef<[number, number, number, number]>([0, 0, 0, 0]);

  useFrame((_, dt) => {
    const st = useRoboStore.getState();
    if (st.enabled && st.running && !frozen) {
      // Shift = full throttle override, Ctrl = 30% precision, else slider value
      const effectiveThrottle = rawInput.precision
        ? 0.3
        : rawInput.boost
          ? 1.0
          : st.throttle;
      stepRobot(
        robot,
        st.config,
        {
          drive: rawInput.drive,
          strafe: rawInput.strafe,
          turn: rawInput.turn,
          fieldOriented: st.fieldOriented,
          throttle: effectiveThrottle,
        },
        dt,
      );
      const f = FIELD[st.field];
      constrainToField(robot, f.halfX, f.halfZ, ROBOT_RADIUS);
      if (st.field === 'obstacle') {
        constrainToObstacles(robot, OBSTACLE_BOXES, ROBOT_RADIUS);
      }
    }
    const g = group.current;
    if (g) {
      g.position.set(robot.x, 0, robot.z);
      g.rotation.y = robot.heading;
    }
    for (let i = 0; i < 4; i++) {
      const m = wheelRefs.current[i];
      if (!m) continue;
      wheelAngle.current[i] += ((robot.wheelRpm[i] * 2 * Math.PI) / 60) * dt;
      m.rotation.x = wheelAngle.current[i];
    }
  });

  // Wheel local positions: [front-left, front-right, back-left, back-right]
  const wheelPos: [number, number, number][] = [
    [-0.3, 0.08, 0.26],
    [0.3, 0.08, 0.26],
    [-0.3, 0.08, -0.26],
    [0.3, 0.08, -0.26],
  ];

  return (
    <group ref={group}>
      {/* Chassis */}
      <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.62, 0.14, 0.66]} />
        <meshStandardMaterial color="#1f6feb" metalness={0.5} roughness={0.4} />
      </mesh>
      {/* Bumper */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[0.7, 0.1, 0.74]} />
        <meshStandardMaterial color="#d22" roughness={0.7} />
      </mesh>
      {/* Electronics deck */}
      <mesh position={[0, 0.25, -0.05]} castShadow>
        <boxGeometry args={[0.4, 0.05, 0.34]} />
        <meshStandardMaterial color="#0c3" metalness={0.2} roughness={0.6} />
      </mesh>
      {/* Heading marker */}
      <mesh position={[0, 0.26, 0.3]} castShadow>
        <coneGeometry args={[0.07, 0.16, 4]} />
        <meshStandardMaterial
          color="#ffd23b"
          emissive="#5a4500"
          metalness={0.3}
        />
      </mesh>
      {/* Arm + claw */}
      <Arm />
      {/* Mecanum wheels */}
      {wheelPos.map((p, i) => (
        <group key={i} position={p}>
          <mesh
            ref={(m) => (wheelRefs.current[i] = m)}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.082, 0.082, 0.06, 18]} />
            <meshStandardMaterial
              color="#222"
              metalness={0.4}
              roughness={0.5}
            />
          </mesh>
          {/* roller hints (45° mecanum look) */}
          {Array.from({ length: 8 }).map((_, k) => {
            const a = (k / 8) * Math.PI * 2;
            return (
              <mesh
                key={k}
                position={[
                  0,
                  Math.cos(a) * 0.06,
                  Math.sin(a) * 0.06,
                ]}
                rotation={[0, Math.PI / 4, Math.PI / 2]}
              >
                <cylinderGeometry args={[0.018, 0.018, 0.05, 6]} />
                <meshStandardMaterial color="#888" metalness={0.6} />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}

function Arm() {
  const held = useRoboStore((s) => s.heldPieces);
  return (
    <group position={[0, 0.3, 0.18]}>
      <mesh position={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[0.06, 0.36, 0.06]} />
        <meshStandardMaterial color="#555" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.36, 0.12]} castShadow>
        <boxGeometry args={[0.18, 0.05, 0.22]} />
        <meshStandardMaterial color="#333" metalness={0.6} />
      </mesh>
      {held > 0 && (
        <mesh position={[0, 0.36, 0.2]} castShadow>
          <boxGeometry args={[0.14, 0.14, 0.14]} />
          <meshStandardMaterial
            color="#9b59ff"
            emissive="#2a0a55"
            roughness={0.4}
          />
        </mesh>
      )}
    </group>
  );
}

/* ───────────────────────── Field ───────────────────────── */

function FieldGeometry({ field }: { field: 'frc' | 'open' | 'obstacle' }) {
  const f = FIELD[field];
  return (
    <>
      {/* Carpet */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[f.halfX * 2, f.halfZ * 2]} />
        <meshStandardMaterial color="#161b2c" roughness={0.95} />
      </mesh>
      <Grid
        args={[f.halfX * 2, f.halfZ * 2]}
        cellSize={0.6}
        cellColor="#23304d"
        sectionSize={3}
        sectionColor="#3a4d7a"
        fadeDistance={40}
        position={[0, 0.002, 0]}
      />
      <Walls halfX={f.halfX} halfZ={f.halfZ} />
      {field === 'frc' && <FrcField halfX={f.halfX} halfZ={f.halfZ} />}
      {field === 'obstacle' && <Obstacles />}
      {field !== 'frc' && <DepositZone field={field} />}
    </>
  );
}

function Walls({ halfX, halfZ }: { halfX: number; halfZ: number }) {
  const mat = (
    <meshStandardMaterial color="#2b3a5c" metalness={0.3} roughness={0.7} />
  );
  const h = 0.5;
  return (
    <>
      <mesh position={[0, h / 2, halfZ]} castShadow receiveShadow>
        <boxGeometry args={[halfX * 2 + 0.2, h, 0.1]} />
        {mat}
      </mesh>
      <mesh position={[0, h / 2, -halfZ]} castShadow receiveShadow>
        <boxGeometry args={[halfX * 2 + 0.2, h, 0.1]} />
        {mat}
      </mesh>
      <mesh position={[halfX, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.1, h, halfZ * 2]} />
        {mat}
      </mesh>
      <mesh position={[-halfX, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.1, h, halfZ * 2]} />
        {mat}
      </mesh>
    </>
  );
}

function FrcField({ halfX, halfZ }: { halfX: number; halfZ: number }) {
  return (
    <>
      {/* Alliance zones */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[-halfX + 1.5, 0.003, 0]}
      >
        <planeGeometry args={[3, halfZ * 2]} />
        <meshStandardMaterial
          color="#d22"
          transparent
          opacity={0.12}
          roughness={1}
        />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[halfX - 1.5, 0.003, 0]}
      >
        <planeGeometry args={[3, halfZ * 2]} />
        <meshStandardMaterial
          color="#2a6cff"
          transparent
          opacity={0.12}
          roughness={1}
        />
      </mesh>
      {/* Charge-station platform */}
      <mesh position={[0, 0.13, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.16, 1.9]} />
        <meshStandardMaterial
          color="#2a3a5c"
          metalness={0.5}
          roughness={0.4}
        />
      </mesh>
      {/* Scoring nodes per alliance */}
      <ScoringGrid x={-halfX + 1.4} color="#e0484c" />
      <ScoringGrid x={halfX - 1.4} color="#3a74e0" />
    </>
  );
}

function ScoringGrid({ x, color }: { x: number; color: string }) {
  const heights = [0.4, 0.7, 1.05];
  return (
    <group>
      {[-1.4, 0, 1.4].map((z) =>
        heights.map((hgt, r) => (
          <mesh key={`${z}-${r}`} position={[x, hgt / 2, z]} castShadow>
            <cylinderGeometry args={[0.03, 0.03, hgt, 8]} />
            <meshStandardMaterial color={color} metalness={0.6} />
          </mesh>
        )),
      )}
    </group>
  );
}

// Full obstacle block specs: [x, halfHeight, z, fullWidth, fullDepth]
// halfWidth = fullWidth/2 = ObstacleBox.halfW; halfDepth = fullDepth/2 = ObstacleBox.halfD
const OBSTACLE_BLOCKS: [number, number, number, number, number][] = [
  [-3, 0.4, -2, 1.2, 0.8],
  [3, 0.3, 2, 0.6, 1.4],
  [3.5, 0.5, -3, 1.6, 0.4],
  [-3.5, 0.35, 3, 0.7, 1.2],
  [0, 0.25, 0, 1.0, 1.0],
];

function Obstacles() {
  return (
    <>
      {OBSTACLE_BLOCKS.map(([bx, by, bz, bw, bd], i) => (
        <mesh key={i} position={[bx, by, bz]} castShadow receiveShadow>
          <boxGeometry args={[bw, by * 2, bd]} />
          <meshStandardMaterial color="#4a5a7a" metalness={0.3} roughness={0.7} />
        </mesh>
      ))}
    </>
  );
}

function DepositZone({ field }: { field: string }) {
  const zone = DEPOSIT_ZONES[field];
  if (!zone) return null;
  const { x, z, halfW, halfD } = zone;
  // Border: four thin strips around the perimeter
  const t = 0.06;
  return (
    <group position={[x, 0.004, z]}>
      {/* Fill */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[halfW * 2, halfD * 2]} />
        <meshStandardMaterial color="#22c55e" transparent opacity={0.18} roughness={1} />
      </mesh>
      {/* Border strips */}
      {[
        [0, 0, -(halfD - t / 2), halfW * 2, t],
        [0, 0, halfD - t / 2, halfW * 2, t],
        [-(halfW - t / 2), 0, 0, t, halfD * 2],
        [halfW - t / 2, 0, 0, t, halfD * 2],
      ].map(([bx, , bz, bw, bd], i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[bx, 0.001, bz]}>
          <planeGeometry args={[bw, bd]} />
          <meshStandardMaterial color="#22c55e" transparent opacity={0.7} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function GamePieces({ field }: { field: 'frc' | 'open' | 'obstacle' }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  // Rebuild the shared piece set synchronously when the field changes so the
  // gameplay loop and the rendered meshes stay in lock-step.
  useMemo(() => loadPieces(field), [field]);

  useFrame(() => {
    for (let i = 0; i < pieces.length; i++) {
      const g = refs.current[i];
      if (g) g.visible = !pieces[i].collected;
    }
  });

  // `pieces` was populated synchronously by loadPieces in the same render
  // cycle the field changed; key by field so React remounts the set.
  return (
    <group key={field}>
      {pieces.map((p, i) => (
        <group
          key={i}
          ref={(g) => (refs.current[i] = g)}
          position={[p.x, 0, p.z]}
        >
          {p.kind === 'cone' ? (
            <mesh position={[0, 0.11, 0]} castShadow>
              <coneGeometry args={[0.07, 0.22, 14]} />
              <meshStandardMaterial color="#ff8c1a" roughness={0.5} />
            </mesh>
          ) : (
            <mesh position={[0, 0.08, 0]} castShadow>
              <boxGeometry args={[0.14, 0.14, 0.14]} />
              <meshStandardMaterial color="#9b59ff" roughness={0.4} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

/* ───────────────────────── Camera ───────────────────────── */

function CameraRig() {
  const mode = useRoboStore((s) => s.camera);
  const { camera } = useThree();
  const controls = useThree(
    (s) => s.controls as unknown as { enabled: boolean } | null,
  );
  const tmp = useRef(new THREE.Vector3());

  useFrame(() => {
    const orbit = mode === 'orbit';
    if (controls) controls.enabled = orbit;
    if (orbit) return;

    const h = robot.heading;
    if (mode === 'chase') {
      const back = tmp.current.set(
        robot.x - Math.sin(h) * 5,
        3.2,
        robot.z - Math.cos(h) * 5,
      );
      camera.position.lerp(back, 0.12);
      camera.lookAt(robot.x, 0.4, robot.z);
    } else if (mode === 'fpv') {
      camera.position.set(
        robot.x + Math.sin(h) * 0.15,
        0.55,
        robot.z + Math.cos(h) * 0.15,
      );
      camera.lookAt(
        robot.x + Math.sin(h) * 4,
        0.45,
        robot.z + Math.cos(h) * 4,
      );
    } else if (mode === 'overhead') {
      camera.position.lerp(tmp.current.set(robot.x, 14, robot.z + 0.01), 0.1);
      camera.lookAt(robot.x, 0, robot.z);
    }
  });
  return null;
}
