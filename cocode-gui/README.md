# electron-template

Electron Forge official `vite-typescript` template, constrained for the project's supported development and build environments.

## Requirements

- Node.js `22.12.0` or newer
- pnpm `10.34.5` exactly
- Python 3
- macOS 12 or newer, Windows 10 or newer, or 64-bit Linux
- Supported CPU architectures: `x64` and `arm64`

Use Node Version Manager when available:

```bash
nvm use
```

Enable the pinned pnpm version through Corepack:

```bash
corepack pnpm@10.34.5 --version
```

Check the complete environment before installing or building:

```bash
pnpm check:env
```

## Commands

```bash
pnpm install
pnpm start
pnpm lint
pnpm package
pnpm make
```

The project uses Electron Forge's Vite plugin with separate Vite configurations for the main process, preload script, and renderer.

## GitHub Releases and in-app updates

Packaged Main processes use `update-electron-app` with the public
`update.electronjs.org` service. The app checks the repository from package
`repository` metadata (or `ELECTRON_UPDATE_REPOSITORY`) immediately after startup
and then every 10 minutes. Updates are enabled for signed macOS x64/arm64 and
Windows x64 builds; development, Linux and Windows ARM64 builds do not start the
updater.

When a newer stable SemVer tag is published to GitHub Releases, the matching
macOS ZIP or Windows x64 Squirrel feed is downloaded automatically. The app asks
whether to restart, then stops DSH, closes SQLite and unregisters IPC before
calling `autoUpdater.quitAndInstall()`.

The release workflow keeps Windows ARM64 installers available for manual download,
but excludes their Squirrel `RELEASES`/`.nupkg` metadata from the shared update
feed because x64 and ARM64 cannot safely share one Squirrel feed.
