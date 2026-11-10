// Self-hosts the WASM decoders the GLB pipeline needs (Draco meshes, KTX2/Basis textures)
// so the viewer never depends on a third-party CDN.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const libs = join(root, 'node_modules', 'three', 'examples', 'jsm', 'libs');

const copies = [
  ['basis/basis_transcoder.js', 'basis/basis_transcoder.js'],
  ['basis/basis_transcoder.wasm', 'basis/basis_transcoder.wasm'],
  ['draco/gltf/draco_decoder.js', 'draco/draco_decoder.js'],
  ['draco/gltf/draco_decoder.wasm', 'draco/draco_decoder.wasm'],
  ['draco/gltf/draco_wasm_wrapper.js', 'draco/draco_wasm_wrapper.js'],
];

for (const [from, to] of copies) {
  const target = join(root, 'public', 'decoders', to);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(libs, from), target);
}
console.log(`Copied ${copies.length} decoder files to public/decoders`);
