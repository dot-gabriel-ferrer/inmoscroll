// GLB optimisation pipeline for tour models.
//
//   node scripts/optimize-glb.mjs <input.glb> <output.glb> [--ktx2]
//
// Geometry: dedup -> weld -> instance -> prune -> EXT_meshopt_compression.
// Textures (--ktx2): Basis Universal via the glTF-Transform CLI, UASTC for normal and
// occlusion/roughness/metalness maps, ETC1S for everything else. This step needs the
// KTX-Software `ktx` binary on PATH (https://github.com/KhronosGroup/KTX-Software).
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, instance, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const args = process.argv.slice(2);
const ktx2 = args.includes('--ktx2');
const [input, output] = args.filter((arg) => !arg.startsWith('--'));
if (!input || !output) {
  console.error('Usage: node scripts/optimize-glb.mjs <input.glb> <output.glb> [--ktx2]');
  process.exit(1);
}

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const document = await io.read(input);
await document.transform(dedup(), weld(), instance(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(output, document);

if (ktx2) {
  const cli = (...cliArgs) => {
    const result = spawnSync('npx', ['--yes', '@gltf-transform/cli', ...cliArgs], { stdio: 'inherit' });
    if (result.status !== 0) {
      console.error('KTX2 conversion failed. Is the KTX-Software `ktx` binary installed and on PATH?');
      process.exit(result.status ?? 1);
    }
  };
  cli('uastc', output, output, '--slots', '{normalTexture,occlusionTexture,metallicRoughnessTexture}', '--level', '4', '--rdo', '--zstd', '18');
  cli('etc1s', output, output, '--quality', '255');
}

const kb = (file) => `${(statSync(file).size / 1024).toFixed(0)} KB`;
console.log(`${input} (${kb(input)}) -> ${output} (${kb(output)})`);
