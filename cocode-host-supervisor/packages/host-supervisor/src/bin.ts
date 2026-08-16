import { runSupervisorService } from './service.js'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { createHostSupervisorClient } from './client.js'
import type { HostLease } from './protocol.js'

const args = process.argv.slice(2)
if (args[0] === 'service') {
  const index = args.indexOf('--state-dir')
  const directory = index >= 0 ? args[index + 1] : process.env.COCODE_SUPERVISOR_STATE_DIR
  if (!directory) throw new Error('cocode-host-supervisor service requires --state-dir')
  await runSupervisorService(directory)
} else if (args[0] === 'doctor') {
  const home = process.env.DSH_HOME?.trim() || resolve(homedir(), '.dsh')
  const profile = process.env.DSH_PROFILE?.trim() || 'web'
  const scope = {
    dshHome: home,
    profile,
    hostConfigFingerprint: process.env.COCODE_HOST_CONFIG_FINGERPRINT?.trim() || 'cocode-web-jsonrpc-v1',
    runtimeChannel: process.env.COCODE_RUNTIME_CHANNEL === 'preview' || process.env.COCODE_RUNTIME_CHANNEL === 'dev'
      ? process.env.COCODE_RUNTIME_CHANNEL
      : 'stable',
  } as const
  const checks: Array<[string, boolean]> = [
    ['package', true],
    ['DSH_HOME', home !== ''],
    ['profile', profile !== ''],
  ]
  let lease: HostLease | undefined
  try {
    lease = await createHostSupervisorClient().acquire({
      scope,
      clientKind: 'standalone-tui',
      requiredServices: ['web', 'jsonrpc'],
      minProtocolRevision: '1.0',
    })
    const descriptor = lease.descriptor
    checks.push(
      ['supervisor IPC', true],
      ['Host descriptor', descriptor.schemaVersion === 1],
      ['Supervisor protocol', descriptor.supervisorProtocolRevision.startsWith('1.')],
      ['Web service', descriptor.services.some((service) => service.service === 'web')],
      ['JSON-RPC service', descriptor.services.some((service) => service.service === 'jsonrpc')],
      ['Host protocol', descriptor.hostProtocolRevision.startsWith('1.')],
      ['capabilities', ['session', 'event', 'workspace'].every((capability) => descriptor.capabilities.includes(capability))],
      ['DSH_HOME/profile', descriptor.dshHome === scope.dshHome && descriptor.profile === scope.profile],
      ['runtime version', descriptor.runtimeVersion !== ''],
      ['lease create/release', true],
    )
  } catch (error) {
    checks.push(['supervisor IPC', false], ['Host descriptor', false])
    process.stderr.write(`doctor: ${error instanceof Error ? error.message : String(error)}\n`)
  } finally {
    await lease?.release().catch(() => undefined)
  }
  for (const [label, ok] of checks) process.stdout.write(`${ok ? 'ok' : 'missing'} ${label}\n`)
  process.exitCode = checks.every(([, ok]) => ok) ? 0 : 1
} else if (args[0] === '--version' || args[0] === '-v') {
  process.stdout.write('0.1.0\n')
} else {
  process.stdout.write('Usage: cocode-host-supervisor [--version] | service --state-dir <directory>\n')
}
