# Third-Party Notices

Cocode is licensed under [MIT](LICENSE). It redistributes and depends on the
third-party software listed below. Each project remains under its own license;
nothing in this file changes those terms.

This file covers components that are **redistributed in source form from this
repository** and the **direct runtime dependencies** that carry a license other
than MIT. The complete transitive dependency closure with exact pinned versions
is recorded in the per-component `pnpm-lock.yaml` files; inspect it with
`pnpm licenses list` inside `cocode-gui`, `cocode-tui`, or
`cocode-host-supervisor`.

## Redistributed source

### DeepSeek Harness client packages

`cocode-gui/packages/client/` contains modified copies of the DeepSeek Harness
client packages (`@deepseek-ai/dsh-client-*`). The upstream MIT license and
copyright notice are preserved in
[`cocode-gui/packages/client/LICENSE`](cocode-gui/packages/client/LICENSE).

| | |
| --- | --- |
| Upstream | [github.com/deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) |
| Copyright | Copyright (c) 2026 DeepSeek |
| License | MIT |
| Modifications | Cocode-specific UI, theming, and integration changes |

### Cordis framework and foundation libraries

`cocode-gui/vendor/` contains the Cordis framework and its foundation libraries
in source form, republished under the `@deepseek-ai` scope by DeepSeek Harness
rather than consumed from npm. Each directory preserves its upstream `LICENSE`
file.

| Package | Upstream name | Upstream | License |
| --- | --- | --- | --- |
| `@deepseek-ai/cordis` | `cordis` | [github.com/cordiverse/cordis](https://github.com/cordiverse/cordis) | MIT |
| `@deepseek-ai/cordis-plugin-loader` | `@cordisjs/plugin-loader` | [github.com/cordiverse/cordis](https://github.com/cordiverse/cordis) | MIT |
| `@deepseek-ai/cosmokit` | `cosmokit` | [github.com/cordiverse/cosmokit](https://github.com/cordiverse/cosmokit) | MIT |
| `@deepseek-ai/schemastery` | `schemastery` | [github.com/shigma/schemastery](https://github.com/shigma/schemastery) | MIT |

All four are MIT, Copyright (c) 2021-present Shigma.

## Runtime dependencies

### DeepSeek Harness

`@cocode/host-supervisor` pins the DeepSeek Harness runtime from npm. These
packages are not vendored into this repository; they are resolved at install
time.

| | |
| --- | --- |
| Packages | `@deepseek-ai/dsh` and its `dsh-*` siblings |
| Upstream | [github.com/deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) |
| License | MIT |

DeepSeek Harness carries its own transitive dependency closure under a mix of
licenses, documented in the upstream `THIRD_PARTY_NOTICES.md`.

### Direct runtime dependencies that are not MIT or ISC

| Package | Used by | License |
| --- | --- | --- |
| [`class-variance-authority`](https://github.com/joe-bell/cva) | `cocode-gui` | Apache-2.0 |
| [`electron-squirrel-startup`](https://github.com/mongodb-js/electron-squirrel-startup) | `cocode-gui` | Apache-2.0 |
| [`tar`](https://github.com/isaacs/node-tar) | `cocode-gui` | BlueOak-1.0.0 |
| [`playwright-core`](https://github.com/microsoft/playwright) | `cocode-host-supervisor` | Apache-2.0 |

Every other direct runtime dependency of `cocode-gui`, `cocode-tui`, and
`cocode-host-supervisor` is MIT or ISC licensed. Their transitive closures are
broader — the GUI closure alone includes Apache-2.0, BSD-2-Clause,
BSD-3-Clause, 0BSD, BlueOak-1.0.0, CC0-1.0, CC-BY-3.0, CC-BY-4.0, MPL-2.0,
Python-2.0, and Unlicense terms.

### Binaries shipped in packaged builds

Electron distributables produced by `make gui-build` embed components that are
not part of the npm dependency graph:

| Component | License |
| --- | --- |
| [Electron](https://github.com/electron/electron) | MIT |
| [Chromium](https://www.chromium.org/) | BSD-3-Clause and the licenses listed in its own credits |
| [Node.js](https://github.com/nodejs/node) | MIT |
| [SQLite](https://sqlite.org/), via `better-sqlite3` | Public domain |

## Trademarks

DeepSeek and DeepSeek Harness are trademarks of their respective owners. Cocode
is an independent distribution and is not affiliated with, endorsed by, or
sponsored by DeepSeek. The MIT license granted for this repository covers
copyright only and does not grant trademark rights.
