import { toHalf } from './halfFloat';
import { SPLATS_PER_ROW, type SplatData } from './types';

export interface PackedSplats {
  texture: Uint32Array;
  width: number;
  height: number;
}

/**
 * Packs splats into an RGBA32UI texture, two texels per splat:
 *   texel 0: position xyz (float bits), covariance magnitude (float bits)
 *   texel 1: six covariance terms normalised by that magnitude (half floats), RGBA8
 * Normalising keeps half-float precision for both millimetre and multi-metre splats.
 */
export function packSplats(data: SplatData): PackedSplats {
  const { count, positions, scales, rotations, colors } = data;
  const width = SPLATS_PER_ROW * 2;
  const height = Math.max(1, Math.ceil(count / SPLATS_PER_ROW));
  const texture = new Uint32Array(width * height * 4);
  const floats = new Float32Array(texture.buffer);

  for (let i = 0; i < count; i++) {
    const o = i * 8;
    floats[o] = positions[i * 3];
    floats[o + 1] = positions[i * 3 + 1];
    floats[o + 2] = positions[i * 3 + 2];

    const x = rotations[i * 4];
    const y = rotations[i * 4 + 1];
    const z = rotations[i * 4 + 2];
    const w = rotations[i * 4 + 3];
    const sx = scales[i * 3];
    const sy = scales[i * 3 + 1];
    const sz = scales[i * 3 + 2];

    // M = R * S, covariance = M * M^T.
    const m00 = (1 - 2 * (y * y + z * z)) * sx;
    const m01 = 2 * (x * y - w * z) * sy;
    const m02 = 2 * (x * z + w * y) * sz;
    const m10 = 2 * (x * y + w * z) * sx;
    const m11 = (1 - 2 * (x * x + z * z)) * sy;
    const m12 = 2 * (y * z - w * x) * sz;
    const m20 = 2 * (x * z - w * y) * sx;
    const m21 = 2 * (y * z + w * x) * sy;
    const m22 = (1 - 2 * (x * x + y * y)) * sz;

    const c00 = m00 * m00 + m01 * m01 + m02 * m02;
    const c01 = m00 * m10 + m01 * m11 + m02 * m12;
    const c02 = m00 * m20 + m01 * m21 + m02 * m22;
    const c11 = m10 * m10 + m11 * m11 + m12 * m12;
    const c12 = m10 * m20 + m11 * m21 + m12 * m22;
    const c22 = m20 * m20 + m21 * m21 + m22 * m22;

    const magnitude = Math.max(c00, c11, c22, 1e-20);
    const inv = 1 / magnitude;
    floats[o + 3] = magnitude;
    texture[o + 4] = toHalf(c00 * inv) | (toHalf(c01 * inv) << 16);
    texture[o + 5] = toHalf(c02 * inv) | (toHalf(c11 * inv) << 16);
    texture[o + 6] = toHalf(c12 * inv) | (toHalf(c22 * inv) << 16);
    texture[o + 7] =
      (colors[i * 4] | (colors[i * 4 + 1] << 8) | (colors[i * 4 + 2] << 16) | (colors[i * 4 + 3] << 24)) >>> 0;
  }
  return { texture, width, height };
}
