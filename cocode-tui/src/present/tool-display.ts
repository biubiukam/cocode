import type { ToolNode } from '../runtime/nodes/types.ts'
import { theme } from './theme.ts'
import { sanitizeSingleLine, truncateText } from './text-format.ts'

export type ToolDisplayState = {
  mark: string
  color: string
  label: string
}

export function toolDisplayState(
  node: Pick<ToolNode, 'status'>,
  locale: 'en' | 'zh',
): ToolDisplayState {
  if (node.status === 'running') {
    return {
      mark: theme.pendingIcon,
      color: theme.pending,
      label: locale === 'zh' ? '运行中' : 'running',
    }
  }
  if (node.status === 'error') {
    return {
      mark: theme.errorIcon,
      color: theme.error,
      label: locale === 'zh' ? '失败' : 'error',
    }
  }
  return {
    mark: theme.successIcon,
    color: theme.success,
    label: locale === 'zh' ? '完成' : 'done',
  }
}

export function toolArgumentSummary(args: string, maxChars = 72): string | undefined {
  const singleLine = sanitizeSingleLine(args)
  if (singleLine === '' || singleLine === '{}') return undefined
  return truncateText(singleLine, maxChars)
}

export function formatElapsed(startTime: number, now = Date.now()): string | undefined {
  if (!Number.isFinite(startTime) || startTime <= 0) return undefined
  const elapsedMs = Math.max(0, now - startTime)
  if (elapsedMs < 1000) return '<1s'
  const seconds = Math.floor(elapsedMs / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

export function toolErrorSummary(error: ToolNode['error']): string | undefined {
  if (error === undefined) return undefined
  const detail = sanitizeSingleLine(error.name || error.code)
  return detail === '' ? undefined : truncateText(detail, 80)
}
