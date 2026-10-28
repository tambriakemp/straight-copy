// The same test run as `vitest.config.ts`, with esbuild doing JSX instead of
// SWC.
//
// WHY THIS EXISTS: `@vitejs/plugin-react-swc` loads a native binding, and a
// sandbox whose home directory sits under a world-writable parent refuses to
// materialise it -- the run fails at startup with "Failed to load native
// binding" before a single test is collected. Vite's built-in esbuild
// transform handles the JSX here perfectly well; what SWC adds is Fast
// Refresh, which a test run does not use.
//
//   npx vitest run --config vitest.node.config.mts
//
// `npm run test` remains the gate. This is the same suite, same environment,
// same setup file, for when the binding will not load.
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
