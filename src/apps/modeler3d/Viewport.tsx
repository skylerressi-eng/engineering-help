import { Canvas, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  TransformControls,
  Grid,
  GizmoHelper,
  GizmoViewport,
} from '@react-three/drei';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const selectedId = useModelerStore((s) => s.selectedId);
  const transformMode = useModelerStore((s) => s.transformMode);
  const select = useModelerStore((s) => s.select);
  const setTransform = useModelerStore((s) => s.setTransform);
  const { camera, gl } = useThree();

  // The actual THREE.Mesh of the selected object, held in state. It is only
  // updated when it genuinely changes, so this reaches a fixed point instead
  // of the old ref-Map + counter "bump" that re-rendered forever.
  const [selectedMesh, setSelectedMesh] = useState<THREE.Mesh | null>(null);

  const reportMesh = useCallback(
    (id: string, mesh: THREE.Mesh | null) => {
      setSelectedMesh((prev) => {
        // Only the currently-selected object owns the gizmo.
        if (id !== useModelerStore.getState().selectedId) return prev;
        return prev === mesh ? prev : mesh;
      });
    },
    [],
  );

  // If the selection changed to something that didn't re-mount (or to nothing),
  // clear a stale mesh so the gizmo detaches.
  useEffect(() => {
    if (!selectedId) setSelectedMesh(null);
  }, [selectedId]);

  return (
    <>
      {objects.map((o) => (
        <Obj
          key={o.id}
          obj={o}
          selected={o.id === selectedId}
          onClick={() => select(o.id)}
          reportMesh={reportMesh}
        />
      ))}
      {selectedId && selectedMesh && (
        <TransformControls
          // eslint-disable-next-line react/no-unknown-property
          object={selectedMesh}
          mode={transformMode}
          camera={camera}
          domElement={gl.domElement}
          onObjectChange={() => {
            const mesh = selectedMesh;
            if (!mesh) return;
            setTransform(selectedId, {
              position: [mesh.position.x, mesh.position.y, mesh.position.z],
              rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
              scale: [mesh.scale.x, mesh.scale.y, mesh.scale.z],
            });
          }}
        />
      )}
    </>
  );
}

function Obj({
  obj,
  selected,
  onClick,
  reportMesh,
}: {
  obj: SceneObject;
  selected: boolean;
  onClick: () => void;
  reportMesh: (id: string, mesh: THREE.Mesh | null) => void;
}) {
  const isSelected = selected;
  const meshRef = useRef<THREE.Mesh>(null);

  // When this object is the selected one, hand its mesh up to the parent so
  // the gizmo can attach. This runs on mount and whenever selection toggles —
  // not on every render — so it converges instead of looping.
  useEffect(() => {
    if (selected) reportMesh(obj.id, meshRef.current);
  }, [selected, obj.id, reportMesh]);

  // Apply modifier stack only when geometry or modifiers change
  const geom = useMemo(() => {
    if (!obj.modifiers.length) return obj.geometry;
    return applyStack(obj.geometry, obj.modifiers);
  }, [obj.geometry, obj.modifiers]);

  // Dispose previously generated geometries when this one changes
  useEffect(() => {
    return () => {
      if (geom !== obj.geometry) geom.dispose();
    };
  }, [geom, obj.geometry]);

  return (
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
        onClick();
      }}
    >
      <meshStandardMaterial
        color={obj.color}
        metalness={obj.metalness}
        roughness={obj.roughness}
        emissive={obj.emissive}
        emissiveIntensity={obj.emissive === '#000000' ? 0 : 0.5}
        wireframe={obj.wireframe}
      />
      {isSelected && (
        // eslint-disable-next-line react/no-unknown-property
        <meshBasicMaterial attach="material" wireframe color="#0A84FF" transparent opacity={0.0} />
      )}
    </mesh>
  );
}
