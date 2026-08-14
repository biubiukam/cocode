/**
 * Editable text surface for Preview (RFC dock-panel-depth §3.2.1).
 * Plain textarea keeps the cold start light; CodeView stays read-only elsewhere.
 */

import { useEffect, useRef } from 'react'
import { Button, cn } from '@cocode/ui'

export function TextEditor({
  path,
  value,
  dirty,
  onChange,
  onSave,
  onAppendSelection,
}: {
  path: string
  value: string
  dirty: boolean
  onChange(next: string): void
  onSave(): void
  onAppendSelection?(text: string): void
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        onSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSave])

  useEffect(() => {
    const area = areaRef.current
    const popup = popupRef.current
    if (area === null || popup === null || onAppendSelection === undefined) return

    const hide = () => { popup.hidden = true }
    const onMouseUp = () => {
      const start = area.selectionStart
      const end = area.selectionEnd
      if (start === end) {
        hide()
        return
      }
      const selected = area.value.slice(start, end)
      if (selected.trim() === '') {
        hide()
        return
      }
      popup.hidden = false
      popup.dataset['selection'] = selected
    }
    area.addEventListener('mouseup', onMouseUp)
    area.addEventListener('blur', () => { window.setTimeout(hide, 150) })
    return () => area.removeEventListener('mouseup', onMouseUp)
  }, [onAppendSelection])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <p className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
          {path.split('/').pop() ?? path}
          {dirty ? <span className="ml-2 text-warning">● 未保存</span> : null}
        </p>
        <Button size="sm" variant="secondary" disabled={!dirty} onClick={onSave}>
          保存
        </Button>
      </div>
      <div className="relative min-h-0 flex-1">
        <textarea
          ref={areaRef}
          value={value}
          onChange={event => onChange(event.target.value)}
          spellCheck={false}
          className={cn(
            'h-full w-full resize-none bg-background p-3 font-mono text-[12px] leading-[1.55] text-foreground',
            'outline-none focus-visible:ring-0',
          )}
        />
        <div
          ref={popupRef}
          hidden
          className="absolute bottom-3 right-3 z-10 rounded-md border border-border bg-surface-raised p-1 shadow-md"
        >
          <Button
            size="sm"
            variant="secondary"
            onMouseDown={event => event.preventDefault()}
            onClick={() => {
              const selected = popupRef.current?.dataset['selection']
              if (selected !== undefined && selected !== '') onAppendSelection?.(selected)
              if (popupRef.current) popupRef.current.hidden = true
            }}
          >
            加入对话
          </Button>
        </div>
      </div>
    </div>
  )
}
