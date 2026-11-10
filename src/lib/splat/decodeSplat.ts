import { allocSplatData, type SplatData } from './types';

const ROW_BYTES = 32;

/** Decodes the plain `.splat` layout: position f32x3, scale f32x3, RGBA u8, quaternion u8x4 (wxyz). */
export function decodeSplat(bytes: Uint8Array): SplatData {
  const count = Math.floor(bytes.byteLength / ROW_BYTES);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = allocSplatData(count);
  for (let i = 0; i < count; i++) {
    const o = i * ROW_BYTES;
    for (let k = 0; k < 3; k++) {
      out.positions[i * 3 + k] = view.getFloat32(o + k * 4, true);
      out.scales[i * 3 + k] = view.getFloat32(o + 12 + k * 4, true);
    }
    for (let k = 0; k < 4; k++) out.colors[i * 4 + k] = bytes[o + 24 + k];
    const w = (bytes[o + 28] - 128) / 128;
    const x = (bytes[o + 29] - 128) / 128;
    const y = (bytes[o + 30] - 128) / 128;
    const z = (bytes[o + 31] - 128) / 128;
    const len = Math.hypot(x, y, z, w) || 1;
    out.rotations[i * 4] = x / len;
    out.rotations[i * 4 + 1] = y / len;
    out.rotations[i * 4 + 2] = z / len;
    out.rotations[i * 4 + 3] = w / len;
  }
  return out;
}
