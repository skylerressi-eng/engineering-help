import { Canvas } from '@react-three/fiber';
import {
  OrbitControls,
  TransformControls,
  Grid,
  GizmoHelper,
  GizmoViewport,
} from '@react-three/drei';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useModelerStore, type SceneObject } from '@/store/modelerStore';
import { applyStack } from '@/lib/modeler/modifiers';

export default function ModelerViewport() {
  return (
    <Canvas
      camera={{ position: [4, 3.5, 5], fov: 50, near: 0.05, far: 200 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      shadows
    >
      <color attach="background" args={['#0b1020']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[6, 10, 5]} intensity={1.4} castShadow />
      <directionalLight position={[-4, 6, -6]} intensity={0.6} />
      <directionalLight position={[0, -4, 4]} intensity={0.25} />

      <SceneObjects />

      <Grid
        args={[20, 20]}
        cellColor="#1f2937"
        sectionColor="#334155"
        sectionThickness={1}
        cellThickness={0.6}
        fadeDistance={36}
        infiniteGrid
      />
      <OrbitControls makeDefault enableDamping />
      <GizmoHelper alignment="top-right" margin={[60, 50]}>
        <GizmoViewport axisColors={['#ef4444', '#22c55e', '#0ea5e9']} labelColor="white" />
      </GizmoHelper>
    </Canvas>
  );
}

function SceneObjects() {
  const objects = useModelerStore((s) => s.objects);

  return (
    <>
      {objects.map((o) => (
        <Obj key={o.id} obj={o} />
      ))}
    </>
  );
}

/**
 * Renders one scene object as a mesh. Subscribes directly to the store for
 * `selected` and `transformMode` so that only the affected Obj re-renders on
 * selection change. Does NOT use useThree — instead lets drei's TransformControls
 * manage its own camera/domElement subscriptions internally, which avoids
 * subscribing this component to the full R3F state.
 */
const Obj = React.memo(function Obj({ obj }: { obj: SceneObject }) {
  const selected = useModelerStore((s) => s.selectedId === obj.id);
  const transformMode = useModelerStore((s) => s.transformMode);
  const meshRef = useRef<THREE.Mesh>(null);

  const geom = useMemo(() => {
    if (!obj.modifiers.length) return obj.geometry;
    return applyStack(obj.geometry, obj.modifiers);
  }, [obj.geometry, obj.modifiers]);

  useEffect(() => {
    return () => {
      if (geom !== obj.geometry) geom.dispose();
    };
  }, [geom, obj.geometry]);

  const handleTransform = useCallback(() => {
    const m = meshRef.current;
    if (!m) return;
    useModelerStore.getState().setTransform(obj.id, {
      position: [m.position.x, m.position.y, m.position.z],
      rotation: [m.rotation.x, m.rotation.y, m.rotation.z],
      scale: [m.scale.x, m.scale.y, m.scale.z],
    });
  }, [obj.id]);

  return (
    <>
      <mesh
        ref={meshRef}
        geometry={geom}
        position={obj.position}
        rotation={obj.rotation}
        scale={obj.scale}
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          useModelerStore.getState().select(obj.id);
        }}
      >
        <meshStandardMaterial
          color={obj.color}
          metalness={obj.metalness}
          roughness={obj.roughness}
          emissive={selected ? '#0A84FF' : obj.emissive}
          emissiveIntensity={selected ? 0.15 : (obj.emissive === '#000000' ? 0 : 0.5)}
          wireframe={obj.wireframe}
        />
      </mesh>
      {selected && (
        <TransformControls
          object={meshRef as React.MutableRefObject<THREE.Object3D>}
          mode={transformMode}
          onObjectChange={handleTransform}
        />
      )}
    </>
  );
});
