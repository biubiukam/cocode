# Cocode GUI

Cocode GUI is the Electron desktop client for the shared Cocode DSH Host. It
provides the workspace surface for sessions, files, terminals, diffs, and
attachments while the Host owns agent execution and session persistence.

> **Project status:** Developer preview. This package is a private Electron
> workspace and is built from source as part of the Cocode repository. The
> current release scripts target macOS and Windows artifacts; Linux is supported
> for source builds.

See the [repository README](../README.md) for the overall architecture,
component boundaries, credentials, and TUI setup.

## Requirements

- Node.js `22.12.0` or newer
- pnpm `10.34.5` exactly
- Python 3 for native module builds
- macOS 12 or newer, Windows 10 or newer, or 64-bit Linux
- `x64` or `arm64`

Use Node Version Manager when available:

```sh
nvm use
```

Enable the pinned pnpm version through Corepack:

```sh
corepack pnpm@10.34.5 --version
```

Check the complete environment before installing or building:

```sh
corepack pnpm@10.34.5 check:env
```

## Development

Install dependencies from this directory:

```sh
corepack pnpm@10.34.5 install
```

Useful commands:

```sh
corepack pnpm@10.34.5 dev          # Electron desktop client + Vite
corepack pnpm@10.34.5 dev:web      # Browser-only GUI on :5273
corepack pnpm@10.34.5 typecheck
corepack pnpm@10.34.5 lint
corepack pnpm@10.34.5 test
corepack pnpm@10.34.5 package      # Package for the current platform
corepack pnpm@10.34.5 make         # Build distributables for the current platform
```

During development, the GUI stages the Cocode runtime through the sibling
`cocode-host-supervisor` workspace. It does not require a nested
`cocode-harness` checkout. The repository-level shortcuts are also available:

```sh
cd ..
make install-gui
make dev gui
make dev gui-web
```

The staged runtime is kept in the operating-system cache directory. Refresh or
disable that cache when diagnosing a stale local runtime:

```sh
DSH_FORCE_RESTAGE=1 make dev gui
DSH_DISABLE_RUNTIME_CACHE=1 make dev gui
```

## Host and credentials

The GUI connects to the shared Host through `@cocode/host-supervisor`. To share
sessions with Cocode TUI, use the same `DSH_HOME`, `DSH_PROFILE`, and Host
configuration scope in both clients.

Cocode does not include a hosted backend or a model. You can provide a DeepSeek
API key through the DSH credentials flow, or use a hosted Cocode account where
that separate service is available. Credentials are kept outside the session
log; do not commit local credential files or `.env` files.

## Release behavior

Platform-specific release scripts are:

```sh
corepack pnpm@10.34.5 run release:mac:x64
corepack pnpm@10.34.5 run release:mac:arm64
corepack pnpm@10.34.5 run release:win:x64
corepack pnpm@10.34.5 run release:win:arm64
```

Signed macOS and Windows MSIX builds can use the public Electron update service.
Development and Linux builds do not start the updater.
Windows x64 and ARM64 MSIX packages use the same main product repository with
architecture-specific `win32-x64/msix` and `win32-arm64/msix` routes.

Squirrel.Windows remains a legacy installation format. Packaged x64 Squirrel
applications retain their existing update feed, while ARM64 Squirrel builds do
not start the updater because a shared `RELEASES` asset cannot safely represent
both architectures. Existing ARM64 Squirrel users must reinstall the MSIX build;
automatic Squirrel-to-MSIX migration is not included.

Formal Windows releases require stable `WINDOWS_MSIX_PACKAGE_ID` and
`WINDOWS_MSIX_PUBLISHER` values. The publisher must match the Windows signing
certificate, and both architectures must use the same package identity.

The production macOS release can include a signed PKG that installs
`Cocode.app` and the `cocode` command. Windows installers register the
Desktop-managed `cocode.cmd` shim. Signing, notarization, and release secrets
are required only for maintainers running the release workflow; they are not
needed for local development.

## Contributing

Run the focused checks before opening a pull request:

```sh
corepack pnpm@10.34.5 typecheck
corepack pnpm@10.34.5 lint
corepack pnpm@10.34.5 test
```

See the repository [CONTRIBUTING.md](../CONTRIBUTING.md) and
[SECURITY.md](../SECURITY.md) for contribution and vulnerability-reporting
processes. Build output and the generated runtime are local artifacts and must
not be committed.
