/**
 * Off-screen thumbnail renderer. One shared WebGL context snapshots a
 * BufferGeometry to a PNG data URL so the parts grid can show the real model
 * (not a placeholder glyph) without spinning up dozens of live <Canvas>es.
 * Results are cached by key.
 */
import * as THREE from 'three';

const SIZE = 220;
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;

function ensure(): {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
} {
  if (!renderer) {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(SIZE, SIZE, false);

    scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(5, 8, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9ec5ff, 0.5);
    fill.position.set(-5, 2, -4);
    scene.add(fill);

    camera = new THREE.PerspectiveCamera(32, 1, 0.01, 1000);
  }
  return { renderer: renderer!, scene: scene!, camera: camera! };
}

/** Render `geometry` to a PNG data URL, caching the result under `key`. */
export function renderThumbnail(
  key: string,
  geometry: THREE.BufferGeometry,
  color = '#9aa6b8',
): string {
  const hit = cache.get(key);
  if (hit) return hit;

  const { renderer, scene, camera } = ensure();
  const mat = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.5,
    roughness: 0.4,
  });
  const mesh = new THREE.Mesh(geometry, mat);

  // Centre + frame the mesh using its bounding sphere.
  geometry.computeBoundingSphere();
  const bs = geometry.boundingSphere;
  if (bs) {
    mesh.position.set(-bs.center.x, -bs.center.y, -bs.center.z);
    const r = Math.max(bs.radius, 1e-3);
    const dist = r / Math.sin((camera.fov * Math.PI) / 180 / 2);
    camera.position.set(dist * 0.8, dist * 0.65, dist * 0.95);
    camera.lookAt(0, 0, 0);
    camera.near = dist * 0.05;
    camera.far = dist * 6;
    camera.updateProjectionMatrix();
  }

  scene.add(mesh);
  renderer.render(scene, camera);
  scene.remove(mesh);
  mat.dispose();

  const url = renderer.domElement.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

/** Async wrapper that yields to the event loop so the grid stays responsive. */
export function getThumbnail(
  key: string,
  buildGeometry: () => THREE.BufferGeometry,
  color?: string,
): Promise<string> {
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(key);
  if (inflight) return inflight;

  const p = new Promise<string>((resolve) => {
    requestAnimationFrame(() => {
      try {
        const geom = buildGeometry();
        const url = renderThumbnail(key, geom, color);
        geom.dispose();
        resolve(url);
      } catch {
        resolve('');
      } finally {
        pending.delete(key);
      }
    });
  });
  pending.set(key, p);
  return p;
}
