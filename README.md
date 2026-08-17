# Cocode

**A ready-to-run DeepSeek Harness distribution.**

[English](README.md) · [简体中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **Project status:** Developer preview. The repository supports source builds on
> macOS, Windows, and Linux; the current release scripts target macOS and
> Windows artifacts. Cocode is an independent distribution, and this repository
> does not include a hosted backend or a vendored Harness checkout.

DeepSeek Harness is a composable agent runtime — every capability is a plugin,
and you assemble it through configuration. Cocode is the distribution that ships
it already assembled: models, tools, skills, sessions, and permission boundaries
come preconfigured, so you open the app and start on the task instead of on the
plugin tree.

Cocode hands coding goals to a recoverable, verifiable, controllable workspace.
It keeps pushing the task forward, pauses for your confirmation before writing
files, running commands, or accessing the network — before dangerous actions —
and returns with the changes, the tests it ran, and the conclusions — all on
one auditable task timeline.

> Cocode is built on the DeepSeek Harness developer preview. It is not an
> official DeepSeek product, and upstream compatibility may change.

---

## Two entry points, one session

| | |
| --- | --- |
| **Cocode GUI** | A desktop workspace built on Electron. Sessions, files, terminals, and runtime state live on one surface. Diffs and attachments open in a preview panel, so you see exactly what changed before you confirm. |
| **Cocode TUI** | A terminal client for keyboard-first and remote work. SSH into a machine and keep pushing tasks with no graphical environment required. |

Both attach to the same Host through `@cocode/host-supervisor`, so they can share
sessions and task state when they use the same `DSH_HOME`, profile, and Host
configuration scope. Switching between the desktop app and the terminal does
not reset your work within that scope.

## Repository layout

This repository is not a single workspace. Each component is an independent
pnpm workspace with its own lockfile and toolchain, tied together by a root
`Makefile`.

```text
cocode/
├── cocode-gui/               # Electron desktop / web GUI  (@cocode/gui-root)
├── cocode-tui/               # Terminal client             (@cocode/tui)
├── cocode-host-supervisor/   # Shared DSH Host lifecycle   (@cocode/host-supervisor)
├── Makefile                  # Root dev shortcuts
└── AGENTS.md                 # Engineering contract for contributors and agents
```

The runtime itself is not vendored here. `@cocode/host-supervisor` pins
`@deepseek-ai/dsh` from npm and owns the Supervisor service, the local IPC and
lease protocol, runtime-slot materialization, and the Cocode JSON-RPC Host
plugin. GUI and TUI never launch a Harness process themselves — they acquire a
lease for a canonical `DSH_HOME + profile + Host configuration` scope and connect
to the endpoint the Host advertises.

```text
Cocode GUI ─┐
            ├─→ @cocode/host-supervisor ─→ @deepseek-ai/dsh (npm) ─→ models · tools · sessions
Cocode TUI ─┘
```

If you are working on the Harness runtime itself, use a sibling clone at
`../cocode-harness`. A nested copy inside this repository is gitignored on
purpose and is not part of the public source tree.

## Requirements

The three components do not share a toolchain baseline. Check the one you plan
to build:

| Component | Node.js | pnpm |
| --- | --- | --- |
| `cocode-gui` | `>=22.12.0` (see `.nvmrc`) | `10.34.5` exactly |
| `cocode-tui` | `^22.19` or `>=24` | any recent version |
| `cocode-host-supervisor` | `>=22.12.0` | any recent version |

The GUI additionally needs Python 3 for native module builds, and source builds
run on macOS 12+, Windows 10+, or 64-bit Linux, on `x64` and `arm64`. The current
release scripts target macOS and Windows; Linux users should use a source build
unless a Linux artifact is listed for a release.

Use Corepack so the GUI gets its pinned pnpm:

```sh
corepack pnpm@10.34.5 --version
```

## Getting started

Every target below runs from the repository root.

```sh
# Desktop workspace: Electron client + Vite on :5273
make install-gui
make dev gui

# Terminal client (requires a TTY; preflight installs deps and refreshes the Host runtime)
make install-tui
make dev tui

# Browser-only GUI, useful for design-system work
make dev gui-web

# The Host on its own, for wire-protocol debugging
make install-dsh
make dev dsh
```

Run `make` with no arguments to list every target.

### The `cocode` command

After installing the TUI or desktop build, `cocode` is the unified entry point. With no subcommand it keeps the existing behavior and opens the TUI. GUI, TUI, and Host management use the same environment-derived Host scope, so different clients can attach to the same Host.

```sh
cocode --version                 # Show the installed version
cocode gui                       # Open the GUI
cocode tui                       # Open the TUI
cocode host status               # Inspect the shared Host without starting it
cocode host status --json        # Print machine-readable status
cocode host stop                 # Stop Host and Supervisor when no clients hold leases
cocode host stop --force         # Explicitly interrupt GUI/TUI clients that hold leases
cocode doctor                    # Check TUI, Supervisor, and Host connectivity
```

`--dsh-home <path>`, `--profile <name>`, and `--runtime-channel stable|preview|dev` can be placed before or after a subcommand to select the Host scope. If the GUI cannot be located automatically on a platform, set `COCODE_GUI_EXECUTABLE` (or the `COCODE_GUI_PATH` alias) to its executable path.

The GUI reuses a staged runtime in the OS cache directory. Two escape hatches
when that cache goes stale:

```sh
DSH_FORCE_RESTAGE=1 make dev gui        # refresh the cache
DSH_DISABLE_RUNTIME_CACHE=1 make dev gui  # isolated runtime, no cache
```

### Checks before you open a pull request

```sh
cd cocode-gui  && corepack pnpm@10.34.5 typecheck && corepack pnpm@10.34.5 lint && corepack pnpm@10.34.5 test
cd cocode-tui  && pnpm typecheck && pnpm lint && pnpm test
cd cocode-host-supervisor && pnpm typecheck && pnpm test
```

### Building distributables

```sh
make gui-build      # Electron Forge installers for the current platform
```

Platform-specific release builds live in `cocode-gui`, as
`release:mac:x64`, `release:mac:arm64`, `release:win:x64`, and
`release:win:arm64`.

The GUI is a private Electron workspace rather than an npm application package.
The TUI and Host Supervisor have public publish configuration, but registry
installation should only use matching versions listed in the same GitHub
Release and npm release.

## Models and credentials

Cocode does not bundle a model or a hosted backend. You supply access in one of
two ways:

- **Your own key.** Paste a DeepSeek API key on first launch. It is stored in the
  DSH credentials file under `$DSH_HOME` and never enters the session log.
- **A hosted Cocode account, where available.** Hosted service availability,
  model lineup, pricing, and account requirements are controlled by that
  separate service and are not part of this repository. Identity tokens live in
  `account.yaml` under `~/.cocode`. See the [hosted service
  documentation](https://cocode.agency/nut).

Relevant environment variables: `DSH_HOME` and `DSH_PROFILE` select the shared
Host scope, `COCODE_HOST_CONFIG_FINGERPRINT` pins a custom Host composition,
`COCODE_HOME` isolates Cocode credentials, and `DSH_SESSION_ROOT` relocates
session files.

## Documentation

| | |
| --- | --- |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Contribution workflow, checks, and change boundaries |
| [`SECURITY.md`](SECURITY.md) | Vulnerability reporting process |
| [`cocode-tui/docs/`](cocode-tui/docs/) | TUI user guides, in English and Chinese |
| [`cocode-host-supervisor/README.md`](cocode-host-supervisor/README.md) | Supervisor lease protocol and client API |
| [`cocode-gui/README.md`](cocode-gui/README.md) | GUI development, packaging, and update behavior |
| [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) | Third-party sources and license notices |

Product documentation lives at [doc.cocode.agency](https://doc.cocode.agency).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) first — it covers the commit convention,
which checks are mandatory, and how changes are scoped across the three
components. Please keep changes focused on the component they affect and avoid
committing local runtimes, caches, credentials, or generated output.

To report a security vulnerability, follow [SECURITY.md](SECURITY.md) rather than
opening a public issue.

## License

[MIT](LICENSE) © 2026 Cocode Agency.

Third-party components, including DeepSeek Harness and the source-vendored
Cordis framework, keep their own licenses. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

[cocode.agency](https://cocode.agency) · [Documentation](https://doc.cocode.agency) · [Download](https://cocode.agency/download)
