import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close
export const DialogDescription = DialogPrimitive.Description

/** The dialog's title, rendered at the design system's §4.5 dialog scale. */
export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title asChild><h3 className={className} {...props} /></DialogPrimitive.Title>
}

/**
 * Modal surface (design system §4.5), mounted into the overlay layer.
 * @param props - Radix content props plus the dialog body.
 * @returns the rendered portal, scrim, and panel.
 */
export function DialogContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="dialog-scrim dialog-scrim-modal" />
      <DialogPrimitive.Content className={cn('dialog dialog-modal', className)} {...props}>
        {/* The §4.5 padding is opt-in through `DialogBody`, not forced here: a
            dialog that hosts its own navigation column needs the full bleed. */}
        {children}
        <DialogPrimitive.Close asChild>
          <button
            type="button"
            aria-label="关闭"
            className="icon-button icon-button-sm"
            style={{ position: 'absolute', top: 10, right: 10 }}
          >
            <X />
          </button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

/** The design system's padded dialog body; the default for an ordinary dialog. */
export function DialogBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('dialog-body', className)} {...props} />
}

/** Right-aligned action row closing a dialog. */
export function DialogActions({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('dialog-actions', className)} {...props} />
}
