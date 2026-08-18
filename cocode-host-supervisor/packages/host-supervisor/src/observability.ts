import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export interface CocodeLogLayout {
  readonly root: string
  readonly desktopApp: string
  readonly desktopAudit: string
  readonly host: string
  readonly tui: string
  readonly crashDumps: string
  readonly diagnostics: string
}

/**
 * Resolve one product-level log root shared by GUI, TUI and Host Supervisor.
 * The environment override is intentionally explicit so packaged deployments
 * and tests can keep all writers on the same root without relying on Electron
 * application names.
 */
export function resolveCocodeLogRoot(env: Readonly<NodeJS.ProcessEnv> = process.env): string {
  const override = env.COCODE_LOG_ROOT?.trim()
  if (override) return resolve(override)

  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Logs', 'Cocode')
  if (process.platform === 'win32') {
    return resolve(env.LOCALAPPDATA?.trim() || env.APPDATA?.trim() || join(homedir(), 'AppData', 'Local'), 'Cocode', 'Logs')
  }

  return resolve(env.XDG_STATE_HOME?.trim() || join(homedir(), '.local', 'state'), 'cocode', 'logs')
}

export function resolveCocodeLogLayout(env: Readonly<NodeJS.ProcessEnv> = process.env): CocodeLogLayout {
  const root = resolveCocodeLogRoot(env)
  return {
    root,
    desktopApp: join(root, 'desktop', 'app'),
    desktopAudit: join(root, 'desktop', 'audit'),
    host: join(root, 'host'),
    tui: join(root, 'tui'),
    crashDumps: join(root, 'crashDumps'),
    diagnostics: join(root, 'diagnostics'),
  }
}
