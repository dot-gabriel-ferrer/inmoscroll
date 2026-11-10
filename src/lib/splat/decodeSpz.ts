import { fromHalf } from './halfFloat';
import { allocSplatData, type SplatData } from './types';

const SPZ_MAGIC = 0x5053474e; // "NGSP"
const SH_C0 = 0.28209479177387814;
const COLOR_SCALE = 0.15;
const SH_COEFFS_PER_DEGREE = [0, 3, 8, 15];

export async function gunzip(compressed: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([compressed as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Decodes an already-gunzipped Niantic SPZ payload (container versions 1-3).
 * Only the DC colour term is kept; higher-order spherical harmonics are skipped.
 */
export function decodeSpz(bytes: Uint8Array): SplatData {
  if (bytes.byteLength < 16) throw new Error('SPZ: file is too small');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== SPZ_MAGIC) throw new Error('SPZ: bad magic number');
  const version = view.getUint32(4, true);
  if (version < 1 || version > 3) throw new Error(`SPZ: unsupported version ${version}`);
  const count = view.getUint32(8, true);
  const shDegree = bytes[12];
  const fractionalBits = bytes[13];
  if (shDegree > 3) throw new Error(`SPZ: unsupported SH degree ${shDegree}`);

  const positionBytes = version === 1 ? 6 : 9;
  const rotationBytes = version >= 3 ? 4 : 3;
  const shBytes = SH_COEFFS_PER_DEGREE[shDegree] * 3;
  const expected = 16 + count * (positionBytes + 1 + 3 + 3 + rotationBytes + shBytes);
  if (bytes.byteLength < expected) throw new Error('SPZ: truncated file');

  const out = allocSplatData(count);
  let offset = 16;

  if (version === 1) {
    for (let i = 0; i < count * 3; i++) out.positions[i] = fromHalf(view.getUint16(offset + i * 2, true));
  } else {
    const scale = 1 / (1 << fractionalBits);
    for (let i = 0; i < count * 3; i++) {
      const o = offset + i * 3;
      let fixed = bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16);
      if (fixed & 0x800000) fixed |= ~0xffffff;
      out.positions[i] = fixed * scale;
    }
  }
  offset += count * positionBytes;

  const alphaOffset = offset;
  offset += count;
  const colorOffset = offset;
  offset += count * 3;
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) {
      const dc = (bytes[colorOffset + i * 3 + k] / 255 - 0.5) / COLOR_SCALE;
      out.colors[i * 4 + k] = Math.max(0, Math.min(255, Math.round((0.5 + SH_C0 * dc) * 255)));
    }
    // The alpha byte already stores sigmoid(opacity).
    out.colors[i * 4 + 3] = bytes[alphaOffset + i];
  }

  for (let i = 0; i < count * 3; i++) out.scales[i] = Math.exp(bytes[offset + i] / 16 - 10);
  offset += count * 3;

  const rot = out.rotations;
  if (version >= 3) {
    // "Smallest three": 2 bits for the dropped component, 3 x (9 bits magnitude + sign).
    const maxMagnitude = 511;
    for (let i = 0; i < count; i++) {
      let packed = view.getUint32(offset + i * 4, true);
      const largest = packed >>> 30;
      let sumSquares = 0;
      for (let k = 3; k >= 0; k--) {
        if (k === largest) continue;
        const magnitude = packed & 0x1ff;
        const negative = (packed >>> 9) & 1;
        packed >>>= 10;
        const value = (Math.SQRT1_2 * magnitude) / maxMagnitude;
        rot[i * 4 + k] = negative ? -value : value;
        sumSquares += value * value;
      }
      rot[i * 4 + largest] = Math.sqrt(Math.max(0, 1 - sumSquares));
    }
  } else {
    for (let i = 0; i < count; i++) {
      const o = offset + i * 3;
      const x = bytes[o] / 127.5 - 1;
      const y = bytes[o + 1] / 127.5 - 1;
      const z = bytes[o + 2] / 127.5 - 1;
      rot[i * 4] = x;
      rot[i * 4 + 1] = y;
      rot[i * 4 + 2] = z;
      rot[i * 4 + 3] = Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z));
    }
  }
  return out;
}
