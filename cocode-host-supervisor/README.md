# @cocode/host-supervisor

Shared local lifecycle control for the Cocode DSH Host. GUI, Desktop TUI, and
Standalone TUI acquire a lease for the same canonical `DSH_HOME + profile +
Host configuration` and then connect directly to the Host's advertised Web or
JSON-RPC endpoint.

The package owns the Supervisor service, local IPC protocol, lease recovery,
runtime-slot materialization, and the Cocode JSON-RPC Host plugin. Its DSH
runtime comes from the pinned npm dependency `@deepseek-ai/dsh`; it does not
discover sibling checkouts or launch a Harness process.

```sh
npm install @cocode/host-supervisor
cocode-host-supervisor --version
cocode-host-supervisor doctor
```

The public client is available from `@cocode/host-supervisor`:

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
`COCODE_SUPERVISOR_HOME` and `COCODE_HOST_RUNTIME_HOME` for packaging/tests.

## Build-generated runtime

The repository does not track the generated `runtime/` tree. It is a build
staging directory containing the Cocode plugin manifests and compiled plugin
entries that are shipped with the package or copied into an Electron Desktop
runtime. `pnpm run build` generates the standalone Supervisor runtime; the GUI
release build uses `pnpm run build:with-gui-plugins` after building the GUI
plugin bundles. The `prepack` lifecycle runs the standalone build before an npm
tarball is created.

The generated tree is intentionally different from the per-user runtime slots:

```text
runtime/                         # build output, not source
~/.cocode/host-runtimes/<key>-<version>/  # materialized immutable runtime slot
```

Do not edit files under `runtime/` by hand. Change the plugin sources or their
manifests, then rebuild the Supervisor/runtime.
