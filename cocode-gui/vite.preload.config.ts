import { defineConfig } from "vite"

// https://vitejs.dev/config
export default defineConfig({
	build: {
		rollupOptions: {
			output: {
				entryFileNames: "preload.js",
				chunkFileNames: "[name].js",
				assetFileNames: "[name].[ext]",
			},
		},
	},
})
