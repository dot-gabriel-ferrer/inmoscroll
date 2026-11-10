const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/** IEEE 754 binary32 -> binary16 (round toward zero). */
export function toHalf(value: number): number {
  f32[0] = value;
  const bits = u32[0];
  const sign = (bits >>> 31) & 0x1;
  const exp = (bits >>> 23) & 0xff;
  let frac = bits & 0x7fffff;
  let halfExp: number;
  if (exp < 90) {
    // Below half-float subnormal range.
    halfExp = 0;
    frac = 0;
  } else if (exp < 113) {
    halfExp = 0;
    frac = (frac | 0x800000) >>> (113 - exp);
    if (frac & 0x01000000) {
      halfExp = 1;
      frac = 0;
    }
  } else if (exp < 143) {
    halfExp = exp - 112;
  } else {
    halfExp = 31;
    frac = 0;
  }
  return (sign << 15) | (halfExp << 10) | (frac >>> 13);
}

/** IEEE 754 binary16 -> number. */
export function fromHalf(h: number): number {
  const sign = h & 0x8000 ? -1 : 1;
  const exp = (h >>> 10) & 0x1f;
  const frac = h & 0x3ff;
  if (exp === 0) return sign * frac * 2 ** -24;
  if (exp === 31) return frac ? NaN : sign * Infinity;
  return sign * (1 + frac / 1024) * 2 ** (exp - 15);
}
