import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { hostKey, type HostScope } from './protocol.js'

export function supervisorHome(): string {
  return resolve(process.env.COCODE_SUPERVISOR_HOME?.trim() || join(homedir(), '.cocode', 'host-supervisor'))
}

export function runtimeHome(): string {
  return resolve(process.env.COCODE_HOST_RUNTIME_HOME?.trim() || join(homedir(), '.cocode', 'host-runtimes'))
}

export function scopeDirectory(scope: HostScope): string {
  return join(supervisorHome(), hostKey(scope))
}

export function endpointFor(directory: string): string {
  return process.platform === 'win32' ? `\\\\.\\pipe\\cocode-host-supervisor-${directory.split(/[\\/]/).pop()}` : join(directory, 'supervisor.sock')
}

export function descriptorPath(directory: string): string { return join(directory, 'host.json') }
export function scopePath(directory: string): string { return join(directory, 'scope.json') }
export function lockPath(directory: string): string { return join(directory, 'supervisor.lock') }
export function leaseDirectory(directory: string): string { return join(directory, 'leases') }
export function runtimeSlotDirectory(scope: HostScope, runtimeVersion: string): string { return join(runtimeHome(), `${hostKey(scope)}-${runtimeVersion}`) }
