import type { NextConfig } from "next";

const immutable = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];

// STATIC_EXPORT=1 builds a fully static site into `out/` (GitHub Pages and other static
// hosts). NEXT_PUBLIC_BASE_PATH is the sub-path the site is served from, e.g. "/inmoscroll".
const staticExport = process.env.STATIC_EXPORT === "1";
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // Partial prerendering cannot be exported; every route here is fully static anyway.
  cacheComponents: !staticExport,
  partialPrefetching: !staticExport,
  basePath,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  ...(staticExport
    ? {
        output: "export" as const,
        // Emits /tour/<id>/index.html, which any static host resolves without rewrites.
        trailingSlash: true,
      }
    : {
        // Custom headers need a server; static hosts apply their own cache policy.
        async headers() {
          return [
            // Tour assets are requested with a content hash (?v=...), so they can be
            // cached forever by browsers and CDN edges; a re-export changes the URL.
            { source: "/assets/:path*", headers: immutable },
            { source: "/decoders/:path*", headers: immutable },
          ];
        },
      }),
};

export default nextConfig;
