#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolveCompanionRuntimeLayout } from './companion-layout.mjs'

let layout
try {
  layout = resolveCompanionRuntimeLayout(import.meta.url)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}

const { configPath, runnerPath, moduleBaseUrl } = layout

if (!existsSync(runnerPath) || !existsSync(fileURLToPath(moduleBaseUrl))) {
  process.stderr.write(
    'cocode-tui found COCODE_HARNESS_ROOT, but the Harness is not built; run `pnpm run build` in that checkout\n',
  )
  process.exit(1)
}

// The generic Harness runner remains unchanged. This local launcher resolves
// bare plugins through the sibling Harness examples workspace while the config
// and companion plugin remain owned by cocode-tui.
// The companion composition is part of this TUI checkout. Ignore a stale
// legacy value so the launcher cannot accidentally load the official SDK
// server or a configuration owned by the sibling runtime.
process.env.DSH_CORDIS_CONFIG = configPath
const { runJsonrpcAgent } = await import(pathToFileURL(runnerPath).href)
await runJsonrpcAgent(moduleBaseUrl.href)
