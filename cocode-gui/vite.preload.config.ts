import { defineConfig } from "vite"

// https://vitejs.dev/config
export default defineConfig({
	build: {
		lib: {
			entry: "src/preload/index.ts",
			formats: ["cjs"],
			fileName: () => "preload.js",
		},
		rollupOptions: {
			output: {
				format: "cjs",
				entryFileNames: "preload.js",
				chunkFileNames: "[name].js",
				assetFileNames: "[name].[ext]",
			},
		},
	},
})
