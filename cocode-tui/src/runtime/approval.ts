import type { TuiApprovalAnswer, TuiApprovalRequest } from '@cocode/tui-connection'

export type ApprovalState = {
  request: TuiApprovalRequest
  open: true
}

export type PendingApproval = {
  request: TuiApprovalRequest
  resolve: (answer: TuiApprovalAnswer) => void
  reject: (error: Error) => void
  timeout?: ReturnType<typeof setTimeout>
}

export function createApprovalState(request: TuiApprovalRequest): ApprovalState {
  return { request, open: true }
}

export function closeApprovalState(): undefined {
  return undefined
}
