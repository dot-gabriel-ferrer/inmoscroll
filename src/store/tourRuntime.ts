import { type Object3D, Vector3 } from 'three';

/**
 * Per-frame values shared between scene components. Kept outside React state on
 * purpose: they change every rendered frame and must never trigger re-renders.
 */
export const tourRuntime = {
  /** 0..1 weight of the active chapter's point of interest. */
  focus: 0,
  focusPoint: new Vector3(),
  /** Opaque meshes that can hide annotations. */
  occluders: [] as Object3D[],
  /** False while the scene still owes a frame for the current camera (a splat re-sort in flight). */
  settled: () => true as boolean,
};
