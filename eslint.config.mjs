import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // WASM decoder glue copied from three.js by scripts/copy-decoders.mjs.
    "public/decoders/**",
  ]),
  {
    // three.js objects handed out by React Three Fiber (renderer, camera, lights) are
    // mutable by design; the React Compiler immutability rule does not apply to them.
    files: ["src/components/three/**"],
    rules: { "react-hooks/immutability": "off" },
  },
]);

export default eslintConfig;
