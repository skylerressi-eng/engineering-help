/**
 * Robust mesh-file importer shared by Modeler3D, PhysicsBench and AeroSim.
 *
 * Uses three.js' official loaders (STL/OBJ/PLY/GLTF/GLB/3MF/DAE/FBX) instead
 * of the previous hand-rolled OBJ/STL parsers, which silently produced empty
 * or NaN geometry on most real CAD exports and made three throw
 * "Computed radius is NaN" downstream.
 *
 * Every result is flattened to a single non-indexed position-only
 * BufferGeometry, stripped of NaN/degenerate triangles, recentred on the
 * origin and uniformly scaled to a sane size so it is always visible.
 */
import * as THREE from 'three';

export const IMPORT_ACCEPT = '.obj,.stl,.ply,.gltf,.glb,.3mf,.dae,.fbx';

const SUPPORTED = ['obj', 'stl', 'ply', 'gltf', 'glb', '3mf', 'dae', 'fbx'];

function collectPositions(root: THREE.Object3D): number[] {
  const out: number[] = [];
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    let g = mesh.geometry as THREE.BufferGeometry;
    if (g.index) g = g.toNonIndexed();
    const pos = g.getAttribute('position') as
      | THREE.BufferAttribute
      | undefined;
    if (!pos) return;
    const m = mesh.matrixWorld;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      out.push(v.x, v.y, v.z);
    }
  });
  return out;
}

function finalize(positionsIn: number[]): THREE.BufferGeometry {
  // Drop any triangle containing a non-finite coordinate.
  const positions: number[] = [];
  for (let i = 0; i + 8 < positionsIn.length; i += 9) {
    let ok = true;
    for (let k = 0; k < 9; k++) {
      if (!Number.isFinite(positionsIn[i + k])) {
        ok = false;
        break;
      }
    }
    if (ok) for (let k = 0; k < 9; k++) positions.push(positionsIn[i + k]);
  }
  if (positions.length < 9) {
    throw new Error('No usable triangle geometry in that file.');
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  g.computeBoundingBox();
  const box = g.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  // Recentre on origin and scale the longest axis to ~2 world units.
  const s = 2 / maxDim;
  g.translate(-center.x, -center.y, -center.z);
  g.scale(s, s, s);
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

async function objectFromFile(
  ext: string,
  file: File,
): Promise<THREE.Object3D | THREE.BufferGeometry> {
  if (ext === 'stl') {
    const { STLLoader } = await import(
      'three/examples/jsm/loaders/STLLoader.js'
    );
    return new STLLoader().parse(await file.arrayBuffer());
  }
  if (ext === 'obj') {
    const { OBJLoader } = await import(
      'three/examples/jsm/loaders/OBJLoader.js'
    );
    return new OBJLoader().parse(await file.text());
  }
  if (ext === 'ply') {
    const { PLYLoader } = await import(
      'three/examples/jsm/loaders/PLYLoader.js'
    );
    return new PLYLoader().parse(await file.arrayBuffer());
  }
  if (ext === '3mf') {
    const { ThreeMFLoader } = await import(
      'three/examples/jsm/loaders/3MFLoader.js'
    );
    return new ThreeMFLoader().parse(await file.arrayBuffer());
  }
  if (ext === 'dae') {
    const { ColladaLoader } = await import(
      'three/examples/jsm/loaders/ColladaLoader.js'
    );
    return new ColladaLoader().parse(await file.text(), '').scene;
  }
  if (ext === 'fbx') {
    const { FBXLoader } = await import(
      'three/examples/jsm/loaders/FBXLoader.js'
    );
    return new FBXLoader().parse(await file.arrayBuffer(), '');
  }
  // gltf / glb
  const { GLTFLoader } = await import(
    'three/examples/jsm/loaders/GLTFLoader.js'
  );
  const buf = await file.arrayBuffer();
  const loader = new GLTFLoader();
  return await new Promise<THREE.Object3D>((resolve, reject) => {
    loader.parse(
      buf,
      '',
      (gltf) => resolve(gltf.scene),
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
    );
  });
}

/**
 * Load any supported mesh file into a clean, centred, sanely-scaled
 * position-only BufferGeometry. Throws a human-readable Error on failure.
 */
export async function loadMeshFile(
  file: File,
): Promise<THREE.BufferGeometry> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (!SUPPORTED.includes(ext)) {
    throw new Error(
      `Unsupported format ".${ext}". Use one of: ${SUPPORTED.join(', ')}.`,
    );
  }
  let result: THREE.Object3D | THREE.BufferGeometry;
  try {
    result = await objectFromFile(ext, file);
  } catch (e) {
    throw new Error(
      `Could not parse ${file.name}: ${(e as Error).message || 'unknown error'}`,
    );
  }
  let positions: number[];
  if ((result as THREE.BufferGeometry).isBufferGeometry) {
    const mesh = new THREE.Mesh(result as THREE.BufferGeometry);
    positions = collectPositions(mesh);
  } else {
    positions = collectPositions(result as THREE.Object3D);
  }
  return finalize(positions);
}
