import { describe, expect, it } from 'vitest'
import { composerHeaderLayout } from '../../src/present/composer-header.ts'

const base = {
  composer: { disabled: false, mask: false },
  agent: 'idle' as const,
  planMode: false,
  planModeAvailable: true,
  locale: 'en' as const,
  provider: 'deepseek-official',
  model: 'm1',
}

describe('composer header layout', () => {
  it('shows the provider and model when the composer is wide', () => {
    expect(composerHeaderLayout({ ...base, columns: 120 })).toEqual({
      title: 'Build',
      hint: 'tab switch mode',
      compact: false,
      showRoute: true,
      modelStartColumn: 31,
      modelEndColumn: 33,
    })
  })

  it('hides the provider while keeping the model clickable in compact layouts', () => {
    expect(composerHeaderLayout({ ...base, columns: 80 })).toEqual({
      title: 'Build',
      hint: 'tab switch mode',
      compact: true,
      showRoute: true,
      modelStartColumn: 11,
      modelEndColumn: 13,
    })
  })

  it('removes the click range when the model is clipped or disabled', () => {
    const clipped = composerHeaderLayout({ ...base, columns: 20 })
    expect(clipped.showRoute).toBe(true)
    expect(clipped).not.toHaveProperty('modelStartColumn')
    expect(clipped).not.toHaveProperty('modelEndColumn')

    expect(
      composerHeaderLayout({
        ...base,
        composer: { disabled: true, mask: false },
        columns: 120,
      }),
    ).toMatchObject({ hint: 'locked' })
  })

  it('keeps secret input distinct from the model route', () => {
    expect(
      composerHeaderLayout({
        ...base,
        composer: { disabled: false, mask: true },
        columns: 120,
      }),
    ).toEqual({
      title: 'secret',
      hint: 'tab switch mode',
      compact: false,
      showRoute: false,
    })
  })
})
