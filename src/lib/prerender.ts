import manifest from '@/data/prerender-manifest.json';
import type { TimeOfDay } from '@/types/tour';
import { publicUrl } from './assets';

/** Landscape frames serve wide viewports; portrait ones are framed for phones held upright. */
export type FrameVariant = 'landscape' | 'portrait';

/** A tour rendered ahead of time (`npm run assets:prerender`) into one image per scroll step. */
export interface Prerender {
  /** Frames per sequence, evenly spaced over scroll progress 0..1. */
  frames: number;
  times: TimeOfDay[];
  variants: Record<FrameVariant, { width: number; height: number }>;
  /** Changes whenever the frames are regenerated; busts caches. */
  version: string;
}

/** Marker placement baked next to the frames: per frame, `x, y, visible` (0..1, 0..1, 0|1) per annotation of the active chapter. */
export interface PrerenderMarkers {
  frames: number[][];
}

export function getPrerender(tourId: string): Prerender | undefined {
  return (manifest as Record<string, Prerender>)[tourId];
}

export function frameIndexAt(progress: number, frames: number): number {
  return Math.min(frames - 1, Math.max(0, Math.round(progress * (frames - 1))));
}

export function frameUrl(tourId: string, prerender: Prerender, variant: FrameVariant, time: TimeOfDay, index: number): string {
  const file = String(index).padStart(4, '0');
  return publicUrl(`/prerender/${tourId}/${variant}-${time}/${file}.webp?v=${prerender.version}`);
}

export function markersUrl(tourId: string, prerender: Prerender, variant: FrameVariant): string {
  return publicUrl(`/prerender/${tourId}/${variant}.json?v=${prerender.version}`);
}

/**
 * Download order for a whole sequence: every 16th frame first, then the gaps at ever
 * finer strides. Any scroll position has a nearby frame long before all have arrived.
 */
export function refinementOrder(count: number): number[] {
  const order: number[] = [];
  const seen = new Uint8Array(count);
  for (let stride = 16; stride >= 1; stride >>= 1) {
    for (let i = 0; i < count; i += stride) {
      if (seen[i]) continue;
      seen[i] = 1;
      order.push(i);
    }
  }
  return order;
}

/** Index of the loaded frame closest to `target` (earlier one on ties), or -1 if none has loaded. */
export function nearestLoaded(loaded: ArrayLike<number>, target: number): number {
  for (let distance = 0; distance < loaded.length; distance++) {
    if (target - distance >= 0 && loaded[target - distance]) return target - distance;
    if (target + distance < loaded.length && loaded[target + distance]) return target + distance;
  }
  return -1;
}
