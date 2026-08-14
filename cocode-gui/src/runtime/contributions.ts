/**
 * Palette and settings actions contributed by product plugins.
 * Values are data and callbacks — no React — so the runtime stays render-free.
 */

export type PaletteContribution = {
  id: string
  label: string
  group: string
  run(): void
}

export type SettingsAction = {
  id: string
  title: string
  description: string
  label: string
  run(): void
}

export class ContributionRegistry {
  private palette: PaletteContribution[] = []
  private settings: SettingsAction[] = []
  private readonly listeners = new Set<() => void>()

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  listPalette(): readonly PaletteContribution[] {
    return this.palette
  }

  listSettingsActions(): readonly SettingsAction[] {
    return this.settings
  }

  registerPalette(item: PaletteContribution): () => void {
    this.palette = [...this.palette.filter(entry => entry.id !== item.id), item]
    this.emit()
    return () => {
      this.palette = this.palette.filter(entry => entry.id !== item.id)
      this.emit()
    }
  }

  registerSettingsAction(item: SettingsAction): () => void {
    this.settings = [...this.settings.filter(entry => entry.id !== item.id), item]
    this.emit()
    return () => {
      this.settings = this.settings.filter(entry => entry.id !== item.id)
      this.emit()
    }
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener()
  }
}
