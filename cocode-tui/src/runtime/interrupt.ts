/** Apply the P0 interrupt-or-quit policy without owning app state. */

export function handleInterrupt(options: {
  helpOpen: boolean
  agentRunning: boolean
  canCancel: boolean
  armed: boolean
  close: () => void
  setHelpOpen: (open: boolean) => void
  setArmed: (armed: boolean) => void
  armQuit?: () => void
  notice: (message: string) => void
  emit: () => void
  cancel?: () => Promise<boolean>
  cancelAccepted?: (wasRunning: boolean) => void
  cancelFailed?: (error: unknown) => void
  emptyComposer: boolean
  canRewind: boolean
  rewind?: () => void
  rewindNotice?: string
  rewindUnavailable?: string
}): void {
  if (options.helpOpen) {
    options.setHelpOpen(false)
    options.emit()
    return
  }
  if (options.agentRunning && options.canCancel && !options.armed) {
    options.setArmed(true)
    if (options.cancel === undefined) {
      options.notice('Cancel is unavailable.')
      options.emit()
      return
    }
    void options.cancel().then(
      (wasRunning) => {
        options.cancelAccepted?.(wasRunning)
        options.emit()
      },
      (error: unknown) => {
        if (options.cancelFailed !== undefined) options.cancelFailed(error)
        else options.notice(error instanceof Error ? error.message : String(error))
        options.emit()
      },
    )
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
  if (options.emptyComposer && options.canRewind) {
    if (!options.armed) {
      options.setArmed(true)
      options.notice(options.rewindNotice ?? 'Press Esc again to rewind.')
      options.emit()
      return
    }
    options.setArmed(false)
    if (options.rewind === undefined) {
      options.notice(options.rewindUnavailable ?? 'Rewind is unavailable.')
      options.emit()
      return
    }
    options.rewind()
    return
  }
  if (!options.armed) {
    options.setArmed(true)
    if (options.armQuit !== undefined) options.armQuit()
    else options.notice('Press again to quit.')
    options.emit()
    return
  }
  options.close()
}
