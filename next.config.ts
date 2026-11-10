import type { NextConfig } from "next";

const immutable = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      // Tour assets are requested with a content hash (?v=...), so they can be cached
      // forever by browsers and CDN edges; a re-export changes the URL.
      { source: "/assets/:path*", headers: immutable },
      { source: "/decoders/:path*", headers: immutable },
    ];
  },
};

export default nextConfig;
