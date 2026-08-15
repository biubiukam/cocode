# Cocode TUI

Cocode TUI is a terminal client for DeepSeek Harness sessions.

Requirements: Node.js 22.19.x or Node.js 24 and later, plus a built
`cocode-harness` checkout.

## Install from a release tarball

The TUI package contains the terminal client and Cocode companion plugin. The
agent runtime remains a separately built `cocode-harness` checkout, because it
owns the model providers, filesystem tools, session persistence, and sandbox
plugins.

```sh
# 1. Build the Harness runtime once.
cd /path/to/cocode-harness
pnpm install --frozen-lockfile
pnpm run build

# 2. Install the TUI package.
cd /path/to/cocode-tui
pnpm run build
npm pack
npm install --global ./cocode-tui-0.1.0.tgz

# 3. Point the CLI at the built Harness runtime and check the installation.
export COCODE_HARNESS_ROOT=/path/to/cocode-harness
cocode --doctor
cocode
```

`COCODE_HARNESS_ROOT` must point to a built Harness checkout that contains
`packages/examples/jsonrpc-demo/src/runner.ts` (or its built runner) and
`examples/package.json`.
The CLI keeps the current working directory as the agent workspace. Set
`COCODE_HOME` to isolate credentials, and set `DSH_SESSION_ROOT` when sessions
must live outside the default Harness home.

The first launch shows the authentication choice. You can paste a DeepSeek API
key or sign in to Cocode. The key is stored in the local Cocode configuration,
not in the session log.

After the package is published, the installation command becomes:

```sh
npm install --global @cocode/tui
```

Useful commands:

```sh
cocode --help
cocode --version
cocode --doctor
```

For source checkout development, see [docs/zh/usage.md](./docs/zh/usage.md)
or [docs/en/usage.md](./docs/en/usage.md).
