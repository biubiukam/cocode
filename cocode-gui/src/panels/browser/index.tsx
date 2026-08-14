/**
 * Browser: embedded preview of local or remote pages (RFC §3.6).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, Globe, RotateCw } from 'lucide-react'
import { IconButton, Input, Segmented, cn } from '@cocode/ui'
import { definePanel, type PanelProps } from '../types.ts'
import { useHost } from '../../shell/runtime-context.tsx'

const VIEWPORTS = [
  { value: 'auto', label: '自适应' },
  { value: 'mobile', label: '390' },
  { value: 'tablet', label: '834' },
  { value: 'desktop', label: '1280' },
] as const

type ViewportPreset = (typeof VIEWPORTS)[number]['value']

const VIEWPORT_WIDTH: Record<ViewportPreset, number | undefined> = {
  auto: undefined,
  mobile: 390,
  tablet: 834,
  desktop: 1280,
}

function normalizeUrl(input: string): string | undefined {
  const trimmed = input.trim()
  if (trimmed === '') return undefined
  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  }
  catch {
    return undefined
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  return url.toString()
}

type WebviewElement = HTMLElement & {
  src: string
  reload(): void
  goBack(): void
  goForward(): void
  canGoBack(): boolean
  canGoForward(): boolean
  getURL(): string
}

function BrowserPanel({ target }: PanelProps<string>) {
  const host = useHost()
  const [address, setAddress] = useState(target)
  const [current, setCurrent] = useState(target)
  const [viewport, setViewport] = useState<ViewportPreset>('auto')
  const [blocked, setBlocked] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const viewRef = useRef<HTMLElement>(null)
  const embedded = host.embeddedBrowser !== undefined

  useEffect(() => {
    setAddress(target)
    setCurrent(target)
    setInvalid(false)
  }, [target])

  const navigate = useCallback((raw: string) => {
    const url = normalizeUrl(raw)
    if (url === undefined) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setBlocked(false)
    setCurrent(url)
    setAddress(url)
  }, [])

  useEffect(() => {
    const element = viewRef.current as WebviewElement | null
    if (!embedded || element === null) return
    const sync = () => { setAddress(element.getURL()) }
    element.addEventListener('did-navigate', sync)
    element.addEventListener('did-navigate-in-page', sync)
    return () => {
      element.removeEventListener('did-navigate', sync)
      element.removeEventListener('did-navigate-in-page', sync)
    }
  }, [embedded])

  const control = (action: 'back' | 'forward' | 'reload') => () => {
    const element = viewRef.current as WebviewElement | null
    if (embedded && element !== null) {
      if (action === 'back') element.goBack()
      else if (action === 'forward') element.goForward()
      else element.reload()
      return
    }
    if (action === 'reload') setCurrent(value => `${value}${value.includes('#') ? '' : '#'}`)
  }

  const width = VIEWPORT_WIDTH[viewport]

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-[40px] shrink-0 items-center gap-1 border-b border-border px-2">
        <IconButton size="sm" label="后退" disabled={!embedded} onClick={control('back')}><ArrowLeft /></IconButton>
        <IconButton size="sm" label="前进" disabled={!embedded} onClick={control('forward')}><ArrowRight /></IconButton>
        <IconButton size="sm" label="刷新" onClick={control('reload')}><RotateCw /></IconButton>
        <form
          className="min-w-0 flex-1"
          onSubmit={event => {
            event.preventDefault()
            navigate(address)
          }}
        >
          <Input
            value={address}
            onChange={event => setAddress(event.target.value)}
            placeholder="输入地址后回车（允许 localhost）"
            className="h-7 font-mono text-[11px]"
            aria-label="地址栏"
          />
        </form>
        <Segmented<ViewportPreset> options={VIEWPORTS} value={viewport} onChange={setViewport} label="视口尺寸" className="shrink-0" />
        <IconButton size="sm" label="在系统浏览器中打开" onClick={() => globalThis.open(current, '_blank', 'noreferrer')}>
          <ExternalLink />
        </IconButton>
      </div>

      {!embedded
        ? (
            <div className="shrink-0 border-b border-border bg-surface-sunken px-3 py-1.5 text-[11px] text-muted-foreground">
              Web 载体使用 iframe：跨域站点可能拒绝嵌入；localhost 开发预览可用。
            </div>
          )
        : null}
      {invalid
        ? (
            <div className="shrink-0 border-b border-[color-mix(in_srgb,var(--danger)_28%,var(--border))] bg-danger-soft px-3 py-1.5 text-[11px] text-danger">
              仅支持 http(s) 地址，已拒绝 javascript: / data: / file: 等协议。
            </div>
          )
        : null}

      <div className="relative min-h-0 flex-1 overflow-auto bg-surface-sunken p-2">
        <div
          className={cn('mx-auto h-full bg-background shadow-sm', width === undefined ? 'w-full' : '')}
          style={width === undefined ? undefined : { width }}
        >
          {current === ''
            ? (
                <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
                  输入一个地址开始浏览。
                </div>
              )
            : embedded
              ? (
                  <webview
                    ref={viewRef as never}
                    src={current}
                    style={{ width: '100%', height: '100%', display: 'flex' }}
                  />
                )
              : (
                  <iframe
                    key={current}
                    src={current}
                    title="页面预览"
                    className="size-full border-0"
                    sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
                    referrerPolicy="no-referrer"
                    onLoad={event => {
                      try {
                        setBlocked(event.currentTarget.contentWindow === null)
                      }
                      catch {
                        setBlocked(true)
                      }
                    }}
                  />
                )}
        </div>

        {blocked
          ? (
              <div className="absolute inset-2 flex flex-col items-center justify-center gap-2 bg-background/95 text-center">
                <Globe className="size-9 text-subtle-foreground" strokeWidth={1.25} />
                <p className="text-[13px] font-semibold text-foreground">该站点不允许被嵌入</p>
                <p className="max-w-[36ch] text-[11px] text-muted-foreground">
                  目标站点通过 X-Frame-Options 或 CSP frame-ancestors 拒绝了嵌入。可在系统浏览器中打开。
                </p>
                <button
                  type="button"
                  className="text-[12px] font-semibold text-accent-ink underline"
                  onClick={() => globalThis.open(current, '_blank', 'noreferrer')}
                >
                  在浏览器中打开
                </button>
              </div>
            )
          : null}
      </div>
    </div>
  )
}

export const browserPanel = definePanel<string>({
  id: 'browser',
  title: '浏览器',
  icon: Globe,
  scope: 'workspace',
  multiInstance: true,
  preferredDock: 'bottom',
  describe: target => {
    if (target === '') return '新标签'
    try {
      return new URL(target).host
    }
    catch {
      return target
    }
  },
  toKey: target => target,
  fromKey: key => key,
  mintInstance: () => '',
  render: props => <BrowserPanel {...props} />,
})
