/** Machine value of the preset that requires an explicit GUI risk gate. */
export const FULL_ACCESS_PRESET = 'danger-full-access'

/** Built-in permission presets with stable locale keys under `preset.*`. */
export const LOCALIZED_PERMISSION_PRESETS = {
  'read-only': 'read-only',
  'workspace-write': 'workspace-write',
  [FULL_ACCESS_PRESET]: FULL_ACCESS_PRESET,
} as const

/**
 * Convert conventional kebab-case preset names into user-facing title case.
 * @param name - host-supplied preset label or key.
 * @returns the title-cased conventional key, or a non-kebab label unchanged.
 */
export function displayPresetName(name: string): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name
  return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

/**
 * Render a permission preset under its product label.
 * @param value - preset machine value.
 * @param name - host-supplied preset name.
 * @returns the Full access product label or the conventional display name.
 */
export function displayPermissionPreset(value: string, name: string): string {
  return value === FULL_ACCESS_PRESET ? 'Full access' : displayPresetName(name)
}

/**
 * Resolve a permission preset label through the active locale dictionary.
 * @param t - locale binder for the owning namespace.
 * @param value - preset machine value.
 * @param name - host-supplied preset name used as a non-kebab fallback.
 * @param keyPrefix - locale key prefix, e.g. `preset.` or `access.preset.`.
 * @returns the localized product label or a host-configured fallback.
 */
export function localizedPermissionPresetLabel(
  t: (key: string) => string,
  value: string,
  name: string,
  keyPrefix: string,
): string {
  const suffix = LOCALIZED_PERMISSION_PRESETS[value as keyof typeof LOCALIZED_PERMISSION_PRESETS]
  if (suffix !== undefined) return t(`${keyPrefix}${suffix}`)
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name
  return displayPresetName(name)
}
