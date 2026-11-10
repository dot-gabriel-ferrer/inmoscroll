const BUCKETS = 65536;

export interface SortScratch {
  counts: Uint32Array;
  keys: Uint16Array;
}

export function createSortScratch(count: number): SortScratch {
  return { counts: new Uint32Array(BUCKETS), keys: new Uint16Array(count) };
}

/**
 * Back-to-front ordering for alpha blending: a counting sort over view-space depth
 * quantised to 16 bits. `direction` is the third row of the model-view matrix, so
 * `dot(direction, centre)` is view-space z up to a constant (more negative = farther).
 */
export function sortSplatsBackToFront(
  positions: Float32Array,
  count: number,
  dx: number,
  dy: number,
  dz: number,
  out: Uint32Array,
  scratch: SortScratch,
): Uint32Array {
  if (count === 0) return out;
  const { counts, keys } = scratch;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < count; i++) {
    const depth = positions[i * 3] * dx + positions[i * 3 + 1] * dy + positions[i * 3 + 2] * dz;
    if (depth < min) min = depth;
    if (depth > max) max = depth;
  }
  const scale = max > min ? (BUCKETS - 1) / (max - min) : 0;
  counts.fill(0);
  for (let i = 0; i < count; i++) {
    const depth = positions[i * 3] * dx + positions[i * 3 + 1] * dy + positions[i * 3 + 2] * dz;
    const key = ((depth - min) * scale) | 0;
    keys[i] = key;
    counts[key]++;
  }
  let total = 0;
  for (let b = 0; b < BUCKETS; b++) {
    const c = counts[b];
    counts[b] = total;
    total += c;
  }
  for (let i = 0; i < count; i++) out[counts[keys[i]]++] = i;
  return out;
}
