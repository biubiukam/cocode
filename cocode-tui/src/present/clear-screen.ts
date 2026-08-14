/**
 * Clear the TTY including scrollback so the next frame starts clean.
 */

export function clearScreen(): void {
  if (process.stdout.isTTY !== true) return
  process.stdout.write('\x1b[2J\x1b[3J\x1b[H')
}
