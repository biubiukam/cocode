import { describe, expect, it } from 'vitest'
import { calculateChatLayout } from '../../src/present/chat-layout.ts'

describe('chat layout rows', () => {
  it('keeps the base chrome and composer lines in the budget', () => {
    expect(
      calculateChatLayout({
        viewportRows: 30,
        composerLines: 3,
      }),
    ).toEqual({
      baseRows: 14,
      composerRows: 3,
      overlayRows: 0,
      reservedRows: 14,
      messageRows: 16,
      minimumRows: 14,
      tooSmall: false,
    })
  })

  it('includes status, attachments, notices, and editor feedback', () => {
    expect(
      calculateChatLayout({
        viewportRows: 30,
        composerLines: 1,
        hasAttachments: true,
        hasNotice: true,
        hasStatusDetails: true,
        editorFeedbackRows: 2,
      }),
    ).toEqual({
      baseRows: 17,
      composerRows: 1,
      overlayRows: 0,
      reservedRows: 17,
      messageRows: 13,
      minimumRows: 17,
      tooSmall: false,
    })
  })

  it.each([
    ['help', { helpLines: 5 }, 21],
    ['slash', { slashItems: 3 }, 19],
    ['file', { fileItems: 4 }, 20],
    ['loading file', { fileItems: 4, fileLoading: true }, 21],
    ['empty history', { historyMatches: 0 }, 18],
    ['history results', { historyMatches: 3 }, 20],
    ['empty resume', { resumeItems: 0 }, 18],
    ['resume results', { resumeItems: 4 }, 21],
    ['windowed resume', { resumeItems: 12 }, 26],
    ['rewind results', { rewindItems: 4 }, 22],
    ['windowed rewind', { rewindItems: 12, rewindSelected: 6 }, 26],
  ] as const)('covers the %s overlay height', (_name, overlay, reservedRows) => {
    const layout = calculateChatLayout({
      viewportRows: 80,
      composerLines: 1,
      ...overlay,
    })
    expect(layout.reservedRows).toBe(reservedRows)
    expect(layout.messageRows).toBe(80 - reservedRows)
    expect(layout.minimumRows).toBeLessThanOrEqual(80)
    expect(layout.tooSmall).toBe(false)
  })

  it('caps composer rows and marks a viewport smaller than the fixed chrome', () => {
    expect(
      calculateChatLayout({
        viewportRows: 4,
        composerLines: 20,
      }),
    ).toEqual({
      baseRows: 17,
      composerRows: 6,
      overlayRows: 0,
      reservedRows: 17,
      messageRows: 0,
      minimumRows: 17,
      tooSmall: true,
    })
  })

  it('caps overlays so the fixed chrome and one message row stay visible', () => {
    expect(
      calculateChatLayout({
        viewportRows: 24,
        composerLines: 1,
        helpLines: 20,
      }),
    ).toEqual({
      baseRows: 12,
      composerRows: 1,
      overlayRows: 11,
      reservedRows: 23,
      messageRows: 1,
      minimumRows: 18,
      tooSmall: false,
    })
  })

  it('enters the size fallback before an overlay can be clipped', () => {
    const layout = calculateChatLayout({
      viewportRows: 15,
      composerLines: 1,
      slashItems: 8,
    })
    expect(layout).toEqual({
      baseRows: 12,
      composerRows: 1,
      overlayRows: 0,
      reservedRows: 12,
      messageRows: 3,
      minimumRows: 18,
      tooSmall: true,
    })
  })

  it('enters the size fallback when the overlay cannot show its title and selection', () => {
    const layout = calculateChatLayout({
      viewportRows: 17,
      composerLines: 1,
      slashItems: 8,
    })
    expect(layout.tooSmall).toBe(true)
    expect(layout.overlayRows).toBe(0)
  })

  it('reserves enough rows for the resume picker selection', () => {
    const layout = calculateChatLayout({
      viewportRows: 19,
      composerLines: 1,
      resumeItems: 4,
    })
    expect(layout.tooSmall).toBe(true)
    expect(layout.overlayRows).toBe(0)
  })

  it('counts only the visible resume indicators', () => {
    expect(
      calculateChatLayout({
        viewportRows: 80,
        composerLines: 1,
        resumeItems: 12,
        resumeSelected: 0,
      }).overlayRows,
    ).toBe(14)
    expect(
      calculateChatLayout({
        viewportRows: 80,
        composerLines: 1,
        resumeItems: 12,
        resumeSelected: 6,
      }).overlayRows,
    ).toBe(15)
  })

  it('reserves the rewind confirmation line', () => {
    const layout = calculateChatLayout({
      viewportRows: 80,
      composerLines: 1,
      rewindItems: 2,
      rewindConfirming: true,
    })
    expect(layout.overlayRows).toBe(9)
  })
})
