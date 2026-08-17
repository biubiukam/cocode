# Cocode TUI

Cocode TUI is a terminal client for sessions hosted by the shared Cocode DSH
Host. It is designed for keyboard-first work, SSH sessions, and machines
without a graphical environment.

> **Project status:** Developer preview. The source workspace is authoritative;
> use a matching published `@cocode/tui` and `@cocode/host-supervisor` version
> only when both are listed in the same release.

## Requirements

- Node.js `22.19.x` or Node.js `24` and later
- A real TTY for interactive mode
- `DSH_HOME` and `DSH_PROFILE` when selecting a non-default Host scope

## Run from source

```sh
cd cocode-tui
pnpm install
pnpm run build
node ./bin/cocode-tui.mjs --doctor
node ./bin/cocode-tui.mjs
```

From the repository root, the same flow is available through:

```sh
make install-tui
make dev tui
```

The CLI discovers or starts the shared Supervisor automatically. It keeps the
current working directory as the agent workspace. Set `DSH_HOME` and
`DSH_PROFILE` to select the shared Host scope, or set
`COCODE_HOST_CONFIG_FINGERPRINT` when a custom Host composition is required.
`COCODE_HOME` isolates Cocode credentials, while `DSH_SESSION_ROOT` can move
session files when needed.

## Credentials

The first launch shows the authentication choice. You can paste a DeepSeek API
key or sign in to a hosted Cocode service where available. DeepSeek keys use the
DSH credentials file under `$DSH_HOME`; hosted identity tokens use
`account.yaml` under `~/.cocode`. Neither is stored in the session log.

## Package publishing

The package metadata is prepared for the public `@cocode/tui` package. A
published tarball must contain a versioned `@cocode/host-supervisor` dependency;
the source workspace currently resolves that package from its sibling directory.
Do not treat a locally packed tarball as an independently installable release
until the matching Supervisor package is published.

After a matching release is published, the intended installation command is:

```sh
npm install --global @cocode/tui
```

Useful commands:

```sh
cocode --help
cocode --version
cocode --doctor
```

For source-checkout usage and configuration details, see
[docs/zh/usage.md](./docs/zh/usage.md) or
[docs/en/usage.md](./docs/en/usage.md).
