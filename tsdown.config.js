import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    index: "src/index.js",
    "bin/gateway": "src/bin/gateway.js",
  },
  outDir: "dist",
  clean: true,
  format: "esm",
  platform: "node",
  target: "node22.18",
  shims: true,
  dts: false,
  unbundle: true,
  publint: {
    level: "error",
  },
  deps: {
    neverBundle: [/^@opencode-ai\/sdk$/, /^commander$/, /^execa$/, /^grammy$/, /^pino$/, /^zod$/],
  },
})
