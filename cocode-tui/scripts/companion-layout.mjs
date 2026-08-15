import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Resolve the sibling Harness files used by the TUI companion launcher.
 * Keeping this pure makes the process layout testable without starting a runtime.
 */
export function resolveCompanionRuntimeLayout(
  runnerUrl = new URL('./companion-runner.mjs', import.meta.url),
  env = process.env,
) {
  const scriptDir = fileURLToPath(new URL('.', runnerUrl))
  const tuiRoot = resolve(scriptDir, '..')
  const explicitRoot = env.COCODE_HARNESS_ROOT?.trim()
  const candidateRoots = [
    resolve(tuiRoot, '..', '..', 'cocode-harness'),
    resolve(tuiRoot, '..', 'cocode-harness'),
  ]
  const harnessRoot = explicitRoot
    ? resolve(explicitRoot)
    : candidateRoots.find((candidate) => existsSync(resolve(candidate, 'examples/package.json')))

  if (harnessRoot === undefined) {
    throw new Error(
      'cocode-tui could not find cocode-harness; set COCODE_HARNESS_ROOT to a built Harness checkout',
    )
  }

  const packagedConfig = resolve(scriptDir, 'companion.cordis.yml')
  const configPath = existsSync(packagedConfig)
    ? packagedConfig
    : resolve(tuiRoot, 'companion', 'cordis.yml')
  const builtRunner = resolve(harnessRoot, 'packages/examples/jsonrpc-demo/lib/runner.js')
  const sourceRunner = resolve(harnessRoot, 'packages/examples/jsonrpc-demo/src/runner.ts')
  const runnerPath = existsSync(builtRunner) ? builtRunner : sourceRunner
  const moduleBaseUrl = pathToFileURL(resolve(harnessRoot, 'examples/package.json'))

  return { harnessRoot, runnerPath, configPath, moduleBaseUrl }
}
