// Generates the demo penthouse in both ingestion formats used by the viewer:
//   public/assets/atico-mirador.glb  (merged meshes, EXT_meshopt_compression)
//   public/assets/atico-mirador.spz  (Gaussian splats sampled from the same surfaces)
// and writes src/data/asset-manifest.json with content hashes for immutable caching.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMaterialsEmissiveStrength, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'assets');

let seed = 20261110;
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rr = (a, b) => a + (b - a) * rand();

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const hex = (h) => [0, 2, 4].map((i) => srgbToLinear(parseInt(h.slice(1 + i, 3 + i), 16) / 255));

// Materials. `density` is splats per square metre for the SPZ variant.
const MATERIALS = {
  floorWood: { color: hex('#b58f6b'), rough: 0.55, metal: 0 },
  deck: { color: hex('#9c8672'), rough: 0.8, metal: 0 },
  wall: { color: hex('#ebe6de'), rough: 0.9, metal: 0 },
  ceiling: { color: hex('#f4f1ec'), rough: 0.95, metal: 0 },
  walnut: { color: hex('#5a3d2b'), rough: 0.5, metal: 0 },
  oak: { color: hex('#b99872'), rough: 0.55, metal: 0 },
  matteBlack: { color: hex('#232325'), rough: 0.65, metal: 0 },
  glossBlack: { color: hex('#0c0c0e'), rough: 0.12, metal: 0.4 },
  marble: { color: hex('#e8e4de'), rough: 0.22, metal: 0 },
  fabric: { color: hex('#a8957f'), rough: 0.95, metal: 0 },
  fabricLight: { color: hex('#d4c8b8'), rough: 0.95, metal: 0 },
  fabricDark: { color: hex('#5c5148'), rough: 0.95, metal: 0 },
  linen: { color: hex('#f1ede6'), rough: 0.95, metal: 0 },
  rug: { color: hex('#cfc5b6'), rough: 1, metal: 0 },
  metalDark: { color: hex('#1b1b1d'), rough: 0.35, metal: 0.9 },
  ceramic: { color: hex('#d9d2c7'), rough: 0.6, metal: 0 },
  plant: { color: hex('#4f6b3f'), rough: 0.8, metal: 0 },
  art: { color: hex('#c9b8a3'), rough: 0.9, metal: 0 },
  concrete: { color: hex('#b9b4ac'), rough: 0.9, metal: 0 },
  led: { color: hex('#ffe2b8'), rough: 0.5, metal: 0, emissive: hex('#ffd9a6'), emissiveStrength: 6 },
  lampShade: { color: hex('#fff1dc'), rough: 0.8, metal: 0, emissive: hex('#ffe3bd'), emissiveStrength: 3 },
  glass: { color: hex('#dfeaf0'), rough: 0.05, metal: 0, alpha: 0.12, density: 12 },
  bg_city: { color: hex('#c3ccd6'), rough: 1, metal: 0, density: 0.05 },
  bg_ground: { color: hex('#93a58a'), rough: 1, metal: 0, density: 0.004 },
};

/** @type {{mat:string,min:number[],max:number[],rotY:number,tint:number}[]} */
const boxes = [];
const B = (mat, x0, x1, y0, y1, z0, z1, opts = {}) => {
  if (!MATERIALS[mat]) throw new Error(`Unknown material ${mat}`);
  boxes.push({
    mat,
    min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
    max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)],
    rotY: opts.rotY ?? 0,
    tint: opts.tint ?? 1,
    noSplat: opts.noSplat ?? false,
  });
};
/** Box from centre + size. */
const C = (mat, cx, cy, cz, sx, sy, sz, opts) =>
  B(mat, cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, cz - sz / 2, cz + sz / 2, opts);

const H = 2.8;

function buildShell() {
  // Interior floor: planks running east-west with tonal variation.
  for (let z = -3.5; z < 3.5 - 1e-6; z += 0.2) {
    let x = -6 - rr(0, 1.5);
    while (x < 10.5) {
      const len = rr(1.3, 2.6);
      B('floorWood', Math.max(x, -6), Math.min(x + len - 0.004, 10.5), -0.05, 0, z, z + 0.196, {
        tint: rr(0.82, 1.1),
      });
      x += len;
    }
  }
  B('matteBlack', -6.2, 10.7, -0.3, -0.05, -3.7, 3.7, { noSplat: true });
  // Terrace deck boards running north-south.
  for (let x = -6.2; x < 10.7 - 1e-6; x += 0.15) {
    B('deck', x, x + 0.143, -0.07, -0.02, 3.7, 6.5, { tint: rr(0.85, 1.08) });
  }
  B('concrete', -6.2, 10.7, -0.3, -0.07, 3.7, 6.5, { noSplat: true });

  B('ceiling', -6.2, 10.7, H, H + 0.15, -3.7, 3.7);
  B('wall', -6.2, 10.7, 0, H, -3.7, -3.5);
  B('wall', -6.2, -6.0, 0, H, -3.5, 3.7);
  B('wall', 10.5, 10.7, 0, H, -3.5, 3.7);

  // South facade: pillars, lintel, glazing and the open sliding door of the bedroom.
  B('wall', -6.0, -5.7, 0, 2.5, 3.5, 3.7);
  B('wall', -0.4, 0.2, 0, 2.5, 3.5, 3.7);
  B('wall', 5.6, 6.6, 0, 2.5, 3.5, 3.7);
  B('wall', 8.8, 10.5, 0, 2.5, 3.5, 3.7);
  B('wall', -6.0, 10.5, 2.5, H, 3.5, 3.7);
  for (const [gx0, gx1] of [
    [-5.7, -0.4],
    [0.2, 5.6],
  ]) {
    B('glass', gx0, gx1, 0.06, 2.44, 3.59, 3.61);
    B('metalDark', gx0, gx1, 0, 0.06, 3.56, 3.64);
    B('metalDark', gx0, gx1, 2.44, 2.5, 3.56, 3.64);
    const panes = 3;
    for (let i = 0; i <= panes; i++) {
      const x = gx0 + ((gx1 - gx0) * i) / panes;
      C('metalDark', x, 1.25, 3.6, 0.06, 2.5, 0.08);
    }
  }
  // Bedroom sliding door frame (left open) with one parked glass leaf.
  C('metalDark', 6.63, 1.25, 3.6, 0.06, 2.5, 0.08);
  C('metalDark', 8.77, 1.25, 3.6, 0.06, 2.5, 0.08);
  B('metalDark', 6.6, 8.8, 2.44, 2.5, 3.56, 3.64);
  B('glass', 8.8, 9.9, 0.06, 2.44, 3.44, 3.46);

  // Partition between the living area and the bedroom, with a doorway.
  B('wall', 6.0, 6.2, 0, H, -3.5, -1.2);
  B('wall', 6.0, 6.2, 0, H, -0.1, 3.5);
  B('wall', 6.0, 6.2, 2.2, H, -1.2, -0.1);
  B('walnut', 5.99, 6.21, 0, 2.2, -1.24, -1.2);
  B('walnut', 5.99, 6.21, 0, 2.2, -0.1, -0.06);
  B('walnut', 5.99, 6.21, 2.2, 2.24, -1.24, -0.06);

  // Sheer curtains gathered at both ends of the living glazing.
  for (let i = 0; i < 6; i++) {
    C('linen', -5.62 + i * 0.07, 1.27, 3.36 + (i % 2) * 0.05, 0.05, 2.45, 0.05, { tint: rr(0.93, 1) });
    C('linen', 5.5 - i * 0.07, 1.27, 3.36 + (i % 2) * 0.05, 0.05, 2.45, 0.05, { tint: rr(0.93, 1) });
  }

  // Ceiling light track with spots.
  B('metalDark', -5.2, 5.4, H - 0.03, H, 0.88, 0.93);
  for (const x of [-4.4, -2.6, -0.8, 1.2, 3.2, 5.0]) {
    C('metalDark', x, H - 0.09, 0.905, 0.07, 0.12, 0.07);
    C('led', x, H - 0.155, 0.905, 0.05, 0.012, 0.05);
  }
}

function buildLiving() {
  // Walnut slatted wall behind the TV.
  for (let z = -1.4; z < 2.6 - 1e-6; z += 0.1) {
    B('walnut', -6.0, -5.955 - rr(0, 0.012), 0, H, z, z + 0.085, { tint: rr(0.8, 1.15) });
  }
  B('walnut', -5.96, -5.5, 0.28, 0.6, -0.9, 2.1);
  B('led', -5.95, -5.56, 0.262, 0.28, -0.85, 2.05);
  B('glossBlack', -5.95, -5.9, 0.95, 1.85, -0.2, 1.4);
  C('ceramic', -5.72, 0.7, 1.75, 0.12, 0.2, 0.12);
  C('matteBlack', -5.72, 0.615, -0.55, 0.22, 0.03, 0.3);

  B('rug', -5.1, -1.5, 0, 0.015, -1.3, 2.5);

  // Sofa facing the TV wall.
  B('metalDark', -3.25, -1.95, 0, 0.08, -1.1, 2.3);
  B('fabric', -3.3, -2.2, 0.08, 0.42, -0.9, 2.1);
  B('fabric', -2.2, -1.9, 0.08, 0.86, -1.15, 2.35);
  B('fabric', -3.3, -2.2, 0.08, 0.62, -1.15, -0.9);
  B('fabric', -3.3, -2.2, 0.08, 0.62, 2.1, 2.35);
  for (let i = 0; i < 3; i++) {
    const z0 = -0.88 + i * 0.99;
    B('fabricLight', -3.27, -2.24, 0.42, 0.55, z0, z0 + 0.97, { tint: rr(0.96, 1.03) });
    B('fabricLight', -2.46, -2.2, 0.55, 0.93, z0 + 0.02, z0 + 0.95, { tint: rr(0.94, 1.02) });
  }
  C('fabricDark', -2.62, 0.72, -0.55, 0.14, 0.38, 0.42, { rotY: 0.25 });
  C('walnut', -2.62, 0.71, 1.72, 0.14, 0.36, 0.4, { rotY: -0.2, tint: 1.5 });

  // Coffee table with a few objects.
  B('matteBlack', -4.62, -3.98, 0, 0.34, 0.1, 1.1);
  B('marble', -4.72, -3.88, 0.34, 0.38, 0.0, 1.2);
  C('oak', -4.3, 0.395, 0.35, 0.3, 0.03, 0.22, { rotY: 0.2 });
  C('fabricDark', -4.3, 0.42, 0.35, 0.26, 0.025, 0.19, { rotY: 0.35 });
  C('ceramic', -4.32, 0.47, 0.9, 0.11, 0.18, 0.11);

  // Armchair by the window.
  C('oak', -4.3, 0.13, 2.75, 0.62, 0.26, 0.62, { rotY: 0.5 });
  C('fabricLight', -4.3, 0.33, 2.75, 0.66, 0.16, 0.66, { rotY: 0.5 });
  C('fabricLight', -4.12, 0.62, 3.03, 0.66, 0.5, 0.12, { rotY: 0.5 });

  // Floor lamp.
  C('metalDark', -1.45, 0.01, 2.85, 0.28, 0.02, 0.28);
  C('metalDark', -1.45, 0.75, 2.85, 0.025, 1.5, 0.025);
  C('lampShade', -1.45, 1.62, 2.85, 0.3, 0.3, 0.3);

  // Corner plant.
  C('ceramic', -5.45, 0.25, -2.95, 0.42, 0.5, 0.42);
  for (let i = 0; i < 16; i++) {
    C('plant', -5.45 + rr(-0.35, 0.35), rr(0.65, 1.75), -2.95 + rr(-0.35, 0.35), rr(0.16, 0.34), rr(0.1, 0.24), rr(0.16, 0.34), {
      rotY: rr(0, Math.PI),
      tint: rr(0.7, 1.3),
    });
  }
  C('walnut', -5.45, 0.6, -2.95, 0.04, 0.5, 0.04);

  // Artwork on the north wall.
  B('matteBlack', -4.3, -2.7, 0.95, 2.05, -3.5, -3.47);
  B('art', -4.26, -2.74, 0.99, 2.01, -3.47, -3.462);
  B('walnut', -3.9, -3.3, 1.2, 1.75, -3.462, -3.456, { tint: 1.3 });
  B('fabricDark', -3.45, -3.0, 1.35, 1.9, -3.462, -3.455);

  // Entry console.
  B('oak', -1.7, -0.3, 0.74, 0.78, -3.5, -3.15);
  C('oak', -1.6, 0.37, -3.32, 0.04, 0.74, 0.3);
  C('oak', -0.4, 0.37, -3.32, 0.04, 0.74, 0.3);
  C('lampShade', -1.35, 0.94, -3.32, 0.16, 0.22, 0.16);
  C('metalDark', -1.35, 0.8, -3.32, 0.03, 0.06, 0.03);
}

function buildKitchen() {
  // Tall walnut columns at both ends of the run.
  for (const [x0, x1] of [
    [0.2, 0.8],
    [5.0, 5.5],
    [5.5, 6.0],
  ]) {
    B('walnut', x0 + 0.004, x1 - 0.004, 0, H, -3.5, -2.88, { tint: rr(0.9, 1.1) });
  }
  B('glossBlack', 5.06, 5.94, 1.0, 1.5, -2.88, -2.865);
  B('glossBlack', 5.06, 5.94, 1.56, 1.96, -2.88, -2.865);
  B('metalDark', 5.1, 5.9, 1.46, 1.475, -2.865, -2.84);

  B('matteBlack', 0.8, 5.0, 0, 0.1, -3.5, -2.96, { tint: 0.6 });
  for (let x = 0.8; x < 5.0 - 1e-6; x += 0.7) {
    B('matteBlack', x + 0.003, x + 0.697, 0.1, 0.9, -3.5, -2.9);
    B('matteBlack', x + 0.003, x + 0.697, 1.5, 2.3, -3.5, -3.12);
  }
  B('walnut', 0.8, 5.0, 2.3, H, -3.5, -3.1, { tint: 0.95 });
  B('marble', 0.8, 5.0, 0.9, 0.94, -3.5, -2.86);
  B('marble', 0.8, 5.0, 0.94, 1.5, -3.5, -3.485, { tint: 0.97 });
  B('led', 0.85, 4.95, 1.485, 1.5, -3.46, -3.42);
  B('glossBlack', 2.2, 3.0, 0.94, 0.946, -3.38, -2.96);

  // Counter styling.
  C('oak', 1.25, 1.14, -3.44, 0.26, 0.4, 0.025, { tint: 0.8 });
  C('walnut', 1.45, 1.1, -3.41, 0.2, 0.32, 0.025, { tint: 1.4 });
  C('ceramic', 1.75, 1.03, -3.3, 0.1, 0.18, 0.1);
  C('plant', 3.6, 1.07, -3.32, 0.07, 0.26, 0.07, { tint: 0.5 });
  C('matteBlack', 3.72, 1.05, -3.3, 0.07, 0.22, 0.07);

  // Island with marble top, sink and tap.
  B('walnut', 1.9, 4.5, 0, 0.9, -1.5, -0.55);
  B('marble', 1.8, 4.6, 0.9, 0.95, -1.6, -0.3);
  B('matteBlack', 2.5, 3.1, 0.948, 0.952, -1.35, -0.95);
  C('metalDark', 2.8, 1.11, -1.45, 0.025, 0.32, 0.025);
  C('metalDark', 2.8, 1.26, -1.36, 0.025, 0.025, 0.2);
  C('matteBlack', 3.9, 0.985, -0.95, 0.34, 0.07, 0.34);
  for (let i = 0; i < 5; i++) {
    C('oak', 3.9 + rr(-0.09, 0.09), 1.045, -0.95 + rr(-0.09, 0.09), 0.08, 0.08, 0.08, {
      rotY: rr(0, 1.5),
      tint: 1.25,
    });
  }

  // Stools.
  for (const x of [2.3, 2.95, 3.6, 4.25]) {
    B('fabricDark', x - 0.19, x + 0.19, 0.68, 0.73, -0.26, 0.1);
    B('fabricDark', x - 0.19, x + 0.19, 0.73, 0.98, 0.07, 0.1);
    for (const [dx, dz] of [
      [-0.17, -0.24],
      [0.17, -0.24],
      [-0.17, 0.08],
      [0.17, 0.08],
    ]) {
      C('metalDark', x + dx, 0.34, dz, 0.022, 0.68, 0.022);
    }
    B('metalDark', x - 0.17, x + 0.17, 0.24, 0.26, -0.25, -0.23);
  }

  // Linear pendant above the island.
  B('metalDark', 2.0, 4.4, 2.03, 2.07, -1.03, -0.97);
  B('led', 2.02, 4.38, 2.018, 2.03, -1.02, -0.98);
  C('metalDark', 2.2, 2.435, -1.0, 0.006, 0.73, 0.006);
  C('metalDark', 4.2, 2.435, -1.0, 0.006, 0.73, 0.006);

  // Dining table and chairs.
  B('oak', 2.9, 5.1, 0.72, 0.76, 2.0, 3.0);
  for (const [x, z] of [
    [3.0, 2.1],
    [5.0, 2.1],
    [3.0, 2.9],
    [5.0, 2.9],
  ]) {
    C('oak', x, 0.36, z, 0.06, 0.72, 0.06);
  }
  for (const x of [3.4, 4.6]) {
    for (const side of [-1, 1]) {
      const z = 2.5 + side * 0.72;
      C('fabric', x, 0.44, z, 0.46, 0.06, 0.44);
      C('fabric', x, 0.68, z + side * 0.2, 0.46, 0.42, 0.04);
      for (const [dx, dz] of [
        [-0.2, -0.19],
        [0.2, -0.19],
        [-0.2, 0.19],
        [0.2, 0.19],
      ]) {
        C('metalDark', x + dx, 0.21, z + dz, 0.025, 0.42, 0.025);
      }
    }
  }
  C('ceramic', 4.0, 0.86, 2.5, 0.14, 0.2, 0.14);
  for (let i = 0; i < 6; i++) {
    C('plant', 4.0 + rr(-0.12, 0.12), rr(1.0, 1.25), 2.5 + rr(-0.12, 0.12), 0.1, 0.07, 0.1, {
      rotY: rr(0, 3),
      tint: rr(0.8, 1.3),
    });
  }
}

function buildBedroom() {
  // Wardrobe run on the north wall.
  for (let x = 6.6; x < 10.5 - 1e-6; x += 0.65) {
    B('walnut', x + 0.004, Math.min(x + 0.646, 10.5), 0, H, -3.5, -2.9, { tint: rr(0.9, 1.1) });
  }
  // Slatted headboard wall.
  for (let z = -2.2; z < 2.2 - 1e-6; z += 0.1) {
    B('walnut', 10.455 - rr(0, 0.012), 10.5, 0, H, z, z + 0.085, { tint: rr(0.8, 1.15) });
  }
  B('led', 10.42, 10.45, 1.24, 1.255, -1.5, 1.5);

  B('rug', 7.5, 10.2, 0, 0.015, -1.7, 1.7);
  B('fabricDark', 8.3, 10.4, 0.08, 0.34, -1.0, 1.0);
  B('linen', 8.34, 10.4, 0.34, 0.55, -0.96, 0.96);
  B('fabricLight', 8.3, 9.75, 0.55, 0.61, -1.0, 1.0);
  B('fabric', 8.3, 8.75, 0.61, 0.64, -1.0, 1.0);
  B('linen', 9.9, 10.3, 0.55, 0.7, -0.86, -0.08);
  B('linen', 9.9, 10.3, 0.55, 0.7, 0.08, 0.86);
  B('fabric', 10.3, 10.45, 0.34, 1.22, -1.15, 1.15);
  for (const s of [-1, 1]) {
    C('walnut', 10.17, 0.3, s * 1.5, 0.52, 0.3, 0.5);
    C('metalDark', 10.2, 0.5, s * 1.5, 0.05, 0.1, 0.05);
    C('lampShade', 10.2, 0.66, s * 1.5, 0.18, 0.22, 0.18);
  }
  // Bench at the foot of the bed.
  B('oak', 7.75, 8.15, 0.36, 0.42, -0.8, 0.8);
  C('metalDark', 7.95, 0.18, -0.7, 0.3, 0.36, 0.03);
  C('metalDark', 7.95, 0.18, 0.7, 0.3, 0.36, 0.03);
  // Plant by the terrace door.
  C('ceramic', 10.05, 0.22, 2.9, 0.4, 0.44, 0.4);
  C('walnut', 10.05, 0.7, 2.9, 0.04, 0.6, 0.04);
  for (let i = 0; i < 14; i++) {
    C('plant', 10.05 + rr(-0.3, 0.3), rr(0.8, 1.7), 2.9 + rr(-0.3, 0.3), rr(0.16, 0.32), rr(0.1, 0.22), rr(0.16, 0.32), {
      rotY: rr(0, Math.PI),
      tint: rr(0.7, 1.3),
    });
  }
}

function tree(x, z, trunkH, crown) {
  C('walnut', x, trunkH / 2 + 0.45, z, 0.07, trunkH, 0.07, { tint: 0.8 });
  for (let i = 0; i < 26; i++) {
    const a = rr(0, Math.PI * 2);
    const r = rr(0, crown);
    C('plant', x + Math.cos(a) * r, trunkH + 0.45 + rr(-0.15, crown), z + Math.sin(a) * r, rr(0.2, 0.42), rr(0.14, 0.3), rr(0.2, 0.42), {
      rotY: rr(0, Math.PI),
      tint: rr(0.75, 1.35),
    });
  }
}

function buildTerrace() {
  B('glass', -6.2, 10.7, 0.05, 1.08, 6.44, 6.46);
  B('metalDark', -6.2, 10.7, 1.08, 1.11, 6.42, 6.48);
  B('metalDark', -6.2, 10.7, -0.02, 0.05, 6.42, 6.48);
  for (let x = -6.2; x <= 10.71; x += 1.69) C('metalDark', x, 0.55, 6.45, 0.03, 1.1, 0.05);
  B('wall', -6.2, -6.0, 0, 1.4, 3.7, 6.5);
  B('wall', 10.5, 10.7, 0, 1.4, 3.7, 6.5);

  // Planters with olive trees.
  C('concrete', 5.9, 0.22, 5.75, 0.8, 0.45, 0.8);
  tree(5.9, 5.75, 1.0, 0.55);
  C('concrete', -5.3, 0.22, 5.8, 0.8, 0.45, 0.8);
  tree(-5.3, 5.8, 0.9, 0.5);
  B('concrete', -3.9, -0.6, 0, 0.4, 5.95, 6.35);
  for (let i = 0; i < 40; i++) {
    C('plant', rr(-3.8, -0.7), rr(0.42, 0.75), rr(6.0, 6.3), rr(0.12, 0.26), rr(0.1, 0.22), rr(0.12, 0.26), {
      rotY: rr(0, Math.PI),
      tint: rr(0.8, 1.4),
    });
  }

  // Outdoor lounge.
  B('oak', 8.9, 10.3, 0.05, 0.3, 4.3, 6.1, { tint: 0.85 });
  B('fabricLight', 8.95, 10.3, 0.3, 0.44, 4.35, 6.05);
  B('fabricLight', 10.08, 10.32, 0.44, 0.8, 4.35, 6.05);
  C('fabricDark', 9.9, 0.6, 4.75, 0.14, 0.34, 0.4, { rotY: 0.15 });
  C('concrete', 8.1, 0.2, 5.2, 0.6, 0.38, 0.6);
  C('ceramic', 8.1, 0.45, 5.2, 0.12, 0.12, 0.12);

  // Outdoor dining set.
  B('oak', 0.8, 2.6, 0.7, 0.74, 4.5, 5.5, { tint: 0.85 });
  for (const [x, z] of [
    [0.9, 4.6],
    [2.5, 4.6],
    [0.9, 5.4],
    [2.5, 5.4],
  ]) {
    C('metalDark', x, 0.35, z, 0.05, 0.7, 0.05);
  }
  for (const x of [1.25, 2.15]) {
    for (const side of [-1, 1]) {
      const z = 5.0 + side * 0.72;
      C('oak', x, 0.43, z, 0.44, 0.05, 0.42, { tint: 0.8 });
      C('oak', x, 0.66, z + side * 0.19, 0.44, 0.4, 0.04, { tint: 0.8 });
      C('metalDark', x, 0.2, z, 0.36, 0.4, 0.03);
    }
  }
}

function buildBackdrop() {
  B('bg_ground', -400, 400, -62, -60, 12, 500);
  for (let i = 0; i < 46; i++) {
    const x = rr(-190, 190);
    const z = rr(45, 260);
    const w = rr(9, 24);
    const d = rr(9, 24);
    const top = rr(-48, z < 110 ? 6 : 22);
    B('bg_city', x - w / 2, x + w / 2, -60, top, z - d / 2, z + d / 2, { tint: rr(0.82, 1.12) });
  }
}

buildShell();
buildLiving();
buildKitchen();
buildBedroom();
buildTerrace();
buildBackdrop();

// ---------------------------------------------------------------------------
// Shared geometry helpers
// ---------------------------------------------------------------------------

const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

const rotateY = ([x, y, z], a) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c * x + s * z, y, -s * x + c * z];
};

function boxFrame(box) {
  const center = box.min.map((m, i) => (m + box.max[i]) / 2);
  const half = box.min.map((m, i) => (box.max[i] - m) / 2);
  return { center, half };
}

// ---------------------------------------------------------------------------
// GLB
// ---------------------------------------------------------------------------

async function writeGlb() {
  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene('AticoMirador');
  const emissiveExt = doc.createExtension(KHRMaterialsEmissiveStrength);

  const byMat = new Map();
  for (const box of boxes) {
    if (!byMat.has(box.mat)) byMat.set(box.mat, []);
    byMat.get(box.mat).push(box);
  }

  for (const [matName, list] of byMat) {
    const def = MATERIALS[matName];
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];
    for (const box of list) {
      const { center, half } = boxFrame(box);
      for (const f of FACES) {
        const base = positions.length / 3;
        for (const [su, sv] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          const local = [0, 1, 2].map((i) => (f.n[i] + f.u[i] * su + f.v[i] * sv) * half[i]);
          const p = rotateY(local, box.rotY);
          positions.push(p[0] + center[0], p[1] + center[1], p[2] + center[2]);
          normals.push(...rotateY(f.n, box.rotY));
          colors.push(box.tint, box.tint, box.tint);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const material = doc
      .createMaterial(matName)
      .setBaseColorFactor([...def.color, def.alpha ?? 1])
      .setRoughnessFactor(def.rough)
      .setMetallicFactor(def.metal);
    if (def.alpha !== undefined) material.setAlphaMode('BLEND').setDoubleSided(true);
    if (def.emissive) {
      material.setEmissiveFactor(def.emissive);
      material.setExtension(
        'KHR_materials_emissive_strength',
        emissiveExt.createEmissiveStrength().setEmissiveStrength(def.emissiveStrength),
      );
    }
    const prim = doc
      .createPrimitive()
      .setMaterial(material)
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)))
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(normals)));
    if (list.some((b) => b.tint !== 1)) {
      prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(new Float32Array(colors)));
    }
    scene.addChild(doc.createNode(matName).setMesh(doc.createMesh(matName).addPrimitive(prim)));
  }

  await MeshoptEncoder.ready;
  await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMaterialsEmissiveStrength, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const glb = await io.writeBinary(doc);
  writeFileSync(join(outDir, 'atico-mirador.glb'), glb);
  return { meshes: byMat.size, bytes: glb.byteLength };
}

// ---------------------------------------------------------------------------
// SPZ (Niantic) — version 2 layout, gzip container
// ---------------------------------------------------------------------------

const SH_C0 = 0.28209479177387814;
const SUN = (() => {
  const v = [3, 6, 10];
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
})();

function quatFromBasis(u, v, n) {
  // Rotation matrix with columns (u, v, n) -> quaternion [x, y, z, w].
  const m00 = u[0], m10 = u[1], m20 = u[2];
  const m01 = v[0], m11 = v[1], m21 = v[2];
  const m02 = n[0], m12 = n[1], m22 = n[2];
  const tr = m00 + m11 + m22;
  let x, y, z, w;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = s / 4; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s; x = s / 4; y = (m01 + m10) / s; z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s; x = (m01 + m10) / s; y = s / 4; z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = s / 4;
  }
  return [x, y, z, w];
}

function sampleSplats() {
  const splats = [];
  const DEFAULT_DENSITY = 340;
  for (const box of boxes) {
    if (box.noSplat) continue;
    const def = MATERIALS[box.mat];
    const density = def.density ?? DEFAULT_DENSITY;
    const { center, half } = boxFrame(box);
    for (const f of FACES) {
      const axisU = f.u.findIndex((c) => c !== 0);
      const axisV = f.v.findIndex((c) => c !== 0);
      const axisN = f.n.findIndex((c) => c !== 0);
      // Faces resting on the floor slab or buried under it are never seen.
      if (f.n[1] < 0 && center[1] - half[1] < 0.03) continue;
      if (f.n[1] > 0 && center[1] + half[1] > H + 0.1) continue;
      const lu = half[axisU] * 2;
      const lv = half[axisV] * 2;
      const expected = lu * lv * density;
      let count = Math.floor(expected);
      if (rand() < expected - count) count++;
      if (count === 0) continue;
      // Gaussian sigma sized so neighbours overlap; clamped to thin faces.
      const sigma = 0.85 / Math.sqrt(density);
      const su = Math.min(sigma, Math.max(lu * 0.45, 0.004));
      const sv = Math.min(sigma, Math.max(lv * 0.45, 0.004));
      const n = rotateY(f.n, box.rotY);
      const u = rotateY(f.u, box.rotY);
      const v = rotateY(f.v, box.rotY);
      const lambert = Math.max(0, n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]);
      const shade = def.emissive ? 1.25 : 0.62 + 0.14 * n[1] + 0.3 * lambert;
      for (let i = 0; i < count; i++) {
        const a = rr(-1, 1);
        const b = rr(-1, 1);
        const local = [0, 0, 0];
        local[axisN] = f.n[axisN] * half[axisN];
        local[axisU] += f.u[axisU] * a * half[axisU];
        local[axisV] += f.v[axisV] * b * half[axisV];
        const p = rotateY(local, box.rotY);
        const jitter = rr(0.97, 1.03) * box.tint * shade;
        // In-plane rotation only when the footprint is isotropic.
        const spin = su === sv ? rr(0, Math.PI) : 0;
        const cs = Math.cos(spin);
        const sn = Math.sin(spin);
        const ru = [0, 1, 2].map((k) => u[k] * cs + v[k] * sn);
        const rv = [0, 1, 2].map((k) => -u[k] * sn + v[k] * cs);
        splats.push({
          p: [p[0] + center[0], p[1] + center[1], p[2] + center[2]],
          s: [su * rr(0.9, 1.15), sv * rr(0.9, 1.15), 0.003],
          q: quatFromBasis(ru, rv, n),
          c: def.color.map((c) => Math.min(1, linearToSrgb(Math.min(1, c * jitter)))),
          a: def.alpha !== undefined ? 0.2 : 0.97,
        });
      }
    }
  }
  return splats;
}

function writeSpz() {
  const splats = sampleSplats();
  const n = splats.length;
  const fractionalBits = 12;
  const buf = Buffer.alloc(16 + n * (9 + 1 + 3 + 3 + 3));
  buf.writeUInt32LE(0x5053474e, 0);
  buf.writeUInt32LE(2, 4);
  buf.writeUInt32LE(n, 8);
  buf.writeUInt8(0, 12);
  buf.writeUInt8(fractionalBits, 13);
  buf.writeUInt8(0, 14);
  buf.writeUInt8(0, 15);
  const u8 = (v) => Math.max(0, Math.min(255, Math.round(v)));
  let o = 16;
  for (const s of splats) {
    for (let k = 0; k < 3; k++) {
      const fixed = Math.round(s.p[k] * (1 << fractionalBits)) & 0xffffff;
      buf[o++] = fixed & 0xff;
      buf[o++] = (fixed >> 8) & 0xff;
      buf[o++] = (fixed >> 16) & 0xff;
    }
  }
  for (const s of splats) buf[o++] = u8(s.a * 255);
  for (const s of splats) {
    for (let k = 0; k < 3; k++) buf[o++] = u8((((s.c[k] - 0.5) / SH_C0) * 0.15 + 0.5) * 255);
  }
  for (const s of splats) {
    for (let k = 0; k < 3; k++) buf[o++] = u8((Math.log(s.s[k]) + 10) * 16);
  }
  for (const s of splats) {
    const len = Math.hypot(...s.q);
    const sign = s.q[3] < 0 ? -1 : 1;
    for (let k = 0; k < 3; k++) buf[o++] = u8(((s.q[k] / len) * sign + 1) * 127.5);
  }
  const gz = gzipSync(buf, { level: 9 });
  writeFileSync(join(outDir, 'atico-mirador.spz'), gz);
  return { splats: n, bytes: gz.byteLength, rawBytes: buf.byteLength };
}

mkdirSync(outDir, { recursive: true });
const glbInfo = await writeGlb();
const spzInfo = writeSpz();

const manifest = {};
for (const file of readdirSync(outDir).sort()) {
  manifest[file] = createHash('sha256').update(readFileSync(join(outDir, file))).digest('hex').slice(0, 12);
}
writeFileSync(join(root, 'src', 'data', 'asset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`boxes: ${boxes.length}`);
console.log(`glb: ${glbInfo.meshes} meshes, ${(glbInfo.bytes / 1024).toFixed(0)} KB`);
console.log(`spz: ${spzInfo.splats} splats, ${(spzInfo.bytes / 1e6).toFixed(2)} MB (raw ${(spzInfo.rawBytes / 1e6).toFixed(2)} MB)`);
