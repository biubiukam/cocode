# DSH runtime context

The DSH runtime is a managed sidecar shipped inside the Electron application. Electron starts it with the embedded Electron Node runtime, so an installed desktop user does not need a separate Node.js, pnpm, or `dsh` executable.

Development and production resolve the independent `@cocode/host-supervisor` runtime. The Supervisor owns an immutable `@deepseek-ai/dsh` npm closure, starts one shared Host per canonical `DSH_HOME + profile + configuration`, and exposes the Host Web endpoint to Electron. Electron never discovers or starts a Harness checkout.

The sidecar owns the existing DSH Web HTTP and WebSocket protocol. Electron loads
the local Forge Renderer build, while Main reads the sidecar's
`window.__DSH_BOOT__` manifest and returns it through the narrow `desktopApi.dsh`
bridge. Local `packages/client/*/lib/client.js` artifacts are emitted under the
Renderer build's `dsh-client/` tree; non-copied host bundles continue to resolve
against the sidecar origin.

The sidecar follows the official DSH home resolution contract: a non-blank
`DSH_HOME` value is used when present, otherwise the home defaults to `~/.dsh`.
This keeps Electron and the standalone Cocode/DSH launcher on the same profiles,
settings and plugin dependency state. Electron-specific composition is supplied
as a separate `--patch` overlay generated under the application's own `userData`
directory, so the patch artifact itself is not stored in the DSH home. Do not
run incompatible DSH versions concurrently against the same home because the
official launcher may heal `profiles/node_modules` and profile files during boot.

HTTP `/api` traffic crosses the typed Preload/Main request bridge so a
`file://`/Vite Renderer never depends on CORS. The two WebSocket downlinks remain
native browser sockets; the Main shell rewrites only their trust markers for the
loopback sidecar before the connection plugin's existing Host/Origin fence runs.
The development-only `client-hmr` entry is retained for Vite development but is
removed from packaged boot so its `/plugins/events` SSE route is never resolved
relative to `file://`.

Electron development owns the missing source-build half of that HMR chain.
`scripts/start-with-dsh-runtime.mjs` starts `scripts/watch-dsh-client.mjs` before
Forge. The watcher discovers packages declaring `dsh.client.platform: web`,
rebuilds only a missing, stale or changed package's browser bundle from its local
`src/client` entry, and atomically mirrors the emitted `lib/client.js` into the
staged sidecar runtime. The sidecar's existing `client-hmr` poller then observes
the mirrored bundle hash, emits a `/plugins/events` rebuilt frame and lets the
browser replace the affected Cordis plugin fiber without reloading the page.
Local Vite bundle responses are `no-store` so the replacement always executes
the newly emitted bytes.
Main stops the sidecar before Electron quits; a failed readiness or bootstrap
handshake leaves a diagnostic startup surface instead of exposing a partially
mounted UI.
