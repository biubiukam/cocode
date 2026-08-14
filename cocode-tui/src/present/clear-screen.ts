export type ScreenMode = 'inline' | 'alternate'

type ScreenOutput = {
  readonly isTTY?: boolean
  write(value: string): unknown
}

const CLEAR_VIEWPORT = '\x1b[2J\x1b[H'
const ENTER_ALTERNATE = '\x1b[?1049h\x1b[H'
const EXIT_ALTERNATE = '\x1b[?1049l'

export function parseScreenMode(value: string | undefined): ScreenMode {
  return value?.trim().toLowerCase() === 'alternate' ? 'alternate' : 'inline'
}

export function supportsAlternateScreen(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (platform !== 'win32') return true
  return [env.WT_SESSION, env.TERM_PROGRAM, env.ANSICON].some(
    (value) => value !== undefined && value !== '',
  )
}

export function enterScreen(
  mode: ScreenMode,
  output: ScreenOutput = process.stdout,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): () => void {
  if (output.isTTY !== true) return () => undefined
  const alternate = mode === 'alternate' && supportsAlternateScreen(platform, env)
  output.write(alternate ? ENTER_ALTERNATE : CLEAR_VIEWPORT)
  let closed = false
  return () => {
    if (closed) return
    closed = true
    if (alternate) output.write(EXIT_ALTERNATE)
  }
}

/** Clear the current frame without deleting the terminal scrollback. */
export function clearViewport(output: ScreenOutput = process.stdout): void {
  if (output.isTTY !== true) return
  output.write(CLEAR_VIEWPORT)
}

/** Backward-compatible alias for callers that only need a clean viewport. */
export function clearScreen(): void {
  clearViewport()
}
