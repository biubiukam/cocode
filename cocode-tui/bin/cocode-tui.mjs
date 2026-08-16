#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(
  readFileSync(resolve(packageRoot, 'package.json'), 'utf8'),
)

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`Cocode TUI ${packageJson.version}\n\n`)
  process.stdout.write('Usage: cocode [options]\n\n')
  process.stdout.write('Options:\n')
  process.stdout.write('  --help, -h       Show this help\n')
  process.stdout.write('  --version, -v    Show the installed version\n')
  process.stdout.write('  --doctor         Check the shared DSH Host and Supervisor\n')
  process.exit(0)
}

if (args.includes('--version') || args.includes('-v')) {
  process.stdout.write(`${packageJson.version}\n`)
  process.exit(0)
}

if (args.includes('--doctor')) {
  await runDoctor()
}

const entry = resolve(packageRoot, 'dist', 'cocode-tui.mjs')
if (!existsSync(entry)) {
  process.stderr.write('Cocode TUI is missing its build output. Run `pnpm run build` first.\n')
  process.exit(1)
}

const result = spawnSync(process.execPath, [entry, ...args], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
})

if (result.error) {
  process.stderr.write(`Cocode TUI failed to start: ${result.error.message}\n`)
  process.exit(1)
}
process.exit(result.status ?? 1)

async function runDoctor() {
  const { createHostSupervisorClient } = await import('@cocode/host-supervisor')
  const home = process.env.DSH_HOME?.trim() || resolve(homedir(), '.dsh')
  const profile = process.env.DSH_PROFILE?.trim() || 'web'
  const scope = {
    dshHome: home,
    profile,
    hostConfigFingerprint: process.env.COCODE_HOST_CONFIG_FINGERPRINT?.trim() || 'cocode-web-jsonrpc-v1',
    runtimeChannel: process.env.COCODE_RUNTIME_CHANNEL === 'preview' || process.env.COCODE_RUNTIME_CHANNEL === 'dev'
      ? process.env.COCODE_RUNTIME_CHANNEL
      : 'stable',
  }
  const checks = [
    ['package', true],
    ['built TUI', existsSync(resolve(packageRoot, 'dist', 'cocode-tui.mjs'))],
    ['DSH_HOME', home !== ''],
    ['profile', profile !== ''],
  ]
  let lease
  try {
    lease = await createHostSupervisorClient().acquire({
      scope,
      clientKind: 'standalone-tui',
      requiredServices: ['jsonrpc'],
      minProtocolRevision: '1.0',
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
