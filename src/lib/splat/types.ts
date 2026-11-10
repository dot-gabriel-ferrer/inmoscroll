/** Decoded Gaussian splat cloud, independent of the container it came from. */
export interface SplatData {
  count: number;
  /** xyz per splat. */
  positions: Float32Array;
  /** Linear (not log) xyz standard deviations per splat. */
  scales: Float32Array;
  /** Unit quaternions, xyzw per splat. */
  rotations: Float32Array;
  /** Display-referred RGBA, 8 bits per channel. */
  colors: Uint8Array;
}

export type SplatFormat = 'spz' | 'ksplat' | 'splat';

export function allocSplatData(count: number): SplatData {
  return {
    count,
    positions: new Float32Array(count * 3),
    scales: new Float32Array(count * 3),
    rotations: new Float32Array(count * 4),
    colors: new Uint8Array(count * 4),
  };
}

export function detectSplatFormat(url: string): SplatFormat {
  const path = url.split(/[?#]/)[0].toLowerCase();
  if (path.endsWith('.spz')) return 'spz';
  if (path.endsWith('.ksplat')) return 'ksplat';
  if (path.endsWith('.splat')) return 'splat';
  throw new Error(`Unsupported splat format: ${path.slice(path.lastIndexOf('/') + 1)}`);
}

/** Splats per texture row; the data texture is twice as wide (two texels per splat). */
export const SPLATS_PER_ROW = 1024;

export type SplatWorkerRequest =
  | { type: 'load'; url: string }
  | { type: 'sort'; direction: [number, number, number]; recycle?: Uint32Array };

export type SplatWorkerResponse =
  | { type: 'progress'; loaded: number; total: number }
  | {
      type: 'loaded';
      count: number;
      texture: Uint32Array;
      width: number;
      height: number;
      boundsMin: [number, number, number];
      boundsMax: [number, number, number];
    }
  | { type: 'sorted'; order: Uint32Array }
  | { type: 'error'; message: string };
