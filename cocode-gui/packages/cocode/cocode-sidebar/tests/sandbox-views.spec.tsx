/**
 * Contract tests for the two built-in web surfaces.
 *
 * The HTML preview frames untrusted workspace files, so its iframe sandbox —
 * opaque origin, no allow-same-origin, no top-navigation — is the PRIMARY
 * security boundary; the tests pin the exact attribute so a refactor cannot
 * silently widen it.
 *
 * The browser tab is the opposite construction: the page runs in a Chromium
 * outside the GUI and reaches the panel as a screencast, so the assertions
 * there guard the surface that replaced the iframe (canvas, IME textarea,
 * engine install prompt, native dialogs).
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createElement } from 'react'
import './browser-globals.ts'
import type { Context } from '../src/context-types.ts'
import { TextEditor, HTML_IFRAME_SANDBOX } from '../src/client/TextEditor.tsx'
import { BrowserView, BrowserDialogPrompt, BrowserEnginePrompt } from '../src/client/BrowserView.tsx'
import { createSidebarStore } from '../src/client/state.ts'
import type { FileViewerProps } from '../src/client/service.ts'

const CTX = {} as Context

// The copy assertions below pin the zh strings: force the zh locale (the
// test environment's navigator may be the real Node one with an en locale).
beforeEach(() => {
  Object.defineProperty(globalThis.navigator, 'language', { value: 'zh-CN', configurable: true })
})

function viewerProps(store: ReturnType<typeof createSidebarStore>, overrides: Partial<FileViewerProps> = {}): FileViewerProps {
  return {
    ctx: CTX,
    store,
    scope: { sessionId: 's1', cwd: '/p' },
    path: '/p/a/index.html',
    title: 'index.html',
    viewerId: 'html',
    content: '<h1>hi</h1>',
    ...overrides,
  }
}

describe('HTML preview iframe sandbox', () => {
  it('renders the preview iframe with the exact sandbox tokens and no same-origin / top-navigation', () => {
    const store = createSidebarStore()
    const html = renderToString(createElement(TextEditor, viewerProps(store)))
    const iframe = /<iframe[^>]*>/.exec(html)?.[0]
    expect(iframe).toBeDefined()
    // The sandbox tokens are exactly the exported constant...
    expect(iframe).toContain(`sandbox="${HTML_IFRAME_SANDBOX}"`)
    // ...which must never contain the dangerous tokens.
    expect(HTML_IFRAME_SANDBOX).not.toContain('allow-same-origin')
    expect(HTML_IFRAME_SANDBOX).not.toContain('allow-top-navigation')
    // Cross-origin framing by construction: route-src (never srcdoc).
    expect(iframe).toContain('src="/sidebar/html/s1/p/a/index.html"')
    expect(iframe).not.toContain('srcdoc=')
    // Referrer + permissions policy stay locked even when sandboxed.
    // (React SSR renders the referrerPolicy prop camelCase as written.)
    expect(iframe).toContain('referrerPolicy="no-referrer"')
    expect(iframe).toContain('allow=""')
  })

  it('renders the live sandbox status row (green on + temporary unlock action)', () => {
    const store = createSidebarStore()
    const html = renderToString(createElement(TextEditor, viewerProps(store)))
    // Sandbox ON: the green status + the one-tap temporary unlock button.
    expect(html).toContain('沙箱模式：已启用')
    expect(html).toContain('临时解锁（不安全）')
    // No restore action while the sandbox is on.
    expect(html).not.toContain('恢复沙箱')
  })

  it('drops the sandbox attribute with the red warning when the setting is on (no restore action — the global setting owns it)', () => {
    const store = createSidebarStore()
    store.setPrefs({ ...store.getPrefs(), htmlViewerNoSandbox: true })
    const html = renderToString(createElement(TextEditor, viewerProps(store)))
    const iframe = /<iframe[^>]*>/.exec(html)?.[0]
    expect(iframe).toBeDefined()
    expect(iframe).not.toContain('sandbox=')
    // The red persistent warning copy is rendered; the temporary-unlock
    // action is NOT offered (re-enabling is the settings page's job).
    expect(html).toContain('沙箱已关闭')
    expect(html).not.toContain('临时解锁（不安全）')
    expect(html).not.toContain('恢复沙箱')
  })

  it('starts unsandboxed (red, restorable) when the default-unsafe pref is on', () => {
    const store = createSidebarStore()
    store.setPrefs({ ...store.getPrefs(), htmlViewerDefaultUnsafe: true })
    const html = renderToString(createElement(TextEditor, viewerProps(store)))
    const iframe = /<iframe[^>]*>/.exec(html)?.[0]
    expect(iframe).toBeDefined()
    expect(iframe).not.toContain('sandbox=')
    // The red warning + the one-tap restore (this is the LOCAL state).
    expect(html).toContain('沙箱已关闭')
    expect(html).toContain('恢复沙箱')
    expect(html).not.toContain('临时解锁（不安全）')
  })

  it('markdown preview keeps rendering markdown, not an iframe', () => {
    const store = createSidebarStore()
    const html = renderToString(createElement(TextEditor, viewerProps(store, {
      viewerId: 'markdown',
      path: '/p/readme.md',
      content: '# hi',
    })))
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('/sidebar/html/')
    // The markdown is rendered into markup, not framed.
    expect(html).toContain('<h1')
  })
})

describe('browser tab surface', () => {
  function tabProps(store: ReturnType<typeof createSidebarStore>, path?: string) {
    return {
      ctx: CTX,
      store,
      scope: { sessionId: 's1', cwd: '/p' },
      tab: { id: 'browser:1', type: 'browser', title: 'Browser', ...(path !== undefined ? { path } : {}) },
      visible: true,
    }
  }

  it('renders the page as a canvas, never an iframe (the whole point of the rewrite)', () => {
    const store = createSidebarStore()
    const html = renderToString(createElement(BrowserView, tabProps(store, 'https://example.com/')))
    expect(html).not.toContain('<iframe')
    expect(html).toContain('<canvas')
  })

  it('shows the start hint until the host reports a page state', () => {
    const store = createSidebarStore()
    const html = renderToString(createElement(BrowserView, tabProps(store)))
    expect(html).toContain('输入网址开始浏览')
  })

  it('layers a focusable textarea over the canvas so an IME and the clipboard work', () => {
    const store = createSidebarStore()
    const html = renderToString(createElement(BrowserView, tabProps(store, 'https://example.com/')))
    expect(html).toContain('<textarea')
    expect(html).toContain('aria-label="网页键盘输入"')
  })

  it('disables the system-browser action until a page is loaded', () => {
    const store = createSidebarStore()
    const html = renderToString(createElement(BrowserView, tabProps(store)))
    expect(html).toContain('aria-label="在系统浏览器中打开"')
    expect(html).toContain('title="在系统浏览器中打开" disabled=""')
  })
})

describe('browser engine prompt', () => {
  it('explains the one-time Chromium download instead of spinning silently', () => {
    const html = renderToString(createElement(BrowserEnginePrompt, { status: { state: 'missing' } }))
    expect(html).toContain('需要下载浏览器内核')
    expect(html).toContain('下载并启用')
  })

  it('surfaces an install failure verbatim', () => {
    const html = renderToString(createElement(BrowserEnginePrompt, {
      status: { state: 'error', message: 'ENOSPC: no space left on device' },
    }))
    expect(html).toContain('浏览器内核不可用')
    expect(html).toContain('ENOSPC: no space left on device')
  })
})

describe('browser dialog prompt', () => {
  it('renders a confirm with both answers', () => {
    const html = renderToString(createElement(BrowserDialogPrompt, {
      dialog: { kind: 'confirm', message: 'Delete this item?' },
      onAnswer: () => {},
    }))
    expect(html).toContain('Delete this item?')
    expect(html).toContain('确定')
    expect(html).toContain('取消')
  })

  it('renders an alert with only the acknowledge action (there is nothing to dismiss)', () => {
    const html = renderToString(createElement(BrowserDialogPrompt, {
      dialog: { kind: 'alert', message: 'Saved.' },
      onAnswer: () => {},
    }))
    expect(html).toContain('Saved.')
    expect(html).not.toContain('取消')
  })

  it('offers an input seeded with the default for a prompt', () => {
    const html = renderToString(createElement(BrowserDialogPrompt, {
      dialog: { kind: 'prompt', message: 'Your name?', defaultValue: 'ada' },
      onAnswer: () => {},
    }))
    expect(html).toContain('Your name?')
    expect(html).toContain('value="ada"')
  })
})
