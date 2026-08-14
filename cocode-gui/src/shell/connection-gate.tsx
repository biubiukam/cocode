/**
 * Connection state as a first-class surface (RFC §4.2).
 *
 * A harness that is starting, unreachable, version-mismatched, or crashed must say
 * so inside the product. Before the first successful handshake this takes the whole
 * window; after it, a lost generation shows a banner so the last known state stays
 * readable while the runtime rebuilds.
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { PlugZap, RefreshCw, ShieldAlert, TriangleAlert } from 'lucide-react'
import { Button, Spinner, cn } from '@cocode/ui'
import type { HarnessEndpointInfo } from '../host/bridge.ts'
import type { ConnectionFailure } from '../runtime/connection/controller.ts'
import { useConnection, useConnectionService, useHost } from './runtime-context.tsx'

/** User-facing copy only — raw errors stay in logs, not on the splash. */
function userFacingFailureCopy(
  failure: ConnectionFailure | undefined,
  processState: HarnessEndpointInfo['state'] | undefined,
): { body?: string; hint?: string } {
  if (processState?.phase === 'exited' || processState?.phase === 'failed') {
    const detail = processState.phase === 'exited'
      ? processState.stderrTail.trim()
      : processState.message.trim()
    return {
      body: processState.phase === 'exited' ? 'harness 未能正常启动。' : 'harness 启动失败。',
      hint: detail || '会自动重试；你也可以手动重试连接。',
    }
  }
  if (failure === undefined) return {}
  switch (failure.kind) {
    case 'version-mismatch':
    case 'rejected':
      return { body: failure.message, hint: failure.hint }
    case 'unreachable':
      return {
        body: '无法连接到 harness。',
        hint: failure.hint ?? '确认 harness 正在运行，且 GUI 指向了它的地址。',
      }
    case 'stream-lost':
      return {
        body: '连接中断。',
        hint: failure.hint ?? '连接会自动重建；重建后界面会重新取回完整基线。',
      }
  }
}

function bannerFailureMessage(failure: ConnectionFailure | undefined): string {
  if (failure === undefined) return '正在重新建立与 harness 的连接'
  if (failure.kind === 'version-mismatch' || failure.kind === 'rejected') return failure.message
  if (failure.kind === 'unreachable') return '无法连接到 harness'
  return '连接中断，正在重新连接'
}

function Countdown({ target }: { target: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])
  const seconds = Math.max(0, Math.ceil((target - now) / 1000))
  return <span className="font-mono tabular-nums">{seconds}s</span>
}

/** The blocking screen shown before any generation has ever been ready. */
export function ConnectionSplash({ endpoint }: { endpoint?: HarnessEndpointInfo }) {
  const connection = useConnection()
  const host = useHost()
  const service = useConnectionService()
  const [everReady, setEverReady] = useState(false)
  useEffect(() => {
    if (connection.phase === 'ready') setEverReady(true)
  }, [connection.phase])
  if (everReady) return null
  const failure = connection.failure
  const processState = endpoint?.state

  const processFailed = processState?.phase === 'failed' || processState?.phase === 'exited'
  const Icon = failure?.kind === 'version-mismatch'
    ? TriangleAlert
    : failure?.kind === 'rejected'
      ? ShieldAlert
      : PlugZap
  const copy = userFacingFailureCopy(failure, processState)

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-background p-8">
      <div className="w-full max-w-[560px] rounded-lg border border-border bg-surface-raised p-6 shadow-sm">
        <div className="flex items-center gap-3">
          {failure === undefined && !processFailed
            ? <Spinner className="size-5" />
            : <Icon className={cn('size-5', failure?.kind === 'version-mismatch' ? 'text-warning' : 'text-danger')} />}
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold tracking-[-0.02em]">
              {failure === undefined && !processFailed ? '正在连接 harness' : '无法连接 harness'}
            </h1>
            <p className="truncate font-mono text-[11px] text-muted-foreground">
              {endpoint?.mode === 'embedded' ? '内嵌模式' : '连接模式'} · {connection.baseUrl === '' ? '同源' : connection.baseUrl}
            </p>
          </div>
        </div>

        {copy.body === undefined
          ? null
          : (
              <div className="mt-4">
                <p className="text-[12px] text-foreground">{copy.body}</p>
                {copy.hint === undefined ? null : <p className="mt-1 text-[11px] text-muted-foreground">{copy.hint}</p>}
              </div>
            )}

        <div className="mt-5 flex items-center gap-2">
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              void host.harness.restart()
              service.retryNow()
            }}
          >
            <RefreshCw />
            重试连接
          </Button>
          {connection.retryAtEpochMs === undefined
            ? null
            : (
                <p className="text-[11px] text-muted-foreground">
                  将在 <Countdown target={connection.retryAtEpochMs} /> 后自动重试
                </p>
              )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** The non-blocking banner shown once the shell already has content to keep. */
export function ConnectionBanner() {
  const service = useConnectionService()
  const connection = useConnection()
  const [everReady, setEverReady] = useState(false)
  useEffect(() => {
    if (connection.phase === 'ready') setEverReady(true)
  }, [connection.phase])

  if (!everReady || connection.phase === 'ready' || connection.phase === 'idle') return null

  return (
    <div className="flex min-h-[32px] shrink-0 items-center gap-2 border-b border-[color-mix(in_srgb,var(--warning)_28%,var(--border))] bg-warning-soft px-4 text-[11px] text-warning">
      <Spinner className="size-3.5 text-warning" />
      <span className="min-w-0 flex-1 truncate">
        {bannerFailureMessage(connection.failure)}
        {connection.retryAtEpochMs === undefined ? '' : ' · '}
      </span>
      {connection.retryAtEpochMs === undefined ? null : <Countdown target={connection.retryAtEpochMs} />}
      <button type="button" className="shrink-0 underline underline-offset-2" onClick={() => service.retryNow()}>
        立即重试
      </button>
    </div>
  )
}
