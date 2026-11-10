import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodeKsplat } from './decodeKsplat';
import { decodeSplat } from './decodeSplat';
import { decodeSpz, gunzip } from './decodeSpz';
import { fromHalf, toHalf } from './halfFloat';
import { packSplats } from './pack';
import { createSortScratch, sortSplatsBackToFront } from './sort';
import { allocSplatData, detectSplatFormat, SPLATS_PER_ROW, type SplatData } from './types';

const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '__fixtures__', name)));

/** Index splats by their RGBA bytes so clouds can be compared regardless of order. */
function byColor(data: SplatData) {
  const map = new Map<string, number>();
  for (let i = 0; i < data.count; i++) map.set(data.colors.subarray(i * 4, i * 4 + 4).join(','), i);
  return map;
}

describe('half floats', () => {
  it('round-trips representable values', () => {
    for (const value of [0, 1, -1, 0.5, -0.25, 1024, 65504, 2 ** -14, 2 ** -24]) {
      expect(fromHalf(toHalf(value))).toBe(value);
    }
  });

  it('flushes values below the subnormal range to zero and saturates overflow', () => {
    expect(fromHalf(toHalf(1e-12))).toBe(0);
    expect(fromHalf(toHalf(1e9))).toBe(Infinity);
  });

  it('keeps ~3 significant digits', () => {
    expect(fromHalf(toHalf(0.1234))).toBeCloseTo(0.1234, 3);
  });
});

describe('detectSplatFormat', () => {
  it('uses the file extension and ignores query strings', () => {
    expect(detectSplatFormat('/assets/a.spz?v=abc')).toBe('spz');
    expect(detectSplatFormat('https://cdn.example/x/B.KSPLAT')).toBe('ksplat');
    expect(detectSplatFormat('scene.splat#frag')).toBe('splat');
    expect(() => detectSplatFormat('scene.ply')).toThrow(/Unsupported/);
  });
});

describe('decodeKsplat', () => {
  // Fixtures were written by the reference implementation (@mkkellogg/gaussian-splats-3d)
  // from sample.splat, so the plain .splat decode is the ground truth.
  const truth = decodeSplat(fixture('sample.splat'));
  const truthByColor = byColor(truth);

  it.each([
    [0, 1e-5],
    [1, 2e-3],
    [2, 2e-3],
  ])('decodes compression level %i', (level, tolerance) => {
    const data = decodeKsplat(fixture(`sample-l${level}.ksplat`));
    expect(data.count).toBe(truth.count);
    for (let i = 0; i < data.count; i++) {
      const j = truthByColor.get(data.colors.subarray(i * 4, i * 4 + 4).join(','));
      expect(j).toBeDefined();
      const t = j as number;
      let dot = 0;
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(data.positions[i * 3 + k] - truth.positions[t * 3 + k])).toBeLessThan(tolerance);
        expect(Math.abs(data.scales[i * 3 + k] / truth.scales[t * 3 + k] - 1)).toBeLessThan(tolerance);
      }
      for (let k = 0; k < 4; k++) dot += data.rotations[i * 4 + k] * truth.rotations[t * 4 + k];
      expect(Math.abs(dot)).toBeGreaterThan(0.9999);
    }
  });

  it('rejects truncated and foreign files', () => {
    expect(() => decodeKsplat(new Uint8Array(100))).toThrow(/too small/);
    expect(() => decodeKsplat(fixture('sample-l1.ksplat').subarray(0, 9000))).toThrow(/truncated/);
  });
});

describe('decodeSpz', () => {
  it('decodes the demo capture', async () => {
    const file = readFileSync(join(__dirname, '../../../public/assets/atico-mirador.spz'));
    const data = decodeSpz(await gunzip(file));
    expect(data.count).toBeGreaterThan(100_000);
    let opaque = 0;
    for (let i = 0; i < data.count; i += 97) {
      const [x, y, z, w] = data.rotations.subarray(i * 4, i * 4 + 4);
      expect(Math.hypot(x, y, z, w)).toBeCloseTo(1, 1);
      expect(data.scales[i * 3]).toBeGreaterThan(0);
      expect(Number.isFinite(data.positions[i * 3])).toBe(true);
      if (data.colors[i * 4 + 3] > 200) opaque++;
    }
    expect(opaque).toBeGreaterThan(1000);
  });

  it('decodes version 3 smallest-three rotations', async () => {
    // One splat at (1, -2, 0.5), scale e^-2, with rotation (x, y, z, w) = (0.5, -0.5, 0.5, 0.5).
    const bytes = new Uint8Array(16 + 9 + 1 + 3 + 3 + 4);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x5053474e, true);
    view.setUint32(4, 3, true);
    view.setUint32(8, 1, true);
    bytes[13] = 12;
    [1, -2, 0.5].forEach((v, k) => {
      const fixed = Math.round(v * 4096) & 0xffffff;
      bytes.set([fixed & 0xff, (fixed >> 8) & 0xff, (fixed >> 16) & 0xff], 16 + k * 3);
    });
    bytes[25] = 255;
    bytes.set([128, 128, 128], 26);
    bytes.set([128, 128, 128], 29);
    // Largest component index 3 (w) dropped; x, y, z stored low-to-high as z, y, x.
    const mag = Math.round((0.5 / Math.SQRT1_2) * 511);
    const comp = (v: number) => mag | (v < 0 ? 1 << 9 : 0);
    const packed = ((3 << 30) | (comp(0.5) << 20) | (comp(-0.5) << 10) | comp(0.5)) >>> 0;
    view.setUint32(32, packed, true);

    const data = decodeSpz(await gunzip(gzipSync(bytes)));
    expect(Array.from(data.positions)).toEqual([1, -2, 0.5]);
    expect(data.scales[0]).toBeCloseTo(Math.exp(-2), 5);
    expect(data.colors[3]).toBe(255);
    const expected = [0.5, -0.5, 0.5, 0.5];
    expected.forEach((v, k) => expect(data.rotations[k]).toBeCloseTo(v, 2));
  });

  it('rejects bad input', () => {
    expect(() => decodeSpz(new Uint8Array(4))).toThrow(/too small/);
    expect(() => decodeSpz(new Uint8Array(32))).toThrow(/magic/);
    const header = new Uint8Array(16);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x5053474e, true);
    view.setUint32(4, 9, true);
    expect(() => decodeSpz(header)).toThrow(/version 9/);
    view.setUint32(4, 2, true);
    view.setUint32(8, 10, true);
    expect(() => decodeSpz(header)).toThrow(/truncated/);
  });
});

describe('sortSplatsBackToFront', () => {
  it('returns a permutation ordered from far to near', () => {
    const count = 5000;
    const positions = new Float32Array(count * 3);
    let seed = 1;
    for (let i = 0; i < positions.length; i++) {
      seed = (seed * 48271) % 2147483647;
      positions[i] = (seed / 2147483647 - 0.5) * 50;
    }
    const direction = [0.3, -0.5, 0.8];
    const order = sortSplatsBackToFront(positions, count, direction[0], direction[1], direction[2], new Uint32Array(count), createSortScratch(count));
    expect(new Set(order).size).toBe(count);
    const depth = (i: number) => positions[i * 3] * direction[0] + positions[i * 3 + 1] * direction[1] + positions[i * 3 + 2] * direction[2];
    // 16-bit quantisation: neighbours may be out of order by at most one bucket.
    const depths = Array.from(order, depth);
    const bucket = (Math.max(...depths) - Math.min(...depths)) / 65535;
    for (let i = 1; i < count; i++) expect(depth(order[i])).toBeGreaterThanOrEqual(depth(order[i - 1]) - bucket);
  });

  it('handles coplanar clouds', () => {
    const positions = new Float32Array([0, 0, 1, 5, 5, 1, -3, 2, 1]);
    const order = sortSplatsBackToFront(positions, 3, 0, 0, 1, new Uint32Array(3), createSortScratch(3));
    expect(Array.from(order).sort()).toEqual([0, 1, 2]);
  });
});

describe('packSplats', () => {
  it('stores position, normalised covariance and colour in two texels', () => {
    const data = allocSplatData(2);
    data.positions.set([1, 2, 3, -4, 5, -6]);
    data.scales.set([0.1, 0.2, 0.05, 3, 3, 3]);
    data.rotations.set([0, 0, 0, 1, 0, 0, 0, 1]);
    data.colors.set([10, 20, 30, 40, 255, 254, 253, 252]);
    const { texture, width, height } = packSplats(data);
    expect(width).toBe(SPLATS_PER_ROW * 2);
    expect(height).toBe(1);
    const floats = new Float32Array(texture.buffer);
    expect(Array.from(floats.subarray(0, 3))).toEqual([1, 2, 3]);
    // Identity rotation: covariance is diag(sx^2, sy^2, sz^2), normalised by the largest term.
    expect(floats[3]).toBeCloseTo(0.04, 6);
    expect(fromHalf(texture[4] & 0xffff)).toBeCloseTo(0.25, 3);
    expect(fromHalf(texture[4] >>> 16)).toBe(0);
    expect(fromHalf(texture[5] >>> 16)).toBe(1);
    expect(fromHalf(texture[6] >>> 16)).toBeCloseTo(0.0625, 3);
    expect(texture[7]).toBe((10 | (20 << 8) | (30 << 16) | (40 << 24)) >>> 0);
    expect(texture[15]).toBe((255 | (254 << 8) | (253 << 16) | (252 << 24)) >>> 0);
    expect(floats[11]).toBeCloseTo(9, 5);
  });
});
