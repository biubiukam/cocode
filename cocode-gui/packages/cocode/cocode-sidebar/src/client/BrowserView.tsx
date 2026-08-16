/**
 * The browser tab: a toolbar over a live view of a real Chromium page.
 *
 * There is no iframe here. The page runs in a Chromium the harness owns, and
 * what the canvas shows is its screencast — which is why the panel can open
 * sites that refuse embedding, keep logins across restarts, and let the agent
 * drive the very page the user is watching. Input travels the other way over
 * the same socket, so the panel behaves like a browser rather than a preview.
 *
 * Text input goes through a transparent textarea layered over the canvas.
 * That is what makes an IME work: composing per-keystroke would render
 * candidates against the LOCAL document and send garbage to the remote page,
 * so only the committed string is forwarded.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  IconChevronLeftOutline14,
  IconChevronRightOutline14,
  IconLinkOutline14,
  IconRefreshOutline14,
  IconRightUpOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { normalizeBrowserUrl } from '../browser/url.ts'
import type { BrowserDialog, BrowserEngineStatus, BrowserTabState } from '../browser/protocol.ts'
import { api } from './api.ts'
import {
  BrowserConnection,
  keyFrameOf,
  mouseFrameOf,
  pointOf,
  shouldCapture,
  wheelFrameOf,
} from './browser-viewport.ts'
import { patchTab } from './state.ts'
import { t } from './locales.ts'
import type { TabComponentProps } from './service.ts'
import css from './sidebar.module.css'

/** Debounce of the viewport resize push (a drag fires dozens per second). */
const RESIZE_DEBOUNCE_MS = 120

export function BrowserView(props: TabComponentProps) {
  const { store, tab, scope, visible } = props
  const [input, setInput] = useState(tab.path ?? '')
  const [state, setState] = useState<BrowserTabState | null>(null)
  const [engine, setEngine] = useState<BrowserEngineStatus>({ state: 'ready' })
  const [dialog, setDialog] = useState<BrowserDialog | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [preedit, setPreedit] = useState('')
  const [downloadName, setDownloadName] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const connectionRef = useRef<BrowserConnection | null>(null)
  /** CSS size of the remote page, for mapping pointer coordinates. */
  const pageSizeRef = useRef({ cssWidth: 1280, cssHeight: 800 })
  /** Newest frame wins: an older decode must not overwrite a newer paint. */
  const paintedSeqRef = useRef(0)

  const send = useCallback((frame: Parameters<BrowserConnection['send']>[0]) => {
    connectionRef.current?.send(frame)
  }, [])

  // ── The connection ────────────────────────────────────────────────────────
  useEffect(() => {
    const connection = new BrowserConnection({ sessionId: scope.sessionId, tabId: tab.id }, {
      frame: (header, jpeg) => {
        pageSizeRef.current = { cssWidth: header.cssWidth, cssHeight: header.cssHeight }
        void createImageBitmap(jpeg).then((bitmap) => {
          const canvas = canvasRef.current
          if (canvas === null || header.seq < paintedSeqRef.current) {
            bitmap.close()
            return
          }
          paintedSeqRef.current = header.seq
          if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
            canvas.width = bitmap.width
            canvas.height = bitmap.height
          }
          canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
          bitmap.close()
        }).catch(() => { /* a corrupt frame is simply not painted */ })
      },
      state: (next) => {
        setState(next)
        setInput(current => (document.activeElement === inputRef.current ? current : next.url))
        persist(next)
      },
      engine: setEngine,
      dialog: setDialog,
      download: (name) => {
        setDownloadName(name)
        setMessage(t('browserDownloaded', { name }))
      },
      copy: (text) => { void navigator.clipboard?.writeText(text) },
      error: (_code, text) => { setMessage(text) },
      connected: setConnected,
    })
    connectionRef.current = connection
    return () => {
      connection.dispose()
      connectionRef.current = null
    }
    // The connection is keyed by the tab identity alone; every other input it
    // needs is read through refs so a re-render never tears the socket down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.sessionId, tab.id])

  /** Mirror the live URL onto the tab so a GUI reload restores the page. */
  const persist = (next: BrowserTabState): void => {
    if (next.url === '' || next.url === 'about:blank') return
    let host = next.url
    try { host = new URL(next.url).hostname } catch { /* keep the URL as the title */ }
    store.reduce(current => patchTab(current, tab.id, { path: next.url, title: next.title === '' ? host : next.title }))
  }

  // ── Viewport sizing ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null || !visible) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const push = (): void => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      send({ t: 'viewport', width: Math.round(rect.width), height: Math.round(rect.height), dpr: window.devicePixelRatio })
    }
    const observer = new ResizeObserver(() => {
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(push, RESIZE_DEBOUNCE_MS)
    })
    observer.observe(canvas)
    push()
    return () => {
      observer.disconnect()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [visible, send])

  // A hidden tab keeps its page but drops the JPEG encoder. Disposing the
  // socket would start the reconnect-grace closer and lose the user's place.
  useEffect(() => {
    if (!connected) return
    send({ t: 'watch', on: visible })
  }, [connected, visible, send])

  // Restore the persisted address once the socket is live.
  useEffect(() => {
    if (!connected || tab.path === undefined || tab.path === '' || state !== null) return
    send({ t: 'open', url: tab.path })
  }, [connected, tab.path, state, send])

  // ── Toolbar actions ───────────────────────────────────────────────────────
  const navigateTo = (raw: string): void => {
    const result = normalizeBrowserUrl(raw, window.location.origin)
    if (result.kind === 'invalid') { setMessage(t('browserInvalid')); return }
    if (result.kind === 'blocked') {
      setMessage(result.reason === 'scheme' ? t('browserBlockedScheme') : t('browserBlockedSelf'))
      return
    }
    setMessage(null)
    setInput(result.url)
    send({ t: 'open', url: result.url })
  }

  // ── Input forwarding ──────────────────────────────────────────────────────
  const pointFrom = (event: { clientX: number; clientY: number }): { x: number; y: number } => {
    const canvas = canvasRef.current
    if (canvas === null) return { x: 0, y: 0 }
    return pointOf(event, canvas.getBoundingClientRect(), pageSizeRef.current)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // While an IME is composing, the keystrokes belong to the candidate
    // window — forwarding them would double-type into the remote field.
    if (event.nativeEvent.isComposing) return
    if (shouldCapture(event.nativeEvent)) event.preventDefault()
    send(keyFrameOf('down', event.nativeEvent))
  }

  const engineBlocked = engine.state !== 'ready'

  return (
    <div className={css.browser}>
      <div className={css.browserBar}>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('browserBack')}
          title={t('browserBack')}
          disabled={state?.canGoBack !== true}
          onClick={() => { send({ t: 'nav', to: 'back' }) }}
        >
          <IconChevronLeftOutline14 />
        </button>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('browserForward')}
          title={t('browserForward')}
          disabled={state?.canGoForward !== true}
          onClick={() => { send({ t: 'nav', to: 'forward' }) }}
        >
          <IconChevronRightOutline14 />
        </button>
        <button
          type="button"
          className={css.iconButton}
          aria-label={state?.loading === true ? t('browserStop') : t('refresh')}
          title={state?.loading === true ? t('browserStop') : t('refresh')}
          onClick={() => { send({ t: 'nav', to: state?.loading === true ? 'stop' : 'reload' }) }}
        >
          <IconRefreshOutline14 />
        </button>
        <input
          ref={element => { if (element !== null) element.dataset.role = 'address' }}
          className={css.browserInput}
          value={input}
          placeholder={t('browserPlaceholder')}
          spellCheck={false}
          onChange={event => { setInput(event.target.value) }}
          onKeyDown={event => { if (event.key === 'Enter') navigateTo(input) }}
        />
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('browserGo')}
          title={t('browserGo')}
          onClick={() => { navigateTo(input) }}
        >
          <IconLinkOutline14 />
        </button>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('browserOpenExternal')}
          title={t('browserOpenExternal')}
          disabled={state === null}
          onClick={() => { if (state !== null) window.open(state.url, '_blank', 'noopener') }}
        >
          <IconRightUpOutline16 size={15} />
        </button>
      </div>

      {state?.owner === 'agent' && (
        <div className={css.browserAgentBar}>
          {t('browserAgentDriving')}
          {state.profile !== '' && ` · ${t('browserProfile', { name: state.profile })}`}
        </div>
      )}
      {message !== null && (
        <div className={css.browserMessage}>
          <span onClick={() => { setMessage(null) }}>{message}</span>
          {downloadName !== null && (
            <button
              type="button"
              className={css.browserBlockedButton}
              onClick={() => {
                send({ t: 'download-cancel' })
                setDownloadName(null)
                setMessage(null)
              }}
            >
              {t('browserDownloadCancel')}
            </button>
          )}
        </div>
      )}
      {state !== null && (
        <div className={css.browserPerms}>
          <button type="button" className={css.browserPermChip} onClick={() => { send({ t: 'permission', name: 'geolocation', grant: true }) }}>{t('browserGrantGeo')}</button>
          <button type="button" className={css.browserPermChip} onClick={() => { send({ t: 'permission', name: 'notifications', grant: true }) }}>{t('browserGrantNotify')}</button>
          <button type="button" className={css.browserPermChip} onClick={() => { send({ t: 'permission', name: 'clipboard-read', grant: true }) }}>{t('browserGrantClipboard')}</button>
        </div>
      )}

      {engineBlocked ? (
        <BrowserEnginePrompt status={engine} url={input} />
      ) : (
        <div className={css.browserStage}>
          <canvas
            ref={canvasRef}
            className={css.browserCanvas}
            onMouseDown={event => {
              inputRef.current?.focus()
              send(mouseFrameOf('down', event.nativeEvent, pointFrom(event)))
            }}
            onMouseUp={event => { send(mouseFrameOf('up', event.nativeEvent, pointFrom(event))) }}
            onMouseMove={event => { send(mouseFrameOf('move', event.nativeEvent, pointFrom(event))) }}
            onWheel={event => { send(wheelFrameOf(event.nativeEvent, pointFrom(event))) }}
            onContextMenu={event => { event.preventDefault() }}
          />
          {/*
            Invisible but focused: it owns the caret so the platform IME and
            the clipboard behave normally, while every pixel comes from the
            canvas underneath. pointer-events:none keeps the mouse on the
            canvas; the canvas hands focus back here on mousedown.
          */}
          <textarea
            ref={inputRef}
            className={css.browserKeyboard}
            aria-label={t('browserKeyboard')}
            value=""
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={() => { /* the value is always empty; text arrives through the handlers below */ }}
            onKeyDown={onKeyDown}
            onKeyUp={event => {
              if (event.nativeEvent.isComposing) return
              send(keyFrameOf('up', event.nativeEvent))
            }}
            onCompositionUpdate={event => { setPreedit(event.data) }}
            onCompositionEnd={event => {
              setPreedit('')
              if (event.data !== '') send({ t: 'insert', text: event.data })
            }}
            onPaste={event => {
              event.preventDefault()
              const text = event.clipboardData.getData('text/plain')
              if (text !== '') send({ t: 'insert', text })
            }}
            onCopy={event => {
              event.preventDefault()
              send({ t: 'copy' })
            }}
          />
          {preedit !== '' && <div className={css.browserPreedit}>{preedit}</div>}
          {state === null && <div className={css.browserHint}>{t('browserStart')}</div>}
          {dialog !== null && (
            <BrowserDialogPrompt
              dialog={dialog}
              onAnswer={(accept, text) => { send({ t: 'dialog', accept, text }) }}
            />
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The first-run panel. Chromium is a few hundred megabytes, so it is fetched
 * on demand rather than shipped — the user is told exactly what is about to
 * happen instead of watching an unexplained spinner.
 */
export function BrowserEnginePrompt(props: { status: BrowserEngineStatus; url?: string }) {
  const { status, url } = props
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const installing = status.state === 'installing' || busy
  return (
    <div className={css.browserBlocked}>
      <div className={css.browserBlockedTitle}>
        {status.state === 'error' ? t('browserEngineFailed') : t('browserEngineMissing')}
      </div>
      <div className={css.browserBlockedDesc}>
        {installing ? (status.message ?? t('browserEngineInstalling')) : (failure ?? status.message ?? t('browserEngineMissingDesc'))}
      </div>
      <div className={css.browserBlockedActions}>
        <button
          type="button"
          className={css.browserBlockedButton}
          disabled={installing}
          onClick={() => {
            setBusy(true)
            setFailure(null)
            void api.browserInstall()
              .catch((error: unknown) => { setFailure(error instanceof Error ? error.message : String(error)) })
              .finally(() => { setBusy(false) })
          }}
        >
          {installing ? t('browserEngineInstalling') : t('browserEngineInstall')}
        </button>
        {url !== undefined && url !== '' && (
          <button
            type="button"
            className={css.browserBlockedButton}
            onClick={() => {
              const result = normalizeBrowserUrl(url, window.location.origin)
              if (result.kind === 'ok') window.open(result.url, '_blank', 'noopener')
            }}
          >
            {t('browserOpenExternal')}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * A native `alert` / `confirm` / `prompt` freezes the remote renderer until
 * it is answered, so it is surfaced as a real blocking overlay rather than
 * left to time out invisibly.
 */
export function BrowserDialogPrompt(props: {
  dialog: BrowserDialog
  onAnswer: (accept: boolean, text?: string) => void
}) {
  const { dialog, onAnswer } = props
  const [text, setText] = useState(dialog.defaultValue ?? '')
  return (
    <div className={css.browserDialog}>
      <div className={css.browserDialogCard}>
        <div className={css.browserBlockedTitle}>{dialog.message}</div>
        {dialog.kind === 'prompt' && (
          <input
            className={css.browserInput}
            value={text}
            autoFocus
            onChange={event => { setText(event.target.value) }}
          />
        )}
        <div className={css.browserBlockedActions}>
          {dialog.kind !== 'alert' && (
            <button type="button" className={css.browserBlockedButton} onClick={() => { onAnswer(false) }}>
              {t('browserDialogDismiss')}
            </button>
          )}
          <button
            type="button"
            className={css.browserBlockedButton}
            onClick={() => { onAnswer(true, dialog.kind === 'prompt' ? text : undefined) }}
          >
            {t('browserDialogAccept')}
          </button>
        </div>
      </div>
    </div>
  )
}
