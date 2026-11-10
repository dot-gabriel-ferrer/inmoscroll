import manifest from '@/data/asset-manifest.json';

const hashes: Record<string, string> = manifest;

/** Sub-path the app is served from ("" at the domain root). */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '');

/** Prefixes a file in `public/` with the base path; plain strings bypass Next's own handling. */
export function publicUrl(path: string): string {
  return `${basePath}${path}`;
}

/**
 * Resolves a tour asset to its public URL.
 *
 * Assets are served with `Cache-Control: immutable`, so every local URL carries the
 * content hash from the manifest; a re-exported file gets a new URL instead of a
 * stale cache hit. Set NEXT_PUBLIC_ASSET_BASE_URL to serve them from a CDN bucket.
 */
export function assetUrl(file: string): string {
  if (/^https?:\/\//.test(file)) return file;
  const base = (process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? publicUrl('/assets')).replace(/\/$/, '');
  const hash = hashes[file];
  return `${base}/${file}${hash ? `?v=${hash}` : ''}`;
}
