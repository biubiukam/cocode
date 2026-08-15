/** Shared teardown sequencing for a TUI runtime. */

export async function closeRuntime(options: {
  unsubscribe: () => void
  unsubscribeClose: () => void
  runtimeClose: () => Promise<void>
  markDead: () => void
}): Promise<void> {
  options.unsubscribe()
  options.unsubscribeClose()
  try {
    await options.runtimeClose()
  } finally {
    options.markDead()
  }
}
