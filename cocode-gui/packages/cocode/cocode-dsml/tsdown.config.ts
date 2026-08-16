import type { UserConfig } from "tsdown"

export default [
  {
    entry: { index: "src/index.ts" },
    outDir: "lib",
    format: ["esm"],
    platform: "node",
    dts: false,
    clean: false,
    outputOptions: { entryFileNames: "index.js" },
  },
] satisfies UserConfig[]
