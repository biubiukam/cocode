/**
 * Renderer boot: one Cordis tree, one Loader graph, then renderSlot('root').
 */

import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Context, FiberState } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { TooltipProvider } from '@cocode/ui'
import '../styles.css'
import { resolveHostBridge } from '../host/browser-host.ts'
import type { HarnessEndpointInfo } from '../host/bridge.ts'
import { ThemeProvider } from '../shell/theme.tsx'
import { ToastProvider } from '../shell/overlay/toast.tsx'
import { CordisProvider, useLayoutActions, useSessionDirectory } from '../shell/runtime-context.tsx'
import { SlotsProvider, renderSlotTree } from './slot-renderer.tsx'
import { roster } from './roster.ts'

const REQUIRED = ['slots', 'connection', 'sessions', 'shell', 'conversation'] as const

async function bootContext(platform: 'electron' | 'browser', accountHost: unknown): Promise<Context> {
  const ctx = new Context()
  ctx.provide('platform', platform)
  if (accountHost !== undefined) ctx.provide('accountHost', accountHost)

  const loaderFiber = ctx.plugin(Loader)
  await loaderFiber.await()
  const loader = ctx.get('loader')
  if (loader === undefined) throw new Error('Loader failed to provide itself')

  for (const row of roster) {
    loader.builtins[row.id] = row.plugin
    await loader.create({ name: `cordis:${row.id}` })
  }
  await loader.await()

  for (const id of REQUIRED) {
    const entry = [...loader.entries()].find(item => item.options.name === `cordis:${id}`)
    if (entry?.fiber === undefined || entry.fiber.state !== FiberState.ACTIVE) {
      throw new Error(`required plugin "${id}" is not ACTIVE`)
    }
  }
  return ctx
}

function BootApp() {
  const host = useMemo(resolveHostBridge, [])
  const [ctx, setCtx] = useState<Context | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [endpoint, setEndpoint] = useState<HarnessEndpointInfo | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void bootContext(host.platform, host.account).then((next) => {
      if (cancelled) {
        void next.fiber.dispose()
        return
      }
      setCtx(next)
    }, (cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => {
      cancelled = true
    }
  }, [host])

  useEffect(() => {
    if (ctx === undefined) return
    return () => { void ctx.fiber.dispose() }
  }, [ctx])

  useEffect(() => {
    if (ctx === undefined) return
    let current: string | undefined
    const apply = (info: HarnessEndpointInfo) => {
      setEndpoint(info)
      if (info.state.phase !== 'ready') return
      if (current === info.baseUrl) return
      current = info.baseUrl
      ctx.get('connection')?.connect(info.baseUrl)
    }
    const unsubscribe = host.harness.onStateChange(apply)
    void host.harness.resolve().then(apply)
    return () => { unsubscribe() }
  }, [host, ctx])

  if (error !== undefined) {
    return <div className="grid h-full place-items-center p-8 text-[13px] text-danger">{error}</div>
  }
  if (ctx === undefined) return null

  const slots = ctx.get('slots')
  if (slots === undefined) return null

  return (
    <ThemeProvider>
      <CordisProvider ctx={ctx} host={host}>
        <SlotsProvider slots={slots}>
          <TooltipProvider delayDuration={400}>
            <ToastProvider>
              <LayoutWorkspaceBinding />
              {renderSlotTree(slots, 'root', { endpoint })}
            </ToastProvider>
          </TooltipProvider>
        </SlotsProvider>
      </CordisProvider>
    </ThemeProvider>
  )
}

function LayoutWorkspaceBinding() {
  const actions = useLayoutActions()
  const directory = useSessionDirectory()
  useEffect(() => {
    actions.attachWorkspace(directory.activeWorkspaceId)
  }, [actions, directory.activeWorkspaceId])
  return null
}

const container = document.getElementById('root')
if (container === null) throw new Error('missing #root container')

createRoot(container).render(
  <StrictMode>
    <BootApp />
  </StrictMode>,
)
