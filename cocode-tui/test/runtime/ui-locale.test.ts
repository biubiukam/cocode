import { describe, expect, it } from 'vitest'
import { localeName, parseUiLocale, resolveUiLocale, text } from '../../src/runtime/ui-locale.ts'

describe('ui locale', () => {
  it('parses supported language tags and rejects unknown values', () => {
    expect(parseUiLocale('zh-CN')).toBe('zh')
    expect(parseUiLocale('en_US.UTF-8')).toBe('en')
    expect(parseUiLocale('fr')).toBeUndefined()
  })

  it('uses COCODE_LANG before system locale', () => {
    expect(resolveUiLocale({ COCODE_LANG: 'zh', LANG: 'en_US' })).toBe('zh')
    expect(resolveUiLocale({}, 'en-US')).toBe('en')
  })

  it('translates labels and interpolates language names', () => {
    expect(text('zh', 'historyEmpty')).toBe('没有匹配的消息')
    expect(text('en', 'langChanged', { lang: localeName('zh') })).toBe('Language: 中文')
  })
})
