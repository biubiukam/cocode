# @cocode/host-supervisor

Shared local lifecycle control for the Cocode DSH Host. GUI and TUI clients
acquire a lease for the same canonical `DSH_HOME + profile + Host configuration`
scope and then connect directly to the Host's advertised Web or JSON-RPC
endpoint.

> **Project status:** Developer preview. The Supervisor is a local runtime
> component, not a hosted backend. Its public package must be used with a
> matching Cocode GUI/TUI release.

The package owns the Supervisor service, local IPC protocol, lease recovery,
runtime-slot materialization, and the Cocode JSON-RPC Host plugin. Its DSH
runtime comes from the pinned npm dependencies under `@deepseek-ai/*`; it does
not discover sibling checkouts or require a vendored Harness directory.

## Run from source

```sh
cd cocode-host-supervisor
pnpm install
pnpm run build
pnpm typecheck
pnpm test
```

The repository-level development shortcut is:

```sh
cd ..
make install-dsh
make dev dsh
```

## Published package

When a matching public release is available, install the package with:

```sh
npm install @cocode/host-supervisor
cocode-host-supervisor --version
cocode-host-supervisor doctor
```

The GUI and TUI normally start or discover the Supervisor automatically. Direct
clients can use the public API:

```ts
import { connectJsonRpc, createHostSupervisorClient } from '@cocode/host-supervisor'

const lease = await createHostSupervisorClient().acquire({
  scope: {
    dshHome: process.env.DSH_HOME ?? `${process.env.HOME}/.dsh`,
    profile: 'web',
    hostConfigFingerprint: 'cocode-web-jsonrpc-v1',
    runtimeChannel: 'stable',
  },
  clientKind: 'standalone-tui',
  requiredServices: ['jsonrpc'],
  minProtocolRevision: '1.0',
})

const endpoint = lease.descriptor.services.find((service) => service.service === 'jsonrpc')
if (endpoint === undefined) throw new Error('JSON-RPC service was not advertised')
const peer = await connectJsonRpc(endpoint)
// Use peer.request(...) for DSH business RPCs.
peer.close()
await lease.release()
```

Supervisor state lives below `~/.cocode/host-supervisor`; immutable runtime
slots live below `~/.cocode/host-runtimes`. Override those roots with
`COCODE_SUPERVISOR_HOME` and `COCODE_HOST_RUNTIME_HOME` for packaging and tests.

## Build-generated runtime

The repository does not track the generated `runtime/` tree. It is a build
staging directory containing Cocode plugin manifests and compiled plugin entries
that are shipped with the package or copied into an Electron Desktop runtime.
`pnpm run build` generates the standalone Supervisor runtime; the GUI release
build uses `pnpm run build:with-gui-plugins` after building the GUI plugin
bundles. The `prepack` lifecycle runs the standalone build before an npm
tarball is created.

The generated tree is intentionally different from the per-user runtime slots:

```text
runtime/                                      # build output, not source
~/.cocode/host-runtimes/<key>-<version>/      # materialized immutable slot
```

Do not edit files under `runtime/` by hand. Change the plugin sources or their
manifests, then rebuild the Supervisor/runtime.
