import { fromHalf } from './halfFloat';
import { allocSplatData, type SplatData } from './types';

const HEADER_BYTES = 4096;
const SECTION_HEADER_BYTES = 1024;
const BUCKET_FLOATS = 3;

// Per-splat layout for each .ksplat compression level (bytes).
const LEVELS = [
  { scaleOffset: 12, colorOffset: 40, scaleRange: 1, bytesPerSplat: [44, 80, 140] },
  { scaleOffset: 6, colorOffset: 20, scaleRange: 32767, bytesPerSplat: [24, 42, 72] },
  { scaleOffset: 6, colorOffset: 20, scaleRange: 32767, bytesPerSplat: [24, 33, 48] },
];

/**
 * Decodes Mark Kellogg's `.ksplat` container (format 0.x, compression levels 0-2).
 * Spherical harmonics beyond the baked RGBA colour are skipped.
 */
export function decodeKsplat(bytes: Uint8Array): SplatData {
  if (bytes.byteLength < HEADER_BYTES) throw new Error('KSPLAT: file is too small');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const versionMajor = bytes[0];
  if (versionMajor !== 0) throw new Error(`KSPLAT: unsupported version ${versionMajor}.${bytes[1]}`);
  const maxSectionCount = view.getUint32(4, true);
  const sectionCount = view.getUint32(8, true);
  const splatCount = view.getUint32(16, true);
  const compressionLevel = view.getUint16(20, true);
  const level = LEVELS[compressionLevel];
  if (!level) throw new Error(`KSPLAT: unsupported compression level ${compressionLevel}`);

  const out = allocSplatData(splatCount);
  const readFloat = (offset: number, index: number) =>
    compressionLevel === 0 ? view.getFloat32(offset + index * 4, true) : fromHalf(view.getUint16(offset + index * 2, true));

  let sectionBase = HEADER_BYTES + maxSectionCount * SECTION_HEADER_BYTES;
  let written = 0;
  for (let s = 0; s < maxSectionCount; s++) {
    const h = HEADER_BYTES + s * SECTION_HEADER_BYTES;
    const sectionSplats = view.getUint32(h, true);
    const maxSplats = view.getUint32(h + 4, true);
    const bucketSize = view.getUint32(h + 8, true);
    const bucketCount = view.getUint32(h + 12, true);
    const bucketBlockSize = view.getFloat32(h + 16, true);
    const bucketStorageBytes = view.getUint16(h + 20, true);
    const scaleRange = view.getUint32(h + 24, true) || level.scaleRange;
    const fullBucketCount = view.getUint32(h + 32, true);
    const partialBucketCount = view.getUint32(h + 36, true);
    const shDegree = view.getUint16(h + 40, true);
    const bytesPerSplat = level.bytesPerSplat[shDegree];
    if (bytesPerSplat === undefined) throw new Error(`KSPLAT: unsupported SH degree ${shDegree}`);

    const bucketsMetaBytes = partialBucketCount * 4;
    const bucketsBase = sectionBase + bucketsMetaBytes;
    const dataBase = sectionBase + bucketStorageBytes * bucketCount + bucketsMetaBytes;
    const scaleFactor = bucketBlockSize / 2 / scaleRange;

    if (s < sectionCount) {
      const count = Math.min(sectionSplats, splatCount - written);
      if (dataBase + count * bytesPerSplat > bytes.byteLength) throw new Error('KSPLAT: truncated file');

      // Walk buckets alongside splats: full buckets first, then the partially filled ones.
      let bucket = -1;
      let bucketEnd = 0;
      for (let i = 0; i < count; i++) {
        const o = dataBase + i * bytesPerSplat;
        const dst = written + i;
        if (compressionLevel === 0) {
          for (let k = 0; k < 3; k++) out.positions[dst * 3 + k] = view.getFloat32(o + k * 4, true);
        } else {
          while (i >= bucketEnd) {
            bucket++;
            if (bucket >= bucketCount) throw new Error('KSPLAT: corrupt bucket table');
            bucketEnd +=
              bucket < fullBucketCount ? bucketSize : view.getUint32(sectionBase + (bucket - fullBucketCount) * 4, true);
          }
          const b = bucketsBase + bucket * BUCKET_FLOATS * 4;
          for (let k = 0; k < 3; k++) {
            const q = view.getUint16(o + k * 2, true);
            out.positions[dst * 3 + k] = (q - scaleRange) * scaleFactor + view.getFloat32(b + k * 4, true);
          }
        }
        const so = o + level.scaleOffset;
        for (let k = 0; k < 3; k++) out.scales[dst * 3 + k] = readFloat(so, k);
        // Stored as w, x, y, z.
        const w = readFloat(so, 3);
        const x = readFloat(so, 4);
        const y = readFloat(so, 5);
        const z = readFloat(so, 6);
        const len = Math.hypot(x, y, z, w) || 1;
        out.rotations[dst * 4] = x / len;
        out.rotations[dst * 4 + 1] = y / len;
        out.rotations[dst * 4 + 2] = z / len;
        out.rotations[dst * 4 + 3] = w / len;
        const co = o + level.colorOffset;
        for (let k = 0; k < 4; k++) out.colors[dst * 4 + k] = bytes[co + k];
      }
      written += count;
    }
    sectionBase += bytesPerSplat * maxSplats + bucketStorageBytes * bucketCount + bucketsMetaBytes;
  }
  if (written !== splatCount) throw new Error('KSPLAT: section splat counts do not match the header');
  return out;
}
