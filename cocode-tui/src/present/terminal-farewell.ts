import { theme } from './theme.ts'

const RESET = '\u001b[0m'
const FAREWELL_MARK = [
  '        ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~',
  '    █████ █████ █████ █████ ████  █████',
  '    █     █   █ █     █   █ █   █ █    ',
  '    █     █   █ ███   █   █ █   █ ███  ',
  '    █     █   █ █     █   █ █   █ █    ',
  '    █████ █████ █████ █████ ████  █████',
  '        ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~',
] as const

/** Render the compact Cocode wordmark for output after leaving Ink. */
export function terminalBrandMark(): string {
  return FAREWELL_MARK
    .map((line, index) => {
      const wave = index === 0 || index === FAREWELL_MARK.length - 1
      const segments = line.match(/█+|[^█]+/g) ?? [line]
      return segments
        .map(
          (segment) =>
            `${ansiColor(wave ? theme.accent : colorForSegment(segment))}${segment}${RESET}`,
        )
        .join('')
    })
    .join('\n')
}

function colorForSegment(segment: string): string {
  if (segment.includes('█')) return theme.accent
  return theme.brand
}

function ansiColor(hex: string): string {
  const value = hex.replace(/^#/, '')
  if (!/^[0-9a-f]{6}$/iu.test(value)) return ''
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return `\u001b[38;2;${red};${green};${blue}m`
}
