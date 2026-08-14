import type { Context } from '@deepseek-ai/cordis'

export const name = 'toast'
export const inject = ['slots']

/** Visual toasts stay inside ToastProvider so `useToast` has a single owner. */
export function apply(_ctx: Context) {}
