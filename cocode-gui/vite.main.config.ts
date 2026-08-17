import { defineConfig } from "vite"

// https://vitejs.dev/config
export default defineConfig({
	define: {
		__COCODE_UPDATE_REPOSITORY_WIN32_ARM64__: JSON.stringify(
			process.env.ELECTRON_UPDATE_REPOSITORY_WIN32_ARM64?.trim() || "",
		),
	},
	build: {
		lib: {
			entry: "src/main/index.ts",
			fileName: () => "main.js",
			formats: ["cjs"],
		},
		rollupOptions: {
			external: ["better-sqlite3"],
		},
	},
})
