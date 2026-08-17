# Contributing to Cocode

Thanks for taking the time to contribute. This document covers what you need to
know before opening an issue or a pull request.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

**Security issues do not belong in the public tracker.** If you have found a
vulnerability, follow [SECURITY.md](SECURITY.md) instead.

For anything larger than a bug fix, open an issue first and describe the problem
before writing code. Substantial changes to architecture, wire protocols, or the
design system should land as an RFC in the relevant component's `.dev/rfc/`
directory — [`cocode-gui/.dev/rfc/`](cocode-gui/.dev/rfc/) or
[`cocode-tui/.dev/rfc/`](cocode-tui/.dev/rfc/) — and be discussed before
implementation. This saves you from building something that conflicts with work
already in flight.

## Know which component you are changing

The repository holds three independently installed components, and a change
usually belongs to exactly one of them.

| Component | Owns |
| --- | --- |
| `cocode-gui` | Desktop and web UI, design system, Electron shell |
| `cocode-tui` | Terminal UI and its JSON-RPC client |
| `cocode-host-supervisor` | Host lifecycle, lease protocol, JSON-RPC Host plugin |

The agent runtime is **not** in this repository. `@deepseek-ai/dsh` is a pinned
npm dependency of `cocode-host-supervisor`, and upstream work belongs in
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). If a feature
needs a runtime capability that does not exist yet, land the capability upstream
first, then consume the wire API here.

[`AGENTS.md`](AGENTS.md) describes these boundaries in more detail.
[`cocode-gui/AGENTS.md`](cocode-gui/AGENTS.md) is the binding architecture
contract for GUI code — DDD layering, IPC rules, TypeScript conventions, and the
React and Tailwind baseline. Read it before touching `cocode-gui/src`.

## Development setup

Each component installs separately. See the [README](README.md#requirements) for
the Node.js and pnpm versions each one needs — they are not the same, and the GUI
pins pnpm exactly.

```sh
make install-gui && make dev gui   # desktop workspace
make install-tui && make dev tui   # terminal client (needs a TTY)
make dev gui-web                   # browser-only GUI
```

`make` on its own lists every target.

## Making a change

Keep changes minimal and scoped. Prefer the smallest edit that fixes the problem
over a broad refactor that happens to include it. Do not leave deprecated code
paths behind — update every call site instead.

New behavior should come with a test at the lowest useful layer: unit tests for
domain rules, integration tests for adapters and IPC contracts, component tests
for non-trivial UI behavior.

Do not commit build output. `cocode-gui/packages/**/lib/`,
`cocode-host-supervisor/runtime/`, and the various `dist/` and `out/` trees are
generated and gitignored.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/),
enforced by commitlint on the `commit-msg` hook. Headers are limited to 72
characters.

```text
feat(gui): add diff preview to the approval panel
fix(tui): restore session after a dropped supervisor lease
docs: document DSH_SESSION_ROOT
```

Supported types: `build`, `chore`, `ci`, `config`, `docs`, `feat`, `fix`,
`major`, `perf`, `refactor`, `revert`, `style`, `test`.

Write commit messages and code comments in English.

## Checks

A `pre-commit` hook runs lint-staged for whichever components have staged files.
Run the full checks for the component you changed before opening a pull request:

```sh
# cocode-gui
cd cocode-gui
corepack pnpm@10.34.5 format:check
corepack pnpm@10.34.5 typecheck
corepack pnpm@10.34.5 lint
corepack pnpm@10.34.5 test

# cocode-tui
cd cocode-tui
pnpm format:check && pnpm typecheck && pnpm lint && pnpm test

# cocode-host-supervisor
cd cocode-host-supervisor
pnpm typecheck && pnpm test
```

If a check cannot run because your environment does not satisfy the declared
`engines`, say so in the pull request with the exact versions and failure. Do not
relax the constraints to make it pass.

GUI changes that touch components or design tokens should be verified against
[`cocode-gui/.dev/guide/design-system.html`](cocode-gui/.dev/guide/design-system.html),
which is the visual source of truth.

## Pull requests

Describe what changed and why, link the issue it closes, and note anything you
deliberately left out. Include before/after screenshots for visible UI changes.
State which checks you ran.

Keep pull requests focused on one thing. Unrelated formatting churn makes review
slower and is likely to be sent back.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE) that covers this project.
