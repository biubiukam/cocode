/**
 * Transient notices in the overlay layer.
 *
 * Only for facts with no home in the transcript — a reconnect, a copied path.
 * Anything the session log records belongs in the thread, where it survives.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { cn } from '@cocode/ui'

export type ToastTone = 'info' | 'success' | 'warning'

export type Toast = { id: string; tone: ToastTone; message: string }

type ToastContextValue = { push(tone: ToastTone, message: string): void }

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

const TONE_ICON = { info: Info, success: CheckCircle2, warning: TriangleAlert } as const
const DISMISS_AFTER_MS = 5000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = crypto.randomUUID()
    setToasts(current => [...current, { id, tone, message }])
    setTimeout(() => setToasts(current => current.filter(toast => toast.id !== id)), DISMISS_AFTER_MS)
  }, [])

  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map(toast => {
          const Icon = TONE_ICON[toast.tone]
          return (
            <div
              key={toast.id}
              className={cn(
                'pointer-events-auto flex min-h-10 items-center gap-2 rounded-md border bg-surface-raised px-3 py-2 text-[12px] shadow-md',
                toast.tone === 'warning'
                  ? 'border-[color-mix(in_srgb,var(--warning)_28%,var(--border))]'
                  : 'border-border',
              )}
            >
              <Icon className={cn('size-4 shrink-0', toast.tone === 'success' ? 'text-success' : toast.tone === 'warning' ? 'text-warning' : 'text-accent-ink')} />
              <span className="min-w-0 max-w-[320px]">{toast.message}</span>
              <button
                type="button"
                aria-label="关闭提示"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => setToasts(current => current.filter(item => item.id !== toast.id))}
              >
                <X className="size-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext)
  if (value === undefined) throw new Error('useToast must be used inside ToastProvider')
  return value
}
