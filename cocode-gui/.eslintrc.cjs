const path = require("node:path")

module.exports = {
	root: true,
	extends: [
		"@dtyq/eslint-config/base",
		"@dtyq/eslint-config/typescript",
		"@dtyq/eslint-config/react",
		"@dtyq/eslint-config/prettier",
		"plugin:import/electron",
		"plugin:import/typescript",
	],
	parserOptions: {
		project: [path.join(__dirname, "tsconfig.json")],
		tsconfigRootDir: __dirname,
	},
	settings: {
		react: {
			version: "detect",
		},
		"import/resolver": {
			typescript: {
				alwaysTryTypes: true,
				project: path.join(__dirname, "tsconfig.json"),
			},
		},
	},
	ignorePatterns: [
		".vite/",
		"coverage/",
		"dist/",
		"node_modules/",
		"out/",
		"docs/",
		"packages/client/",
		"packages/cocode/",
		"vendor/",
	],
	rules: {
		"react/prop-types": "off",
		"react/react-in-jsx-scope": "off",
		"react/jsx-uses-react": "off",
	},
	overrides: [
		{
			files: ["src/renderer/**/*.{ts,tsx}"],
			env: {
				browser: true,
				node: false,
			},
			rules: {
				"no-restricted-imports": [
					"error",
					{
						paths: [
							{
								name: "electron",
								message:
									"Renderer must use the allow-listed Preload API instead of importing Electron.",
							},
						],
						patterns: [
							{
								group: [
									"node:*",
									"assert",
									"buffer",
									"child_process",
									"crypto",
									"events",
									"fs",
									"http",
									"https",
									"module",
									"net",
									"os",
									"path",
									"process",
									"stream",
									"url",
									"util",
									"worker_threads",
									"zlib",
								],
								message:
									"Renderer must not import Node.js built-ins; move privileged work to Main/Preload.",
							},
						],
					},
				],
			},
		},
		{
			files: ["*.{js,cjs,mjs}", "scripts/**/*.{js,cjs,mjs}"],
			parserOptions: {
				project: null,
			},
			rules: {
				"@typescript-eslint/no-var-requires": "off",
			},
		},
	],
}
