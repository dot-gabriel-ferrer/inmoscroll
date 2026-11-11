// Renders every tour ahead of time into scroll-driven image sequences:
//   public/prerender/<tour>/<variant>-<time>/0000.webp ...   one frame per scroll step
//   public/prerender/<tour>/<variant>.json                   marker placement per frame
//   src/data/prerender-manifest.json                         what exists, for the app
//
// It builds the static site, opens each tour with `?capture` in headless Chrome and
// steps the real renderer along the scroll, so the frames are exactly what the live
// viewer draws at full quality. Needs a local Chrome (or CHROME_PATH).
//
//   npm run assets:prerender -- [--tour <id>] [--frames 181] [--quality 0.8] [--scale 1] [--skip-build] [--port 4311]

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'out');
const targetDir = join(root, 'public', 'prerender');
const manifestPath = join(root, 'src', 'data', 'prerender-manifest.json');

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const frames = Number(option('frames', 181));
const quality = Number(option('quality', 0.8));
const port = Number(option('port', 4311));
// Multiplies the output resolution; heavy scenes can be rendered smaller.
const scale = Number(option('scale', 1));
const onlyTour = option('tour');

// CSS viewport and device pixel ratio per variant. The portrait one is a phone-sized
// viewport, so it gets the phone layout's framing (camera shifted above the bottom card).
const VARIANTS = {
  landscape: { width: 1280, height: 720, scale: 1 },
  portrait: { width: 360, height: 640, scale: 2 },
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.txt': 'text/plain' };

function serve() {
  const server = createServer((request, response) => {
    let path = normalize(decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (path.endsWith('/')) path += 'index.html';
    const file = join(outDir, path);
    if (!file.startsWith(outDir) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

async function captureTour(browser, id) {
  const dir = join(targetDir, id);
  rmSync(dir, { recursive: true, force: true });
  const hash = createHash('sha1');
  const entry = { frames, times: [], variants: {}, version: '' };
  let bytes = 0;

  for (const [variant, viewport] of Object.entries(VARIANTS)) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.scale * scale,
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => console.error(`  [page] ${error.message}`));
    await page.goto(`http://127.0.0.1:${port}/tour/${id}/?capture`);
    await page.waitForFunction(() => window.__inmoscrollCapture?.ready(), null, { timeout: 180_000 });

    const info = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      return { width: canvas.width, height: canvas.height, times: window.__inmoscrollCapture.times };
    });
    entry.variants[variant] = { width: info.width, height: info.height };
    entry.times = info.times;
    const markers = [];

    for (const time of entry.times) {
      await page.evaluate((value) => window.__inmoscrollCapture.setTime(value), time);
      // Lighting, the frozen shadow map and the lazily loaded effects settle over a few frames.
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.__inmoscrollCapture.frame(0, 'image/webp', 0.5));
      await page.waitForTimeout(500);

      const frameDir = join(dir, `${variant}-${time}`);
      mkdirSync(frameDir, { recursive: true });
      const started = Date.now();
      for (let i = 0; i < frames; i++) {
        const result = await page.evaluate(
          ([progress, q]) => window.__inmoscrollCapture.frame(progress, 'image/webp', q),
          [i / (frames - 1), quality],
        );
        if (!result.image.startsWith('data:image/webp')) throw new Error('This Chrome cannot encode WebP from a canvas');
        const data = Buffer.from(result.image.slice(result.image.indexOf(',') + 1), 'base64');
        writeFileSync(join(frameDir, `${String(i).padStart(4, '0')}.webp`), data);
        hash.update(data);
        bytes += data.byteLength;
        // Marker placement only depends on the camera, not on the lighting.
        if (time === entry.times[0]) markers.push(result.markers);
      }
      console.log(`  ${id} ${variant}-${time}: ${frames} frames in ${Math.round((Date.now() - started) / 1000)} s`);
    }

    const json = JSON.stringify({ frames: markers });
    writeFileSync(join(dir, `${variant}.json`), json);
    hash.update(json);
    await context.close();
  }

  entry.version = hash.digest('hex').slice(0, 10);
  console.log(`  ${id}: ${(bytes / 1e6).toFixed(1)} MB`);
  return entry;
}

if (!args.includes('--skip-build')) {
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, STATIC_EXPORT: '1', NEXT_PUBLIC_BASE_PATH: '' },
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const tourIds = readdirSync(join(outDir, 'tour'), { withFileTypes: true })
  .filter((item) => item.isDirectory() && (!onlyTour || item.name === onlyTour))
  .map((item) => item.name);
if (tourIds.length === 0) throw new Error(onlyTour ? `Unknown tour: ${onlyTour}` : 'No tours found in out/tour');

const server = await serve();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }),
  // Software WebGL when the machine has no GPU (CI, containers).
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

try {
  for (const id of tourIds) {
    console.log(`Rendering ${id}`);
    const entry = await captureTour(browser, id);
    // Re-read on every write so parallel runs on different tours do not clobber each other.
    const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
    manifest[id] = entry;
    const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(manifestPath, `${JSON.stringify(sorted, null, 2)}\n`);
  }
} finally {
  await browser.close();
  server.close();
}
