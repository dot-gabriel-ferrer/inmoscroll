/// <reference lib="webworker" />
import { decodeKsplat } from './decodeKsplat';
import { decodeSplat } from './decodeSplat';
import { decodeSpz, gunzip } from './decodeSpz';
import { packSplats } from './pack';
import { createSortScratch, sortSplatsBackToFront, type SortScratch } from './sort';
import { detectSplatFormat, type SplatData, type SplatWorkerRequest, type SplatWorkerResponse } from './types';

// Dedicated worker: download, decode and depth-sort splats off the main thread.
const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: SplatWorkerResponse, transfer: Transferable[] = []) => ctx.postMessage(message, transfer);

let positions: Float32Array | null = null;
let count = 0;
let scratch: SortScratch | null = null;

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo descargar la escena (HTTP ${response.status})`);
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    post({ type: 'progress', loaded, total });
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function load(url: string) {
  const format = detectSplatFormat(url);
  const bytes = await download(url);
  let data: SplatData;
  if (format === 'spz') data = decodeSpz(await gunzip(bytes));
  else if (format === 'ksplat') data = decodeKsplat(bytes);
  else data = decodeSplat(bytes);

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < data.count; i++) {
    for (let k = 0; k < 3; k++) {
      const v = data.positions[i * 3 + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }

  const packed = packSplats(data);
  positions = data.positions;
  count = data.count;
  scratch = createSortScratch(count);
  post(
    { type: 'loaded', count, texture: packed.texture, width: packed.width, height: packed.height, boundsMin: min, boundsMax: max },
    [packed.texture.buffer],
  );
}

ctx.onmessage = (event: MessageEvent<SplatWorkerRequest>) => {
  const message = event.data;
  if (message.type === 'load') {
    load(message.url).catch((error: unknown) =>
      post({ type: 'error', message: error instanceof Error ? error.message : String(error) }),
    );
  } else if (message.type === 'sort' && positions && scratch) {
    const out = message.recycle && message.recycle.length === count ? message.recycle : new Uint32Array(count);
    const [dx, dy, dz] = message.direction;
    sortSplatsBackToFront(positions, count, dx, dy, dz, out, scratch);
    post({ type: 'sorted', order: out }, [out.buffer]);
  }
};
