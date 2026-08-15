import { posix, win32 } from 'node:path'
import type { PathLike } from 'node:fs'

export type PlatformPath = typeof posix | typeof win32

export type TerminalEnvironment = {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  isWsl: boolean
  isMultiplexer: boolean
  multiplexer: 'tmux' | 'screen' | undefined
  supportsAnsi: boolean
  supportsInput: boolean
  supportsOutput: boolean
  supportsAlternateScreen: boolean
  supportsResize: boolean
  supportsNotifications: boolean
  supportsMouse: boolean
}

export type PlatformOptions = {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  stdinIsTTY?: boolean
  stdoutIsTTY?: boolean
  stdoutColumns?: number
  stdoutRows?: number
}

export type ExternalCommand = {
  command: string
  args: readonly string[]
}

export function pathForPlatform(platform: NodeJS.Platform = process.platform): PlatformPath {
  return platform === 'win32' ? win32 : posix
}

export function resolvePlatformPath(
  value: string | PathLike,
  platform: NodeJS.Platform = process.platform,
): string {
  return pathForPlatform(platform).resolve(String(value))
}

export function detectTerminalEnvironment(options: PlatformOptions = {}): TerminalEnvironment {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const isWsl = platform === 'linux' && isWslEnvironment(env)
  const multiplexer = detectMultiplexer(env)
  const isMultiplexer = multiplexer !== undefined
  const isWindowsTerminal =
    platform === 'win32' &&
    [env.WT_SESSION, env.TERM_PROGRAM, env.ANSICON, env.ConEmuANSI].some(
      (value) => value !== undefined && value !== '',
    )
  const supportsAnsi = platform !== 'win32' || isWindowsTerminal
  const supportsInput = options.stdinIsTTY === true
  const supportsOutput = options.stdoutIsTTY === true
  const supportsResize =
    supportsOutput &&
    Number.isInteger(options.stdoutColumns) &&
    Number.isInteger(options.stdoutRows) &&
    (options.stdoutColumns ?? 0) > 0 &&
    (options.stdoutRows ?? 0) > 0
  const supportsAlternateScreen = supportsAnsi && !isMultiplexer
  const supportsNotifications = supportsAnsi && !isMultiplexer
  const supportsMouse = supportsAnsi && !isMultiplexer
  return {
    platform,
    env,
    isWsl,
    isMultiplexer,
    multiplexer,
    supportsAnsi,
    supportsInput,
    supportsOutput,
    supportsAlternateScreen,
    supportsResize,
    supportsNotifications,
    supportsMouse,
  }
}

export function isWslEnvironment(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.WSL_DISTRO_NAME || env.WSL_INTEROP || env.WSLENV)
}

export function detectMultiplexer(env: NodeJS.ProcessEnv): 'tmux' | 'screen' | undefined {
  if (nonempty(env.TMUX)) return 'tmux'
  if (nonempty(env.STY)) return 'screen'
  const term = env.TERM?.toLowerCase() ?? ''
  if (term.includes('tmux')) return 'tmux'
  if (term.startsWith('screen')) return 'screen'
  return undefined
}

export function clipboardCommandCandidates(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): ExternalCommand[] {
  if (platform === 'darwin') return [{ command: 'pbcopy', args: [] }]
  if (platform === 'win32') return [{ command: 'clip.exe', args: [] }]
  if (platform !== 'linux') return []

  const commands: ExternalCommand[] = []
  if (nonempty(env.WAYLAND_DISPLAY)) commands.push({ command: 'wl-copy', args: [] })
  if (nonempty(env.DISPLAY)) {
    commands.push({ command: 'xclip', args: ['-selection', 'clipboard'] })
    commands.push({ command: 'xsel', args: ['--clipboard', '--input'] })
  }
  if (isWslEnvironment(env)) commands.push({ command: 'clip.exe', args: [] })
  if (commands.length === 0) {
    // Keep the fallback useful in minimal shells where DISPLAY is not exported.
    commands.push(
      { command: 'wl-copy', args: [] },
      { command: 'xclip', args: ['-selection', 'clipboard'] },
      { command: 'xsel', args: ['--clipboard', '--input'] },
    )
  }
  return dedupeCommands(commands)
}

export function externalOpenCommandForPlatform(
  url: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): ExternalCommand {
  if (platform === 'darwin') return { command: 'open', args: [url] }
  if (platform === 'win32' || isWslEnvironment(env)) {
    return { command: 'explorer.exe', args: [url] }
  }
  return { command: 'xdg-open', args: [url] }
}

export function defaultEditorCommand(
  platform: NodeJS.Platform = process.platform,
): string[] | undefined {
  // A Windows fallback is preferable to failing because the platform has no
  // POSIX-style EDITOR convention. POSIX systems still require explicit user
  // configuration so we never guess a blocking terminal editor.
  return platform === 'win32' ? ['notepad.exe'] : undefined
}

function nonempty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}

function dedupeCommands(commands: ExternalCommand[]): ExternalCommand[] {
  const seen = new Set<string>()
  return commands.filter((candidate) => {
    const key = `${candidate.command}\u0000${candidate.args.join('\u0000')}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
