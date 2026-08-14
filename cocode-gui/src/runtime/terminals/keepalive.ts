/**
 * Maps Dock tab instance keys to live harness terminal ids.
 *
 * Bindings survive page reload so a restored tab can reattach instead of minting
 * another numbered PTY. In-memory entries are a fast path over localStorage.
 */

const STORAGE_KEY = 'cocode.terminal-bindings'
const keyToTerminalId = new Map<string, string>()

function bindingKey(workspaceId: string, instanceKey: string): string {
  return `${workspaceId}:${instanceKey}`
}

function readBindings(): Record<string, string> {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY)
    if (raw === null || raw === '') return {}
    return JSON.parse(raw) as Record<string, string>
  }
  catch {
    return {}
  }
}

function writeBindings(bindings: Record<string, string>): void {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings))
  }
  catch {
    // Preference persistence is best-effort.
  }
}

export function rememberTerminalBinding(workspaceId: string, instanceKey: string, terminalId: string): void {
  keyToTerminalId.set(instanceKey, terminalId)
  const bindings = readBindings()
  bindings[bindingKey(workspaceId, instanceKey)] = terminalId
  writeBindings(bindings)
}

export function forgetTerminalBinding(workspaceId: string, instanceKey: string): void {
  keyToTerminalId.delete(instanceKey)
  const bindings = readBindings()
  delete bindings[bindingKey(workspaceId, instanceKey)]
  writeBindings(bindings)
}

export function boundTerminalId(workspaceId: string, instanceKey: string): string | undefined {
  const cached = keyToTerminalId.get(instanceKey)
  if (cached !== undefined) return cached
  const persisted = readBindings()[bindingKey(workspaceId, instanceKey)]
  if (persisted !== undefined) keyToTerminalId.set(instanceKey, persisted)
  return persisted
}

/** Terminal ids currently shown in Dock tabs (by key or by binding). */
export function openTerminalIds(
  workspaceId: string,
  tabs: readonly { panelId: string; instanceKey: string | null }[],
): Set<string> {
  const open = new Set<string>()
  for (const tab of tabs) {
    if (tab.panelId !== 'terminal' || tab.instanceKey === null) continue
    if (tab.instanceKey.startsWith('agent:')) {
      open.add(tab.instanceKey)
      continue
    }
    open.add(tab.instanceKey)
    const bound = boundTerminalId(workspaceId, tab.instanceKey)
    if (bound !== undefined) open.add(bound)
  }
  return open
}
