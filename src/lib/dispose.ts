import type { Material, Object3D, Texture } from 'three';

type Disposable = { dispose?: () => void };

function disposeMaterial(material: Material) {
  for (const value of Object.values(material)) {
    if (value && typeof value === 'object' && (value as Texture).isTexture) (value as Texture).dispose();
  }
  material.dispose();
}

/**
 * Deterministically frees every GPU resource reachable from `root`. JavaScript garbage
 * collection never releases VRAM, so tours must call this when they unmount.
 */
export function disposeObject3D(root: Object3D) {
  root.traverse((object) => {
    const mesh = object as Object3D & { geometry?: Disposable; material?: Material | Material[] };
    mesh.geometry?.dispose?.();
    if (Array.isArray(mesh.material)) mesh.material.forEach(disposeMaterial);
    else if (mesh.material) disposeMaterial(mesh.material);
  });
}
