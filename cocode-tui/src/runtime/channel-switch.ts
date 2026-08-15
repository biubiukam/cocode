/**
 * Restart jsonrpc to switch channels. New session, clear projection.
 */

import type { TuiRuntime } from '@cocode/tui-connection'
import type { SelectModeResult } from './auth/store.ts'
import type { AuthSnapshot, ResolvedAuth } from './auth/types.ts'
import { displayError, errorNotice, formatError } from './errors/index.ts'
import { startErrorMessage } from './app-view.ts'
import { HomeBusyError } from './auth/live-instances.ts'
import { createDraft, type DraftState } from './draft.ts'

export type ChannelTarget = 'byok' | 'cocode' | 'login'

export type ChannelAuth = {
  mode: 'byok' | 'cocode'
  envLocked: boolean
  logout(): Promise<void>
  exclusiveHome?: () => Promise<boolean>
  selectMode?: (mode: 'byok' | 'cocode') => Promise<SelectModeResult>
  login?: () => void
  submitByok?: (key: string) => Promise<void>
  resolved?: () => ResolvedAuth
  snapshot?: () => AuthSnapshot
  subscribe?: (listener: () => void) => () => void
}

export type ChannelSwitchHost = {
  agent: 'idle' | 'running' | 'starting' | 'dead'
  cwd: string
  provider: string
  model: string
  sessionId: string
  capturingByok: boolean
  draft: DraftState
  notice?: { tone: 'info' | 'error'; message: string }
  auth?: ChannelAuth
  runtime: TuiRuntime
  assembler: { reset(): void }
  resetTelemetry?: () => void
  resetSessionState?: () => void
  resetPromptQueue?: () => void
  emit(): void
  beginQuit(): void
}

export function requestChannelSwitch(host: ChannelSwitchHost, target: ChannelTarget): void {
  if (host.agent === 'running') {
    host.notice = {
      tone: 'info',
      message: 'Turn in progress. Wait or press Esc.',
    }
    host.emit()
    return
  }
  void runChannelSwitch(host, target)
}

async function ensureExclusiveHome(host: ChannelSwitchHost): Promise<boolean> {
  if (host.auth?.exclusiveHome === undefined) return true
  if (await host.auth.exclusiveHome()) return true
  host.notice = errorNotice('AUTH_HOME_BUSY')
  host.emit()
  return false
}

export async function submitCapturedByok(host: ChannelSwitchHost, key: string): Promise<void> {
  if (key.trim() === '') {
    host.notice = errorNotice('AUTH_BYOK_EMPTY')
    host.emit()
    return
  }
  if (!(await ensureExclusiveHome(host))) return
  host.draft = createDraft()
  host.notice = undefined
  host.emit()
  try {
    await host.auth?.submitByok?.(key)
    host.capturingByok = false
    await host.auth?.selectMode?.('byok')
    await applyResolved(host, 'byok')
  } catch (error) {
    host.notice = { tone: 'error', message: displayError(error) }
    host.emit()
  }
}

export async function logoutChannel(host: ChannelSwitchHost): Promise<void> {
  if (host.auth === undefined) {
    host.notice = { tone: 'info', message: 'Not signed in to Cocode.' }
    host.emit()
    return
  }
  if (host.agent === 'running') {
    host.notice = {
      tone: 'info',
      message: 'Turn in progress. Wait or press Esc.',
    }
    host.emit()
    return
  }
  if (!(await ensureExclusiveHome(host))) return
  try {
    await host.auth.logout()
  } catch (error) {
    if (error instanceof HomeBusyError) {
      host.notice = errorNotice('AUTH_HOME_BUSY')
      host.emit()
      return
    }
    host.notice = { tone: 'error', message: displayError(error) }
    host.emit()
    return
  }
  const snapshot = host.auth.snapshot?.()
  if (snapshot?.phase === 'ready') {
    if (host.auth.resolved !== undefined) host.auth.mode = host.auth.resolved().mode
    await applyResolved(host, host.auth.mode)
    return
  }
  host.notice = { tone: 'info', message: 'Signed out.' }
  host.beginQuit()
}

async function runChannelSwitch(host: ChannelSwitchHost, target: ChannelTarget): Promise<void> {
  if (host.auth === undefined) {
    host.notice = { tone: 'info', message: 'Auth is unavailable.' }
    host.emit()
    return
  }
  if (!(await ensureExclusiveHome(host))) return
  if (target === 'login') {
    startLogin(host)
    return
  }
  if (host.auth.envLocked) {
    host.notice = { tone: 'info', message: '当前通道由环境变量锁定。' }
    host.emit()
    return
  }
  const result = await host.auth.selectMode?.(target)
  if (result === undefined) {
    host.notice = { tone: 'info', message: 'Auth switching is unavailable.' }
    host.emit()
    return
  }
  if (result.status === 'env-locked') {
    host.notice = { tone: 'info', message: '当前通道由环境变量锁定。' }
    host.emit()
    return
  }
  if (result.status === 'home-busy') {
    host.notice = errorNotice('AUTH_HOME_BUSY')
    host.emit()
    return
  }
  if (result.status === 'need-byok') {
    host.capturingByok = true
    host.draft = createDraft()
    host.notice = { tone: 'info', message: '请粘贴 API Key。' }
    host.emit()
    return
  }
  if (result.status === 'need-login') {
    startLogin(host)
    return
  }
  await applyResolved(host, target)
}

function startLogin(host: ChannelSwitchHost): void {
  host.auth?.login?.()
  const subscribe = host.auth?.subscribe
  if (subscribe === undefined) return
  const stop = subscribe(() => {
    const snapshot = host.auth?.snapshot?.()
    if (snapshot === undefined) return
    if (snapshot.phase === 'device' && snapshot.device !== undefined) {
      host.notice = {
        tone: 'info',
        message: `在浏览器确认 ${snapshot.device.userCode} · ${snapshot.device.verificationUri}`,
      }
      host.emit()
      return
    }
    if (snapshot.phase === 'failed') {
      stop()
      host.notice = {
        tone: 'error',
        message: snapshot.error ?? formatError('AUTH_LOGIN_FAILED'),
      }
      host.emit()
      return
    }
    if (snapshot.phase === 'ready' && snapshot.mode === 'cocode') {
      stop()
      void applyResolved(host, 'cocode')
    }
  })
}

async function applyResolved(host: ChannelSwitchHost, target: 'byok' | 'cocode'): Promise<void> {
  const auth = host.auth?.resolved?.()
  if (auth === undefined) return
  const previous = { provider: host.provider, model: host.model }
  host.agent = 'starting'
  host.emit()
  try {
    host.resetPromptQueue?.()
    await host.runtime.restart(
      { cwd: host.cwd, provider: auth.provider, model: auth.model },
      auth.env,
    )
    host.provider = auth.provider
    host.model = auth.model
    host.sessionId = crypto.randomUUID()
    host.assembler.reset()
    host.resetTelemetry?.()
    host.resetSessionState?.()
    host.capturingByok = false
    if (host.auth !== undefined) host.auth.mode = auth.mode
    host.agent = 'idle'
    host.notice = {
      tone: 'info',
      message: target === 'byok' ? '已切换到 API Key，新会话' : '已切换到 Cocode，新会话',
    }
  } catch (error) {
    try {
      await host.runtime.restart({
        cwd: host.cwd,
        provider: previous.provider,
        model: previous.model,
      })
      host.agent = 'idle'
      host.notice = { tone: 'error', message: displayError(error) }
    } catch {
      host.agent = 'dead'
      host.notice = { tone: 'error', message: startErrorMessage(error) }
    }
  }
  host.emit()
}
