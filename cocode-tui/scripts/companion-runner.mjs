#!/usr/bin/env node
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDir = fileURLToPath(new URL('.', import.meta.url))
const tuiRoot = resolve(scriptDir, '..')
const harnessRoot = resolve(tuiRoot, '..', 'cocode-harness')
const configPath = resolve(tuiRoot, 'companion', 'cordis.yml')
const runnerPath = resolve(harnessRoot, 'packages/examples/jsonrpc-demo/src/runner.ts')

// The generic Harness runner remains unchanged. This local launcher supplies
// the sibling Harness module root so bare Harness plugins resolve correctly
// while the config and companion plugin remain owned by cocode-tui.
// The companion composition is part of this TUI checkout. Ignore a stale
// legacy value so the launcher cannot accidentally load the official SDK
// server or a configuration owned by the sibling runtime.
process.env.DSH_CORDIS_CONFIG = configPath
const { runJsonrpcAgent } = await import(pathToFileURL(runnerPath).href)
await runJsonrpcAgent(pathToFileURL(harnessRoot).href)
