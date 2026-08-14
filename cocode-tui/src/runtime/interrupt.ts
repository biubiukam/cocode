/** Apply the P0 interrupt-or-quit policy without owning app state. */

export function handleInterrupt(options: {
  helpOpen: boolean
  agentRunning: boolean
  canCancel: boolean
  armed: boolean
  close: () => void
  setHelpOpen: (open: boolean) => void
  setArmed: (armed: boolean) => void
  notice: (message: string) => void
  emit: () => void
}): void {
  if (options.helpOpen) {
    options.setHelpOpen(false)
    options.emit()
    return
  }
  if (options.agentRunning && !options.canCancel) {
    if (!options.armed) {
      options.setArmed(true)
      options.notice('Protocol cannot cancel. Press again to quit and kill the runtime.')
      options.emit()
      return
    }
    options.close()
    return
  }
  if (!options.armed) {
    options.setArmed(true)
    options.notice('Press again to quit.')
    options.emit()
    return
  }
  options.close()
}
