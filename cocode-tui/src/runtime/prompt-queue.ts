/** Local prompt queue used while the runtime is processing a turn. */

export type QueuedPrompt = {
  text: string
  attachments: readonly { path: string; token: string }[]
}

export type PromptQueue = {
  readonly size: number
  readonly limit: number
  add(prompt: QueuedPrompt): boolean
  take(): QueuedPrompt | undefined
  restore(prompt: QueuedPrompt): void
  clear(): void
}

export function createPromptQueue(limit = 8): PromptQueue {
  const prompts: QueuedPrompt[] = []
  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 8

  return {
    get size() {
      return prompts.length
    },
    get limit() {
      return normalizedLimit
    },
    add(prompt) {
      if (prompts.length >= normalizedLimit) return false
      prompts.push(prompt)
      return true
    },
    take() {
      return prompts.shift()
    },
    restore(prompt) {
      prompts.unshift(prompt)
    },
    clear() {
      prompts.length = 0
    },
  }
}
