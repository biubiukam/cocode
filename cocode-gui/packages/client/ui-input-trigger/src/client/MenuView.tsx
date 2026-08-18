/**
 * Trigger candidate menu: renders the InputTriggerService menu store into the
 * conversation.input.overlay anchor. Closed state renders null (the overlay
 * slot stays mounted); groups render in roster order under localized title
 * rows, pending groups as a loading row; pointer picks route back through
 * the service (combobox pattern — focus never leaves the textarea, so rows
 * are mousedown-handled and the highlight is exposed via
 * aria-activedescendant on the listbox).
 */
import { Fragment, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import clsx from 'clsx'
import { IconFolderClose16, useAnchoredMaxHeight } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './MenuView.module.css'
import type { MenuViewInjected } from './slots.ts'
import type { MenuKey } from './locales.ts'

/** Full menu props: injected face + the locale seat. */
export type MenuViewProps = MenuViewInjected & PropsLocale<'slash.menu'>

/** Design cap on the list height (figma SLASH 39:26572 MenuDropdown). */
const MAX_HEIGHT = 320

/** DOM id of one option row (the aria-activedescendant target). */
function optionId(source: string, index: number): string {
  return `dsh-slash-option-${source}-${index}`
}

/**
 * Render the candidate menu overlay entry.
 * @param props - injected face (the menu store and the pick route); `t` rides the standard locale seat.
 * @returns the dropdown while open; null while closed.
 */
export function MenuView({ menu, onPick, onDismiss, t }: MenuViewProps) {
  const state = useSyncExternalStore(
    fn => menu.subscribe(fn),
    () => menu.getSnapshot(),
  )
  const listRef = useRef<HTMLDivElement>(null)
  // The list is bottom-anchored above the composer; clamp the design cap to
  // the space above it, re-measured on every store update (the anchor moves
  // when the composer grows).
  const maxHeight = useAnchoredMaxHeight(listRef, MAX_HEIGHT, state)
  const highlight = state.open ? state.highlight : null
  // Focus stays in the textarea (combobox pattern), so the browser never
  // scrolls the active option into view on keyboard moves — do it here.
  useEffect(() => {
    if (highlight === null) return
    document.getElementById(optionId(highlight.source, highlight.index))
      ?.scrollIntoView({ block: 'nearest' })
  }, [highlight])
  // Dismiss on pointer outside the menu AND outside the composer card
  // (clicking the textarea or bottom bar must not close the menu).
  useEffect(() => {
    if (!state.open) return
    const onPointerDown = (ev: PointerEvent): void => {
      if (!(ev.target instanceof Node)) return
      if (listRef.current?.contains(ev.target)) return
      const composerCard = listRef.current?.closest('[data-composer-card]')
      if (composerCard?.contains(ev.target)) return
      onDismiss()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => { document.removeEventListener('pointerdown', onPointerDown, true) }
  }, [state.open, onDismiss])
  if (!state.open) return null
  return (
    <div
      ref={listRef}
      className={css.menu}
      style={{ maxHeight }}
      role="listbox"
      aria-label={t('suggestions.aria')}
      aria-activedescendant={highlight !== null ? optionId(highlight.source, highlight.index) : undefined}
    >
      <div className={css.viewport}>
        {state.groups.map(group => (group.status === 'ready' && group.items.length === 0)
          ? null
          : (
            <Fragment key={group.source}>
              {/* Source names key the dictionary open-endedly: the lookup chain
                  returns an unknown key verbatim, so an unregistered source
                  shows its raw name — hence the cast past the typed key union. */}
              <div className={css.groupTitle} role="presentation" data-source={group.source}>{t(group.source as MenuKey)}</div>
              {group.status === 'pending'
                ? <div className={css.loading} data-source={group.source}>{t('loading')}</div>
                : group.items.map((item, index) => {
                  const active = highlight !== null && highlight.source === group.source && highlight.index === index
                  return (
                    <button
                      key={`${group.source}:${index}:${item.name}`}
                      id={optionId(group.source, index)}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={clsx(css.item, active && css.active, group.source === 'file' && css.fileItem)}
                      title={item.description === undefined ? item.name : `${item.description}/${item.name}`}
                      // mousedown, not click: the textarea keeps focus (combobox
                      // pattern) — preventing default stops the focus steal, and the
                      // pick runs before any blur-driven teardown.
                      onMouseDown={(ev) => {
                        ev.preventDefault()
                        onPick(group.source, index)
                      }}
                    >
                      {group.source === 'file'
                        ? <FileKindMark name={item.name} />
                        : item.icon !== undefined && <span className={css.itemIcon} aria-hidden>{item.icon}</span>}
                      <span className={css.itemName}>{item.name}</span>
                      {item.description !== undefined && (
                        <span className={css.itemDescription}>
                          {group.source === 'file' ? <span>{item.description}</span> : item.description}
                        </span>
                      )}
                    </button>
                  )
                })}
            </Fragment>
          ))}
      </div>
    </div>
  )
}

function FileKindMark({ name }: { readonly name: string }): ReactNode {
  if (name.endsWith('/')) {
    return <span className={css.kindMark} data-kind="folder" aria-hidden><IconFolderClose16 size={16} /></span>
  }
  const mark = kindMarkOf(extensionOf(name))
  if (mark === undefined) {
    return <span className={css.kindMark} data-kind="file" aria-hidden><FileGlyph /></span>
  }
  return <span className={css.kindMark} data-kind={mark.kind} aria-hidden>{mark.label}</span>
}

function FileGlyph(): ReactNode {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4.25 2.5h5.1L11.75 5v8.5h-7.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M9.25 2.75V5h2.25" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

function extensionOf(name: string): string {
  const base = name.replace(/\/$/, '')
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1).toLowerCase()
}

function kindMarkOf(ext: string): { readonly kind: string; readonly label: string } | undefined {
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs') return { kind: 'js', label: 'JS' }
  if (ext === 'jsx') return { kind: 'jsx', label: 'JX' }
  if (ext === 'ts' || ext === 'mts' || ext === 'cts') return { kind: 'ts', label: 'TS' }
  if (ext === 'tsx') return { kind: 'tsx', label: 'TSX' }
  if (ext === 'json' || ext === 'jsonc') return { kind: 'json', label: '{ }' }
  if (ext === 'md' || ext === 'mdx') return { kind: 'md', label: 'MD' }
  if (ext === 'css' || ext === 'scss' || ext === 'less') return { kind: 'css', label: '#' }
  if (ext === 'yml' || ext === 'yaml') return { kind: 'yml', label: 'YML' }
  return undefined
}
