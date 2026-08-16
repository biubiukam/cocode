/**
 * The action dispatcher: the model's whole vocabulary for changing a page.
 *
 * Every action addresses a node by the `ref` a snapshot handed out, never by
 * a selector the model invented and never by raw coordinates. That is what
 * makes an action auditable — the ref resolves to the exact backend node the
 * snapshot described, and a stale ref fails loudly instead of clicking
 * whatever has since moved into that position.
 *
 * There is deliberately no `evaluate`: arbitrary page script would turn every
 * visited site into a remote-code channel into the user's authenticated
 * profile. The scripted helpers below are fixed, host-authored functions,
 * never model input.
 */
import { stat } from 'node:fs/promises'
import type { Page } from 'playwright-core'
import { BROWSER_ERRORS, BrowserError, type BrowserAction, type BrowserDialog, type BrowserModifier } from './protocol.ts'
import { centerOf, quadToRect, type BoxModelResponse, type CdpSession, type DescribeNodeResponse, type Rect, type ResolveNodeResponse } from './cdp.ts'

/** CDP modifier bits. */
const MODIFIER_BITS: Record<BrowserModifier, number> = { Alt: 1, Control: 2, Meta: 4, Shift: 8 }

/** Non-printable keys the model may press, with their CDP identity. */
const NAMED_KEYS: Record<string, { key: string; code: string; keyCode: number; text?: string }> = {
  enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  tab: { key: 'Tab', code: 'Tab', keyCode: 9, text: '\t' },
  escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  home: { key: 'Home', code: 'Home', keyCode: 36 },
  end: { key: 'End', code: 'End', keyCode: 35 },
  pageup: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  pagedown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
  space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
}

/** Default scroll distance of one `scroll` action, in CSS pixels. */
const SCROLL_STEP = 600

/** Poll interval of the `wait` action's text/url conditions. */
const WAIT_POLL_MS = 250

/** Everything one action needs from the tab that owns the page. */
export interface ActionContext {
  cdp: CdpSession
  page: Page
  /** Resolve a snapshot ref to its backend node id, or throw a stale error. */
  resolveRef(ref: string): number
  /** The dialog currently blocking the page, if any. */
  pendingDialog(): BrowserDialog | null
  /** Answer the pending dialog. */
  answerDialog(accept: boolean, text?: string): Promise<void>
  /** Timeout applied to a single action, in milliseconds. */
  timeoutMs: number
  /** Aborted when a human takes the page over mid-action. */
  signal?: AbortSignal
}

/**
 * Run one action against the page.
 *
 * @returns A one-line description of what happened, for the tool's render.
 */
export async function dispatchAction(context: ActionContext, action: BrowserAction): Promise<string> {
  // A native dialog freezes the renderer: any other action would hang until
  // the action timeout. Fail immediately with the actionable code instead.
  if (action.kind !== 'dialog' && context.pendingDialog() !== null) {
    throw new BrowserError(
      BROWSER_ERRORS.dialogPending,
      'a native dialog is blocking the page; answer it with act({kind:"dialog"}) first',
    )
  }
  return await withTimeout(context.timeoutMs, action.kind, runAction(context, action), context.signal)
}

async function runAction(context: ActionContext, action: BrowserAction): Promise<string> {
  switch (action.kind) {
    case 'click': return await clickAction(context, action)
    case 'hover': return await hoverAction(context, action)
    case 'type': return await typeAction(context, action)
    case 'press': return await pressAction(context, action)
    case 'scroll': return await scrollAction(context, action)
    case 'select': return await selectAction(context, action)
    case 'navigate': return await navigateAction(context, action)
    case 'upload': return await uploadAction(context, action)
    case 'dialog': return await dialogAction(context, action)
    case 'wait': return await waitAction(context, action)
  }
}

// ── Pointer ─────────────────────────────────────────────────────────────────

async function clickAction(
  context: ActionContext,
  action: Extract<BrowserAction, { kind: 'click' }>,
): Promise<string> {
  const point = centerOf(await boxOf(context, action.ref))
  const modifiers = maskOf(action.modifiers)
  const button = action.button ?? 'left'
  const base = { x: point.x, y: point.y, button, modifiers, clickCount: 1, buttons: button === 'right' ? 2 : 1 }
  // A move first: hover-only menus and tooltips open on mouseover, and a
  // press without one lands on an element that was never revealed.
  await context.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, modifiers, buttons: 0 })
  await context.cdp.send('Input.dispatchMouseEvent', { ...base, type: 'mousePressed' })
  await context.cdp.send('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 })
  return `clicked ${action.ref}`
}

async function hoverAction(
  context: ActionContext,
  action: Extract<BrowserAction, { kind: 'hover' }>,
): Promise<string> {
  const point = centerOf(await boxOf(context, action.ref))
  await context.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, modifiers: 0, buttons: 0 })
  return `hovered ${action.ref}`
}

async function scrollAction(
  context: ActionContext,
  action: Extract<BrowserAction, { kind: 'scroll' }>,
): Promise<string> {
  const point = action.ref === undefined
    ? await viewportCenter(context)
    : centerOf(await boxOf(context, action.ref))
  const distance = (action.amount ?? SCROLL_STEP) * (action.direction === 'up' ? -1 : 1)
  await context.cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: point.x,
    y: point.y,
    deltaX: 0,
    deltaY: distance,
    modifiers: 0,
    buttons: 0,
  })
  return `scrolled ${action.direction} by ${String(Math.abs(distance))}px`
}

// ── Text ────────────────────────────────────────────────────────────────────

async function typeAction(
  context: ActionContext,
  action: Extract<BrowserAction, { kind: 'type' }>,
): Promise<string> {
  const backendNodeId = context.resolveRef(action.ref)
  if (action.sensitive !== true && await isCredentialField(context, backendNodeId)) {
    throw new BrowserError(
      BROWSER_ERRORS.blocked,
      'the agent cannot fill login or password fields; the user must type credentials',
    )
  }
  await scrollIntoView(context, backendNodeId)
  await context.cdp.send('DOM.focus', { backendNodeId })
  if (action.clear === true) await callOnNode(context, backendNodeId, CLEAR_FIELD)
  // insertText drives the browser's real text-input pipeline, so beforeinput
  // and input fire exactly as they do for a human — frameworks that listen
  // for them (every controlled React input) see the change.
  await context.cdp.send('Input.insertText', { text: action.text })
  if (action.submit === true) await pressKey(context, 'Enter')
  return `typed ${String(action.text.length)} character(s) into ${action.ref}${action.submit === true ? ' and submitted' : ''}`
}

async function pressAction(
  context: ActionContext,
  action: Extract<BrowserAction, { kind: 'press' }>,
): Promise<string> {
  if (action.ref !== undefined) {
    const backendNodeId = context.resolveRef(action.ref)
    await scrollIntoView(context, backendNodeId)
    await context.cdp.send('DOM.focus', { backendNodeId })
  }
  await pressKey(context, action.key)
  return `pressed ${action.key}`
}

/** Dispatch one keystroke, understanding `Control+Shift+Key` combinations. */
async function pressKey(context: ActionContext, combination: string): Promise<void> {
  const parts = combination.split('+').filter(part => part !== '')
  const keyName = parts.pop() ?? ''
  let modifiers = 0
  for (const part of parts) {
    const canonical = (Object.keys(MODIFIER_BITS) as BrowserModifier[])
      .find(name => name.toLowerCase() === part.toLowerCase() || (part.toLowerCase() === 'ctrl' && name === 'Control')
        || (part.toLowerCase() === 'cmd' && name === 'Meta'))
    if (canonical === undefined) throw new Error(`unknown key modifier "${part}"`)
    modifiers |= MODIFIER_BITS[canonical]
  }
  const spec = keySpec(keyName)
  // A modified key must not carry text — "Control+a" is select-all, while
  // sending text 'a' alongside it would insert the character too.
  const text = modifiers === 0 || modifiers === MODIFIER_BITS.Shift ? spec.text : undefined
  const common = { key: spec.key, code: spec.code, windowsVirtualKeyCode: spec.keyCode, nativeVirtualKeyCode: spec.keyCode, modifiers }
  await context.cdp.send('Input.dispatchKeyEvent', {
    ...common,
    type: text === undefined ? 'rawKeyDown' : 'keyDown',
    ...(text === undefined ? {} : { text, unmodifiedText: text }),
  })
  await context.cdp.send('Input.dispatchKeyEvent', { ...common, type: 'keyUp' })
}

/** Resolve one key name to its CDP identity (named keys, then printables). */
function keySpec(name: string): { key: string; code: string; keyCode: number; text?: string } {
  const named = NAMED_KEYS[name.toLowerCase()]
  if (named !== undefined) return named
  if ([...name].length !== 1) throw new Error(`unknown key "${name}"`)
  const upper = name.toUpperCase()
  const code = /[a-zA-Z]/.test(name)
    ? `Key${upper}`
    : /[0-9]/.test(name) ? `Digit${name}` : ''
  return { key: name, code, keyCode: upper.charCodeAt(0), text: name }
}

// ── Form controls ───────────────────────────────────────────────────────────

/** Clear an input, textarea or contenteditable, notifying listeners. */
const CLEAR_FIELD = `function () {
  if ('value' in this) { this.value = '' }
  else if (this.isContentEditable) { this.textContent = '' }
  this.dispatchEvent(new Event('input', { bubbles: true }))
  this.dispatchEvent(new Event('change', { bubbles: true }))
}`

/** Select options by value or by visible label, then notify listeners. */
const SELECT_OPTIONS = `function (wanted) {
  if (this.tagName !== 'SELECT') { throw new Error('node is not a <select>') }
  const matched = []
  for (const option of this.options) {
    const hit = wanted.includes(option.value) || wanted.includes(option.label) || wanted.includes(option.text.trim())
    option.selected = hit
    if (hit) { matched.push(option.value) }
  }
  this.dispatchEvent(new Event('input', { bubbles: true }))
  this.dispatchEvent(new Event('change', { bubbles: true }))
  return matched
}`

async function selectAction(
  context: ActionContext,
  action: Extract<BrowserAction, { kind: 'select' }>,
): Promise<string> {
  const backendNodeId = context.resolveRef(action.ref)
  await scrollIntoView(context, backendNodeId)
  const matched = await callOnNode(context, backendNodeId, SELECT_OPTIONS, [{ value: [...action.values] }])
  const list = Array.isArray(matched) ? matched : []
  if (list.length === 0) {
    throw new Error(`none of [${action.values.join(', ')}] matched an option of ${action.ref}`)
  }
  return `selected ${list.join(', ')} in ${action.ref}`
}

async function uploadAction(
  context: ActionContext,
  action: Extract<BrowserAction, { kind: 'upload' }>,
): Promise<string> {
  const backendNodeId = context.resolveRef(action.ref)
  for (const path of action.paths) {
    const info = await stat(path).catch(() => undefined)
    if (info === undefined || !info.isFile()) throw new Error(`upload path is not a readable file: ${path}`)
  }
  await context.cdp.send('DOM.setFileInputFiles', { files: [...action.paths], backendNodeId })
  return `attached ${String(action.paths.length)} file(s) to ${action.ref}`
}

// ── Page-level ──────────────────────────────────────────────────────────────

async function navigateAction(
  context: ActionContext,
  action: Extract<BrowserAction, { kind: 'navigate' }>,
): Promise<string> {
  if (action.to === 'reload') await context.page.reload({ waitUntil: 'domcontentloaded' })
  else if (action.to === 'back') await context.page.goBack({ waitUntil: 'domcontentloaded' })
  else await context.page.goForward({ waitUntil: 'domcontentloaded' })
  return `navigated ${action.to}`
}

async function dialogAction(
  context: ActionContext,
  action: Extract<BrowserAction, { kind: 'dialog' }>,
): Promise<string> {
  if (context.pendingDialog() === null) throw new Error('no dialog is open')
  await context.answerDialog(action.accept, action.text)
  return action.accept ? 'accepted the dialog' : 'dismissed the dialog'
}

async function waitAction(
  context: ActionContext,
  action: Extract<BrowserAction, { kind: 'wait' }>,
): Promise<string> {
  if (action.condition === 'load' || action.condition === 'network-idle') {
    await context.page.waitForLoadState(action.condition === 'load' ? 'load' : 'networkidle')
    return `waited for ${action.condition}`
  }
  const needle = action.value
  if (needle === undefined || needle === '') throw new Error(`wait condition "${action.condition}" needs a value`)
  const deadline = Date.now() + context.timeoutMs
  for (;;) {
    const hit = action.condition === 'url'
      ? context.page.url().includes(needle)
      : await pageContainsText(context, needle)
    if (hit) return `waited until ${action.condition} matched "${needle}"`
    if (Date.now() >= deadline) {
      throw new BrowserError(BROWSER_ERRORS.timeout, `"${needle}" did not appear before the timeout`)
    }
    await new Promise(resolve => setTimeout(resolve, WAIT_POLL_MS))
  }
}

async function pageContainsText(context: ActionContext, needle: string): Promise<boolean> {
  const response = await context.cdp.send('Runtime.evaluate', {
    // The needle rides as an argument of a host-authored function rather than
    // interpolated into an expression, so page-visible text can never become
    // executable script.
    expression: `(function (needle) { return document.body !== null && document.body.innerText.includes(needle) })(${JSON.stringify(needle)})`,
    returnByValue: true,
  }).catch(() => undefined) as { result?: { value?: unknown } } | undefined
  return response?.result?.value === true
}

// ── CDP plumbing ────────────────────────────────────────────────────────────

/** Bring a node into view and return its content box in viewport coordinates. */
async function boxOf(context: ActionContext, ref: string): Promise<Rect> {
  const backendNodeId = context.resolveRef(ref)
  await scrollIntoView(context, backendNodeId)
  const response = await context.cdp.send('DOM.getBoxModel', { backendNodeId }).catch(() => undefined) as BoxModelResponse | undefined
  if (response === undefined) {
    throw new BrowserError(BROWSER_ERRORS.stale, `${ref} is no longer laid out on the page; take a fresh snapshot`)
  }
  const rect = quadToRect(response.model.content)
  if (rect.width === 0 || rect.height === 0) {
    throw new BrowserError(BROWSER_ERRORS.stale, `${ref} has no visible box; take a fresh snapshot`)
  }
  return rect
}

async function scrollIntoView(context: ActionContext, backendNodeId: number): Promise<void> {
  await context.cdp.send('DOM.scrollIntoViewIfNeeded', { backendNodeId }).catch(() => {
    // Detached or display:none nodes cannot scroll; boxOf reports the
    // actionable stale error a moment later with the ref in the message.
  })
}

/** Run one host-authored function with the node as `this`. */
async function callOnNode(
  context: ActionContext,
  backendNodeId: number,
  functionDeclaration: string,
  args: Array<{ value: unknown }> = [],
): Promise<unknown> {
  const resolved = await context.cdp.send('DOM.resolveNode', { backendNodeId }) as ResolveNodeResponse
  const objectId = resolved.object.objectId
  if (objectId === undefined) throw new BrowserError(BROWSER_ERRORS.stale, 'the node could not be resolved; take a fresh snapshot')
  const response = await context.cdp.send('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration,
    arguments: args,
    returnByValue: true,
  }) as { result?: { value?: unknown }; exceptionDetails?: { text?: string; exception?: { description?: string } } }
  const failure = response.exceptionDetails
  if (failure !== undefined) {
    throw new Error(failure.exception?.description ?? failure.text ?? 'the page rejected the action')
  }
  return response.result?.value
}

async function viewportCenter(context: ActionContext): Promise<{ x: number; y: number }> {
  const size = context.page.viewportSize()
  return { x: (size?.width ?? 1280) / 2, y: (size?.height ?? 800) / 2 }
}

/** Bound one action so a hung page surfaces a timeout rather than a stuck turn. */
async function withTimeout<T>(
  timeoutMs: number,
  kind: string,
  work: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) {
    throw new BrowserError(BROWSER_ERRORS.leaseRevoked, 'the user took over the page; the action was cancelled')
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const onAbort = (): void => {
    if (timer !== undefined) clearTimeout(timer)
  }
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => { reject(new BrowserError(BROWSER_ERRORS.timeout, `the ${kind} action did not settle within ${String(timeoutMs)}ms`)) },
          timeoutMs,
        )
        signal?.addEventListener('abort', () => {
          reject(new BrowserError(BROWSER_ERRORS.leaseRevoked, 'the user took over the page; the action was cancelled'))
        }, { once: true })
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** Password / username fields the agent must not fill. */
async function isCredentialField(context: ActionContext, backendNodeId: number): Promise<boolean> {
  const described = await context.cdp.send('DOM.describeNode', { backendNodeId }) as DescribeNodeResponse
  const attrs = attributesOf(described.node.attributes ?? [])
  const type = (attrs.type ?? '').toLowerCase()
  const autocomplete = (attrs.autocomplete ?? '').toLowerCase()
  const name = `${attrs.name ?? ''} ${attrs.id ?? ''} ${attrs.placeholder ?? ''}`.toLowerCase()
  if (type === 'password') return true
  if (autocomplete.includes('password') || autocomplete === 'username') return true
  return /\b(password|passwd|username)\b/.test(name)
}

function attributesOf(flat: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i + 1 < flat.length; i += 2) out[flat[i]!] = flat[i + 1]!
  return out
}

/** Compose a CDP modifier bitmask from the action's modifier list. */
function maskOf(modifiers: readonly BrowserModifier[] | undefined): number {
  let mask = 0
  for (const modifier of modifiers ?? []) mask |= MODIFIER_BITS[modifier]
  return mask
}
