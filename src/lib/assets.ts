import manifest from '@/data/asset-manifest.json';

const hashes: Record<string, string> = manifest;

/**
 * Resolves a tour asset to its public URL.
 *
 * Assets are served with `Cache-Control: immutable`, so every local URL carries the
 * content hash from the manifest; a re-exported file gets a new URL instead of a
 * stale cache hit. Set NEXT_PUBLIC_ASSET_BASE_URL to serve them from a CDN bucket.
 */
export function assetUrl(file: string): string {
  if (/^https?:\/\//.test(file)) return file;
  const base = (process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? '/assets').replace(/\/$/, '');
  const hash = hashes[file];
  return `${base}/${file}${hash ? `?v=${hash}` : ''}`;
}
