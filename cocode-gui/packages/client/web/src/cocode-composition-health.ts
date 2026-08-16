export type CocodeSlotInspector = {
  entries(key: string): readonly { options?: { id?: string } }[]
}

/** Validate the product-owned slots after the Web loader has settled. */
export function assertCocodeSlotRegistrations(slots: CocodeSlotInspector): void {
  if (slots.entries('sidebar.settings').length === 0) {
    throw new Error('web boot: sidebar.settings did not register')
  }
  if (!slots.entries('sidebar.footer.action').some((entry) => entry.options?.id === 'cocode-account')) {
    throw new Error('web boot: cocode-account did not register sidebar.footer.action')
  }
}
