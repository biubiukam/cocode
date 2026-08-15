import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { defineConfig, type Plugin } from "vite"

const dshClientRoot = path.resolve(__dirname, "packages/client")
const cocodeClientRoot = path.resolve(__dirname, "packages/cocode")
const dshSource = (relativePath: string): string => path.join(__dirname, relativePath)
const localClient = (relativePath: string): string => path.join(dshClientRoot, relativePath)
const dshClientBundles = findDshClientBundles()

// https://vitejs.dev/config
export default defineConfig({
	base: "./",
	plugins: [dshClientBundlePlugin()],
	resolve: {
		alias: [
			{ find: "@", replacement: path.resolve(__dirname, "src/renderer") },
			{
				find: /^node:module$/,
				replacement: path.resolve(
					__dirname,
					"src/renderer/app/bootstrap/node-module-stub.ts",
				),
			},
			{
				find: /^@deepseek-ai\/dsh-client-web$/,
				replacement: localClient("web/src/index.ts"),
			},
			{
				find: /^@deepseek-ai\/dsh-client-web-react$/,
				replacement: localClient("web-react/src/index.ts"),
			},
			{
				find: /^@deepseek-ai\/dsh-client-ui-slots$/,
				replacement: localClient("ui-slots/src/index.ts"),
			},
			{
				find: /^@deepseek-ai\/dsh-client-ui-primitives$/,
				replacement: localClient("ui-primitives/src/index.ts"),
			},
			{
				find: /^@deepseek-ai\/dsh-client-ui-attachment$/,
				replacement: localClient("ui-attachment/src/index.ts"),
			},
			{
				find: /^@deepseek-ai\/dsh-client-ui-theme\/styles\/(.+)$/,
				replacement: `${localClient("ui-theme/src/styles")}/$1`,
			},
			{
				find: /^@deepseek-ai\/dsh-client-schema-form$/,
				replacement: localClient("schema-form/src/index.ts"),
			},
			{
				find: /^@deepseek-ai\/dsh-client-modules\/client$/,
				replacement: localClient("modules/src/client/index.ts"),
			},
			{
				find: /^@deepseek-ai\/cordis$/,
				replacement: dshSource("vendor/cordis/src/index.ts"),
			},
			{
				find: /^@deepseek-ai\/cordis-plugin-loader$/,
				replacement: dshSource("vendor/loader/src/index.ts"),
			},
			{
				find: /^@deepseek-ai\/cosmokit$/,
				replacement: dshSource("vendor/cosmokit/src/index.ts"),
			},
			{
				find: /^@deepseek-ai\/schemastery$/,
				replacement: dshSource("vendor/schemastery/src/index.ts"),
			},
		],
	},
	define: {
		"process.versions.node": '"0.0.0"',
		"process.execArgv": "[]",
		"process.env.CORDIS_SHARED": "undefined",
	},
})

function findDshClientBundles(): ReadonlyMap<string, string> {
	const bundles = new Map<string, string>()
	for (const source of [
		{ root: dshClientRoot, prefix: "" },
		{ root: cocodeClientRoot, prefix: "cocode" },
	]) {
		if (!existsSync(source.root)) continue
		for (const entry of readdirSync(source.root, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue
			const packageRoot = path.join(source.root, entry.name)
			const manifestPath = path.join(packageRoot, "package.json")
			const clientBundle = path.join(packageRoot, "lib", "client.js")
			if (!existsSync(manifestPath) || !existsSync(clientBundle)) continue
			const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
				dsh?: { client?: { platform?: string } }
			}
			if (manifest.dsh?.client?.platform !== "web") continue
			const directory = source.prefix
				? path.posix.join(source.prefix, entry.name)
				: entry.name
			bundles.set(directory, clientBundle)
		}
	}
	return bundles
}

function dshClientBundlePlugin(): Plugin {
	return {
		name: "dsh-local-client-bundles",
		configureServer(server) {
			server.middlewares.use((request, response, next) => {
				const pathname = new URL(request.url ?? "/", "http://renderer.local").pathname
				const bundleRequest = parseDshClientBundleRequest(pathname)
				const bundle =
					bundleRequest === undefined
						? undefined
						: dshClientBundles.get(bundleRequest.directory)
				const source =
					bundle === undefined
						? undefined
						: `${bundle}${bundleRequest?.sourceMap === true ? ".map" : ""}`
				if (source === undefined || !existsSync(source)) {
					next()
					return
				}
				response.statusCode = 200
				response.setHeader(
					"content-type",
					bundleRequest?.sourceMap === true
						? "application/json; charset=utf-8"
						: "text/javascript; charset=utf-8",
				)
				response.setHeader("cache-control", "no-store")
				response.end(readFileSync(source))
			})
		},
		generateBundle() {
			for (const [directory, source] of dshClientBundles) {
				this.emitFile({
					type: "asset",
					fileName: `dsh-client/${directory}/client.js`,
					source: readFileSync(source),
				})
			}
		},
	}
}

export function parseDshClientBundleRequest(
	pathname: string,
): { readonly directory: string; readonly sourceMap: boolean } | undefined {
	const match = pathname.match(/^\/dsh-client\/(.+)\/client\.js(\.map)?$/)
	if (match?.[1] === undefined) return undefined
	return { directory: match[1], sourceMap: match[2] !== undefined }
}
