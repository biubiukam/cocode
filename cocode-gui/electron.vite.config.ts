import path from "node:path"
import { defineConfig } from "electron-vite"
import { mergeConfig } from "vite"
import mainConfig from "./vite.main.config"
import preloadConfig from "./vite.preload.config"
import rendererConfig from "./vite.renderer.config"

const root = path.resolve()
const mergedPreloadConfig = mergeConfig(preloadConfig, {
	root,
	build: {
		outDir: path.resolve(root, ".vite/build"),
		watch: {},
		emptyOutDir: false,
	},
})

/**
 * Electron-vite's three-process configuration.
 *
 * The output layout intentionally matches the paths used by the existing
 * Electron entrypoint and packaged-resource checks:
 *
 *   .vite/build/main.mjs
 *   .vite/build/preload.js
 *   .vite/renderer/main_window/index.html
 *
 * Renderer-specific middleware and aliases remain owned by
 * `vite.renderer.config.ts`; this file only supplies the electron-vite
 * process boundaries and the stable output contract.
 */
export default defineConfig({
	main: mergeConfig(mainConfig, {
		root,
		build: {
			outDir: path.resolve(root, ".vite/build"),
			watch: {},
			rollupOptions: {
				output: {
					entryFileNames: "main.mjs",
					chunkFileNames: "[name].js",
					assetFileNames: "[name].[ext]",
				},
			},
		},
	}),
	preload: {
		...mergedPreloadConfig,
		build: {
			...mergedPreloadConfig.build,
			// Sandboxed preload scripts cannot resolve ordinary app dependencies at
			// runtime; keep the bundle self-contained (apart from Electron itself).
			externalizeDeps: false,
		},
	},
	renderer: mergeConfig(rendererConfig, {
		root,
		define: {
			__COCODE_ELECTRON_DESKTOP__: "true",
		},
		build: {
			outDir: path.resolve(root, ".vite/renderer/main_window"),
			rollupOptions: {
				input: path.resolve(root, "index.html"),
			},
		},
	}),
})
