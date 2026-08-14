import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const resolvePath = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Browser carrier is same-origin in production (§4.7); the dev server proxies
  // /api to the harness so no CORS relaxation is ever required on its side.
  const harnessUrl = process.env.COCODE_HARNESS_URL ?? env.COCODE_HARNESS_URL ?? 'http://127.0.0.1:3080'

  return {
    root: '.',
    // Electron loads the build from the filesystem, so every asset URL must be relative.
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      // Exact matches only: a prefix alias would also swallow the CSS subpaths
      // (`@cocode/ui/tokens.css`), which resolve through the package's exports.
      alias: [
        { find: /^@cocode\/gui-connection$/, replacement: resolvePath('./packages/connection/src/index.ts') },
        { find: /^@cocode\/ui$/, replacement: resolvePath('./packages/ui/src/index.ts') },
        { find: /^@deepseek-ai\/cordis$/, replacement: resolvePath('./vendor/cordis/src/index.ts') },
        { find: /^@deepseek-ai\/cosmokit$/, replacement: resolvePath('./vendor/cosmokit/src/index.ts') },
        { find: /^@deepseek-ai\/cordis-plugin-loader$/, replacement: resolvePath('./vendor/loader/src/index.ts') },
      ],
    },
    server: {
      port: 5273,
      strictPort: true,
      proxy: {
        '/api': {
          target: harnessUrl,
          changeOrigin: true,
          ws: true,
          configure(proxy) {
            // The harness refuses any /api request whose Origin is not its own
            // authority — a DNS-rebinding defence, not an auth layer. This dev
            // proxy stands in for the production reverse proxy, whose whole job is
            // to make the frontend and the API one origin, so it presents the
            // rewritten Origin the same way. The dev server itself binds loopback.
            const origin = new URL(harnessUrl).origin
            proxy.on('proxyReq', request => { request.setHeader('origin', origin) })
            proxy.on('proxyReqWs', request => { request.setHeader('origin', origin) })
          },
        },
      },
    },
    define: {
      'process.env.CORDIS_SHARED': 'undefined',
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
    },
  }
})
