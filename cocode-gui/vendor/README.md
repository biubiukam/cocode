# Vendored Packages

Pinned copies of the Cordis framework used by the GUI renderer. Same upstream
commits as `cocode-harness/vendor/README.md`. Do not depend on a local harness
checkout via `file:`.

| Directory | npm name | Upstream | Commit |
|---|---|---|---|
| `cosmokit/` | `@deepseek-ai/cosmokit` | cosmokit 1.8.1 | `16f6fc058ade66e8ac5da0033d35a8d0f279f544` |
| `cordis/` | `@deepseek-ai/cordis` | cordis 4.0.0-rc.7 | `56b3d4f725681cf4556c1a8695a709cc3b6eed74` |
| `loader/` | `@deepseek-ai/cordis-plugin-loader` | `@cordisjs/plugin-loader` 1.0.0-rc.5 | `56b3d4f725681cf4556c1a8695a709cc3b6eed74` |

## Local modifications

1. **Package exports** point at `src/` so Vite and TypeScript consume the
   TypeScript source directly (this tree does not build `lib/`).
2. **`loader/src/internal.ts`**: `fromInternal()` always returns `undefined`.
   The Node cascaded-loader probe imports `node:module` and cannot run in the
   renderer. Boot uses `loader.builtins` (`cordis:` specifiers).
3. **`loader/src/index.ts`**: `envData` reads `process.env.CORDIS_SHARED` only
   when `process` exists.
4. **`// @ts-nocheck`** on vendor sources. The GUI typechecks against this
   tree's `strict` settings; upstream is not written for that.
