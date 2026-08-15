import type { GitReview, ReviewScope } from './git-review.ts'

export type ReviewPickerState =
  | { open: true; phase: 'scope'; scopes: readonly ReviewScope[]; selected: number }
  | { open: true; phase: 'loading'; scope: ReviewScope; base?: string }
  | { open: true; phase: 'preview'; scope: ReviewScope; base?: string; review: GitReview }
  | { open: false; phase: 'closed' }

export const REVIEW_SCOPES: readonly ReviewScope[] = [
  'working-tree',
  'staged',
  'last-commit',
  'branch',
]

export function createReviewPicker(): ReviewPickerState {
  return { open: true, phase: 'scope', scopes: REVIEW_SCOPES, selected: 0 }
}

export function moveReviewSelection(state: ReviewPickerState, delta: number): ReviewPickerState {
  if (!state.open || state.phase !== 'scope' || state.scopes.length === 0) return state
  const selected =
    (((state.selected + delta) % state.scopes.length) + state.scopes.length) % state.scopes.length
  return { ...state, selected }
}

export function selectedReviewScope(state: ReviewPickerState): ReviewScope | undefined {
  return state.open && state.phase === 'scope' ? state.scopes[state.selected] : undefined
}

export function setReviewLoading(scope: ReviewScope, base?: string): ReviewPickerState {
  return { open: true, phase: 'loading', scope, ...(base === undefined ? {} : { base }) }
}

export function setReviewPreview(review: GitReview): ReviewPickerState {
  return {
    open: true,
    phase: 'preview',
    scope: review.scope,
    ...(review.base === undefined ? {} : { base: review.base }),
    review,
  }
}

export function closeReviewPicker(): ReviewPickerState {
  return { open: false, phase: 'closed' }
}
