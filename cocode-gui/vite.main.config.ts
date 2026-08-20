import { defineConfig } from "vite"
import { externalizeDepsPlugin } from "electron-vite"
import { MAIN_BUNDLED_DEPENDENCIES } from "./scripts/release/runtime-dependencies"

// https://vitejs.dev/config
export default defineConfig({
	plugins: [externalizeDepsPlugin({ exclude: [...MAIN_BUNDLED_DEPENDENCIES] })],
	build: {
		lib: {
			entry: "src/main/index.ts",
			fileName: () => "main.mjs",
			formats: ["es"],
		},
		rollupOptions: {
			external: ["better-sqlite3"],
		},
	},
})
