/** Best-effort terminal notifications for completed turns. */

export type TerminalNotifyMode = 'auto' | 'off' | 'osc9' | 'osc777'

export function parseTerminalNotifyMode(value: string | undefined): TerminalNotifyMode {
  if (value === 'off' || value === 'osc9' || value === 'osc777') return value
  return 'auto'
}

export function buildTerminalNotification(options: {
  mode: TerminalNotifyMode
  title: string
  body: string
}): string {
  if (options.mode === 'off') return ''
  const title = sanitize(options.title)
  const body = sanitize(options.body)
  if (options.mode === 'osc777') return `\u001b]777;notify;${title};${body}\u0007`
  return `\u001b]9;${body}\u0007`
}

export function notifyTerminal(options: {
  mode?: TerminalNotifyMode
  title: string
  body: string
  write?: (value: string) => void
}): boolean {
  const sequence = buildTerminalNotification({
    mode: options.mode ?? parseTerminalNotifyMode(process.env.COCODE_TUI_NOTIFY),
    title: options.title,
    body: options.body,
  })
  if (sequence === '') return false
  try {
    const write = options.write ?? ((value: string) => process.stdout.write(value))
    write(sequence)
    return true
  } catch {
    return false
  }
}

function sanitize(value: string): string {
  // Control characters and semicolons can corrupt OSC fields.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f;]/g, ' ').trim()
}
