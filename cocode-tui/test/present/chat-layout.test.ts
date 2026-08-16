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
      baseRows: 13,
      composerRows: 3,
      overlayRows: 0,
      reservedRows: 13,
      messageRows: 17,
      minimumRows: 13,
      tooSmall: false,
    })
  })

  it('includes status, attachments, notices, and editor feedback', () => {
    expect(
      calculateChatLayout({
        viewportRows: 30,
        composerLines: 1,
        hasAttachments: true,
        noticeRows: 3,
        hasStatusDetails: true,
        editorFeedbackRows: 2,
      }),
    ).toEqual({
      baseRows: 18,
      composerRows: 1,
      overlayRows: 0,
      reservedRows: 18,
      messageRows: 12,
      minimumRows: 18,
      tooSmall: false,
    })
  })

  it('reserves the main-area checklist without pushing the composer away', () => {
    expect(
      calculateChatLayout({
        viewportRows: 30,
        composerLines: 1,
        checklistStripRows: 6,
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
    ['help', { helpLines: 5 }, 20],
    ['slash', { slashItems: 3 }, 18],
    ['file', { fileItems: 4 }, 19],
    ['loading file', { fileItems: 4, fileLoading: true }, 20],
    ['empty history', { historyMatches: 0 }, 17],
    ['history results', { historyMatches: 3 }, 19],
    ['empty resume', { resumeItems: 0 }, 17],
    ['resume results', { resumeItems: 4 }, 20],
    ['windowed resume', { resumeItems: 12 }, 25],
    ['checklist', { checklistItems: 3 }, 18],
    ['windowed checklist', { checklistItems: 12, checklistSelected: 6 }, 25],
    ['rewind results', { rewindItems: 4 }, 21],
    ['windowed rewind', { rewindItems: 12, rewindSelected: 6 }, 25],
    ['model switch', { modelSwitchRows: 6 }, 17],
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
      baseRows: 16,
      composerRows: 6,
      overlayRows: 0,
      reservedRows: 16,
      messageRows: 0,
      minimumRows: 16,
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
      baseRows: 11,
      composerRows: 1,
      overlayRows: 12,
      reservedRows: 23,
      messageRows: 1,
      minimumRows: 17,
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
      baseRows: 11,
      composerRows: 1,
      overlayRows: 0,
      reservedRows: 11,
      messageRows: 4,
      minimumRows: 17,
      tooSmall: true,
    })
  })

  it('enters the size fallback when the overlay cannot show its title and selection', () => {
    const layout = calculateChatLayout({
      viewportRows: 16,
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
