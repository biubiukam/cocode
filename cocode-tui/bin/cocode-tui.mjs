#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

import {
  applyScopeOptions,
  formatHostStatus,
  launchGui,
  parseCliArgs,
  stagedPaths,
  usage,
} from './cli.mjs'

const require = createRequire(import.meta.url)
const paths = stagedPaths(import.meta.url)
let options

try {
  options = parseCliArgs(process.argv.slice(2))
  applyScopeOptions(options)
} catch (error) {
  process.stderr.write(`cocode: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(2)
}

if (options.help) {
  process.stdout.write(usage(paths.packageJson.version))
  process.exit(0)
}
if (options.version) {
  process.stdout.write(`${paths.packageJson.version}\n`)
  process.exit(0)
}

if (options.command === 'gui') {
  try {
    launchGui(options.commandArgs, process.env)
  } catch (error) {
    process.stderr.write(`cocode gui: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
  process.exit(0)
}

if (options.command === 'host-status' || options.command === 'host-stop' || options.command === 'doctor') {
  await configureRuntimeEnvironment(paths)
  const { createHostSupervisorClient, resolveHostRuntimeEnv, resolveHostScope } = await loadSupervisor(paths)
  const scope = resolveHostScope(process.env)
  const runtimeEnv = resolveHostRuntimeEnv(process.env)
  if (options.command === 'host-status') {
    const descriptor = await createHostSupervisorClient().status(scope)
    process.stdout.write(formatHostStatus(descriptor, options.json))
    process.exit(0)
  }
  if (options.command === 'host-stop') {
    try {
      const result = await createHostSupervisorClient().stop(scope, { force: options.force })
      process.stdout.write(result.stopped ? `stopped Host${result.descriptor ? ` (pid ${result.descriptor.hostPid})` : ''}\n` : 'Host is not running.\n')
      process.exit(0)
    } catch (error) {
      process.stderr.write(`cocode host stop: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exit(1)
    }
  }
  await runDoctor(paths, scope, runtimeEnv)
}

if (options.command !== 'tui') process.exit(0)

const entry = paths.tuiEntry
if (!existsSync(entry)) {
  process.stderr.write('Cocode TUI is missing its build output. Run `pnpm run build` first.\n')
  process.exit(1)
}
const result = spawnSync(process.execPath, [entry, ...options.commandArgs], { cwd: process.cwd(), env: process.env, stdio: 'inherit' })
if (result.error) {
  process.stderr.write(`Cocode TUI failed to start: ${result.error.message}\n`)
  process.exit(1)
}
process.exit(result.status ?? 1)

async function configureRuntimeEnvironment(runtimePaths) {
  if (!process.env.COCODE_TUI_CLIENT_KIND?.trim()) process.env.COCODE_TUI_CLIENT_KIND = 'standalone-tui'
  if (!process.env.COCODE_NODE_EXECUTABLE?.trim()) process.env.COCODE_NODE_EXECUTABLE = process.execPath
  if (process.env.COCODE_SUPERVISOR_SERVICE_ENTRY?.trim()) return
  if (runtimePaths.staged) {
    const entry = resolve(runtimePaths.packageRoot, '..', 'dsh-runtime', 'packages', 'host-supervisor', 'lib', 'bin.js')
    if (existsSync(entry)) {
      process.env.COCODE_SUPERVISOR_SERVICE_ENTRY = entry
      return
    }
  }
  const packageJsonPath = require.resolve('@cocode/host-supervisor/package.json')
  const entry = join(dirname(packageJsonPath), 'packages', 'host-supervisor', 'lib', 'bin.js')
  if (!existsSync(entry)) throw new Error(`@cocode/host-supervisor is missing its built service entry: ${entry}`)
  process.env.COCODE_SUPERVISOR_SERVICE_ENTRY = entry
}

async function runDoctor(runtimePaths, scope, runtimeEnv) {
  const { createHostSupervisorClient } = await loadSupervisor(runtimePaths)
  const checks = [['package', true], ['built TUI', existsSync(runtimePaths.tuiEntry)], ['DSH_HOME', scope.dshHome !== ''], ['profile', scope.profile !== '']]
  let lease
  try {
    lease = await createHostSupervisorClient().acquire({
      scope,
      clientKind: process.env.COCODE_TUI_CLIENT_KIND === 'desktop-tui' ? 'desktop-tui' : 'standalone-tui',
      requiredServices: ['jsonrpc'],
      minProtocolRevision: '1.0',
      runtimeEnv,
    })
    const descriptor = lease.descriptor
    checks.push(
      ['supervisor IPC', true],
      ['Host descriptor', descriptor.schemaVersion === 1],
      ['Supervisor protocol', descriptor.supervisorProtocolRevision.startsWith('1.')],
      ['JSON-RPC service', descriptor.services.some((service) => service.service === 'jsonrpc')],
      ['Host protocol', descriptor.hostProtocolRevision.startsWith('1.')],
      ['capabilities', ['session', 'event', 'workspace'].every((capability) => descriptor.capabilities.includes(capability))],
      ['DSH_HOME/profile', descriptor.dshHome === scope.dshHome && descriptor.profile === scope.profile],
      ['runtime version', descriptor.runtimeVersion !== ''],
      ['lease create/release', true],
    )
  } catch (error) {
    checks.push(['supervisor IPC', false], ['Host descriptor', false], ['JSON-RPC service', false])
    process.stderr.write(`doctor: ${error instanceof Error ? error.message : String(error)}\n`)
  } finally {
    await lease?.release().catch(() => undefined)
  }
  for (const [label, ok] of checks) process.stdout.write(`${ok ? 'ok' : 'missing'} ${label}\n`)
  process.exit(checks.every(([, ok]) => ok) ? 0 : 1)
}

async function loadSupervisor(runtimePaths) {
  if (!runtimePaths.staged) return import('@cocode/host-supervisor')
  const serviceEntry = process.env.COCODE_SUPERVISOR_SERVICE_ENTRY?.trim()
  const entry = serviceEntry
    ? resolve(dirname(serviceEntry), 'index.js')
    : resolve(runtimePaths.packageRoot, '..', 'dsh-runtime', 'packages', 'host-supervisor', 'lib', 'index.js')
  if (!existsSync(entry)) throw new Error(`Packaged Host Supervisor is missing: ${entry}`)
  return import(pathToFileURL(entry).href)
}
