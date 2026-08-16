import { describe, expect, it } from 'vitest'
import type { TuiQuestionSnapshot } from '../../src/runtime/app.ts'
import {
  buildPlanPreview,
  planReviewActionIndexAtRow,
  planReviewPanelRows,
} from '../../src/present/components/PlanReviewPanel.tsx'

function state(detail: string, options = ['Approve', 'Keep planning']): TuiQuestionSnapshot {
  return {
    key: 'plan-review',
    sessionId: 'session-1',
    position: 1,
    total: 1,
    answered: 0,
    question: {
      id: 'review',
      header: 'Plan review',
      question: 'Approve this plan and leave plan mode?',
      detail,
      options: options.map((label) => ({ label })),
      intent: { kind: 'plan-review', approve: 'Approve' },
    },
  }
}

describe('plan review presentation', () => {
  it('projects markdown structure into bounded preview lines', () => {
    const lines = buildPlanPreview('# Plan\n\n- inspect files\n- update tests\n\n```ts\nconst ok = true\n```', 40)

    expect(lines.map((line) => line.text)).toEqual([
      '# Plan',
      '',
      '• inspect files',
      '• update tests',
      '',
      '[ts]',
      '│ const ok = true',
    ])
    expect(lines.map((line) => line.kind)).toEqual([
      'heading',
      'spacer',
      'bullet',
      'bullet',
      'spacer',
      'code',
      'code',
    ])
  })

  it('reserves more rows for a plan without allowing an unbounded overlay', () => {
    const compact = planReviewPanelRows(state('# Plan\n\nshort'), 80)
    const long = planReviewPanelRows(state(`# Plan\n\n${Array.from({ length: 80 }, () => '- step').join('\n')}`), 80)

    expect(long).toBeGreaterThan(compact)
    expect(long).toBeLessThanOrEqual(29)
  })

  it('maps clicks to actions after the visible preview window', () => {
    expect(
      planReviewActionIndexAtRow({
        row: 17,
        panelStartRow: 5,
        previewRows: 8,
        hasAbove: false,
        hasBelow: false,
        optionHasDescription: [false, false],
      }),
    ).toBe(0)
    expect(
      planReviewActionIndexAtRow({
        row: 18,
        panelStartRow: 5,
        previewRows: 8,
        hasAbove: false,
        hasBelow: false,
        optionHasDescription: [false, false],
      }),
    ).toBe(1)
    expect(
      planReviewActionIndexAtRow({
        row: 19,
        panelStartRow: 5,
        previewRows: 8,
        hasAbove: false,
        hasBelow: false,
        optionHasDescription: [false, false],
      }),
    ).toBeUndefined()
    expect(
      planReviewActionIndexAtRow({
        row: 19,
        panelStartRow: 5,
        previewRows: 8,
        hasAbove: true,
        hasBelow: true,
        optionHasDescription: [true, false],
      }),
    ).toBe(0)
    expect(
      planReviewActionIndexAtRow({
        row: 21,
        panelStartRow: 5,
        previewRows: 8,
        hasAbove: true,
        hasBelow: true,
        optionHasDescription: [true, false],
      }),
    ).toBe(1)
  })
})
