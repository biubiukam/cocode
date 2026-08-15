/** Calculate the rows reserved by the chat chrome and overlays. */

import { RESUME_WINDOW_SIZE } from '../runtime/resume-picker.ts'
import { REWIND_WINDOW_SIZE } from '../runtime/rewind-picker.ts'
import { SKILLS_WINDOW_SIZE } from '../runtime/skills-picker.ts'
import { CHECKLIST_WINDOW_SIZE } from '../runtime/checklist.ts'
import { listWindowStart } from './list-window.ts'

const HEADER_ROWS = 3
const STATUS_ROWS = 2
const COMPOSER_CHROME_ROWS = 4
const FOOTER_ROWS = 2
const MIN_MESSAGE_ROWS_WITH_OVERLAY = 1
const MIN_OVERLAY_ROWS = 5
const MIN_RESUME_OVERLAY_ROWS = 8
const MIN_REWIND_OVERLAY_ROWS = 7

export const MAX_COMPOSER_ROWS = 6

export type ChatLayoutInput = {
  viewportRows: number
  composerLines: number
  hasAttachments?: boolean
  hasNotice?: boolean
  hasStatusDetails?: boolean
  checklistStripRows?: number
  editorFeedbackRows?: number
  helpLines?: number
  slashItems?: number
  fileItems?: number
  fileLoading?: boolean
  historyMatches?: number
  resumeItems?: number
  resumeSelected?: number
  checklistItems?: number
  checklistSelected?: number
  rewindItems?: number
  rewindSelected?: number
  rewindConfirming?: boolean
  skillsItems?: number
  skillsSelected?: number
  questionRows?: number
  approvalRows?: number
  reviewRows?: number
  actionMenuItems?: number
  actionMenuQuery?: boolean
}

export type ChatLayout = {
  baseRows: number
  composerRows: number
  overlayRows: number
  reservedRows: number
  messageRows: number
  minimumRows: number
  tooSmall: boolean
}

export function calculateChatLayout(input: ChatLayoutInput): ChatLayout {
  const viewportRows = nonNegativeInteger(input.viewportRows)
  const composerRows = Math.min(MAX_COMPOSER_ROWS, atLeastOne(input.composerLines))
  const baseRows =
    HEADER_ROWS +
    STATUS_ROWS +
    COMPOSER_CHROME_ROWS +
    FOOTER_ROWS +
    composerRows +
    optionalRow(input.hasAttachments) +
    optionalRow(input.hasNotice) +
    optionalRow(input.hasStatusDetails) +
    nonNegativeInteger(input.checklistStripRows) +
    nonNegativeInteger(input.editorFeedbackRows)
  const requestedOverlayRows =
    helpRows(input.helpLines) +
    slashRows(input.slashItems) +
    fileRows(input.fileItems, input.fileLoading) +
    historyRows(input.historyMatches) +
    resumeRows(input.resumeItems, input.resumeSelected) +
    checklistRows(input.checklistItems, input.checklistSelected) +
    rewindRows(input.rewindItems, input.rewindSelected, input.rewindConfirming) +
    skillsRows(input.skillsItems, input.skillsSelected) +
    questionRows(input.questionRows) +
    questionRows(input.approvalRows) +
    reviewRows(input.reviewRows) +
    actionMenuRows(input.actionMenuItems, input.actionMenuQuery)
  const availableRows = Math.max(0, viewportRows - baseRows)
  const minimumOverlayRows = minimumOverlayHeight(input)
  const minimumRows =
    baseRows + (requestedOverlayRows > 0 ? minimumOverlayRows + MIN_MESSAGE_ROWS_WITH_OVERLAY : 0)
  const tooSmall = viewportRows < minimumRows
  const messageFloor =
    requestedOverlayRows > 0 && availableRows > 0 ? MIN_MESSAGE_ROWS_WITH_OVERLAY : 0
  const overlayRows = Math.min(
    requestedOverlayRows,
    tooSmall ? 0 : Math.max(0, availableRows - messageFloor),
  )
  const reservedRows = baseRows + overlayRows

  return {
    baseRows,
    composerRows,
    overlayRows,
    reservedRows,
    messageRows: Math.max(0, viewportRows - reservedRows),
    minimumRows,
    tooSmall,
  }
}

function helpRows(lines: number | undefined): number {
  if (lines === undefined) return 0
  const count = nonNegativeInteger(lines)
  return count + 4
}

function slashRows(items: number | undefined): number {
  if (items === undefined) return 0
  const count = nonNegativeInteger(items)
  return count + 4
}

function fileRows(items: number | undefined, loading = false): number {
  const count = nonNegativeInteger(items)
  if (count === 0 && !loading) return 0
  return count + 4 + optionalRow(loading)
}

function historyRows(matches: number | undefined): number {
  if (matches === undefined) return 0
  const count = Math.max(1, nonNegativeInteger(matches))
  return count + 5
}

function resumeRows(items: number | undefined, selected = 0): number {
  const count = nonNegativeInteger(items)
  if (items === undefined) return 0
  const visible = Math.max(1, Math.min(count, RESUME_WINDOW_SIZE))
  const start = listWindowStart(selected, count, RESUME_WINDOW_SIZE)
  const indicators = optionalRow(start > 0) + optionalRow(count - start - visible > 0)
  return visible + indicators + 5
}

function minimumOverlayHeight(input: ChatLayoutInput): number {
  if (input.resumeItems !== undefined) return MIN_RESUME_OVERLAY_ROWS
  if (input.checklistItems !== undefined) return MIN_OVERLAY_ROWS
  if (input.rewindItems !== undefined) return MIN_REWIND_OVERLAY_ROWS
  if (input.skillsItems !== undefined) return MIN_OVERLAY_ROWS
  if (input.questionRows !== undefined) return MIN_OVERLAY_ROWS
  if (input.approvalRows !== undefined) return MIN_OVERLAY_ROWS
  if (input.reviewRows !== undefined) return MIN_OVERLAY_ROWS
  if (input.actionMenuItems !== undefined) return MIN_OVERLAY_ROWS
  if (input.historyMatches !== undefined) return MIN_OVERLAY_ROWS
  if (input.fileItems !== undefined || input.fileLoading === true) {
    return MIN_OVERLAY_ROWS + optionalRow(input.fileLoading)
  }
  if (input.helpLines !== undefined || input.slashItems !== undefined) {
    return MIN_OVERLAY_ROWS
  }
  return MIN_OVERLAY_ROWS
}

function checklistRows(items: number | undefined, selected = 0): number {
  if (items === undefined) return 0
  const count = nonNegativeInteger(items)
  const visible = Math.max(1, Math.min(count, CHECKLIST_WINDOW_SIZE))
  const start = listWindowStart(selected, count, CHECKLIST_WINDOW_SIZE)
  const indicators = optionalRow(start > 0) + optionalRow(count - start - visible > 0)
  return visible + indicators + 4
}

function actionMenuRows(items: number | undefined, query = false): number {
  if (items === undefined) return 0
  return Math.max(1, nonNegativeInteger(items)) + 4 + optionalRow(query)
}

function rewindRows(items: number | undefined, selected = 0, confirming = false): number {
  if (items === undefined) return 0
  const count = nonNegativeInteger(items)
  const visible = Math.max(1, Math.min(count, REWIND_WINDOW_SIZE))
  const start = listWindowStart(selected, count, REWIND_WINDOW_SIZE)
  const indicators = optionalRow(start > 0) + optionalRow(count - start - visible > 0)
  return visible + indicators + 6 + optionalRow(confirming)
}

function skillsRows(items: number | undefined, selected = 0): number {
  if (items === undefined) return 0
  const count = nonNegativeInteger(items)
  const visible = Math.max(1, Math.min(count, SKILLS_WINDOW_SIZE))
  const start = listWindowStart(selected, count, SKILLS_WINDOW_SIZE)
  const indicators = optionalRow(start > 0) + optionalRow(count - start - visible > 0)
  return visible + indicators + 6
}

function questionRows(rows: number | undefined): number {
  return rows === undefined ? 0 : Math.max(MIN_OVERLAY_ROWS, nonNegativeInteger(rows))
}

function reviewRows(rows: number | undefined): number {
  return rows === undefined ? 0 : Math.max(MIN_OVERLAY_ROWS, nonNegativeInteger(rows))
}

function optionalRow(enabled = false): number {
  return enabled ? 1 : 0
}

function atLeastOne(value: number): number {
  return Math.max(1, nonNegativeInteger(value))
}

function nonNegativeInteger(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0
  return Math.max(0, Math.trunc(value))
}
