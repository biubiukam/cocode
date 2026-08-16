/** `settings.theme` namespace dictionaries (the Appearance section's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'nav': '外观设置',
  'appearance.title': '外观',
  'appearance.light': '浅色',
  'appearance.auto': '自动',
  'appearance.dark': '深色',
  'appearance.logo.title': 'Logo 显示',
  'appearance.logo.cocode': 'Cocode',
  'appearance.logo.deepseek': 'DeepSeek',
  'appearance.font.title': '消息列表字体大小',
  'appearance.font.14': '14',
  'appearance.font.16': '16',
  'appearance.font.18': '18',
  'appearance.font.20': '20',
} satisfies Record<string, string>

/** The settings.theme namespace key union. */
export type ThemeKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'nav': 'Appearance',
  'appearance.title': 'Appearance',
  'appearance.light': 'Light',
  'appearance.auto': 'Auto',
  'appearance.dark': 'Dark',
  'appearance.logo.title': 'Logo display',
  'appearance.logo.cocode': 'Cocode',
  'appearance.logo.deepseek': 'DeepSeek',
  'appearance.font.title': 'Message list font size',
  'appearance.font.14': '14',
  'appearance.font.16': '16',
  'appearance.font.18': '18',
  'appearance.font.20': '20',
} satisfies Record<ThemeKey, string>
