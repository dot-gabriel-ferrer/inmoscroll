import { type Camera, Raycaster, Vector3 } from 'three';
import { tourRuntime } from '@/store/tourRuntime';

/** Markers closer than this to a surface are considered to sit on it, not behind it. */
const SURFACE_TOLERANCE = 0.12;

const direction = new Vector3();
const forward = new Vector3();

export function createOcclusionRaycaster(): Raycaster {
  const raycaster = new Raycaster();
  // Honoured by the BVH the model is wrapped in.
  (raycaster as Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;
  return raycaster;
}

/** True when `point` is behind the camera, far off-axis or hidden by opaque geometry. */
export function isOccluded(camera: Camera, point: Vector3, raycaster: Raycaster): boolean {
  camera.getWorldDirection(forward);
  direction.copy(point).sub(camera.position);
  const distance = direction.length();
  direction.divideScalar(distance || 1);
  if (direction.dot(forward) < 0.2) return true;
  if (tourRuntime.occluders.length === 0) return false;
  raycaster.set(camera.position, direction);
  raycaster.near = 0;
  raycaster.far = Math.max(0, distance - SURFACE_TOLERANCE);
  return raycaster.intersectObjects(tourRuntime.occluders, false).length > 0;
}
