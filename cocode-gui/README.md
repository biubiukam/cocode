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
