/**
 * Git 面板的数据来源与命令通道。
 *
 * 面板可见时按固定间隔重读状态，因为改动同样可能来自终端里的 git 命令或
 * agent 的写文件——只在自己发起操作后刷新会让面板停在过期视图上。轮询用
 * setTimeout 串行推进而非 setInterval，慢响应不会让请求叠罗汉。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { fetchStatus, gitRequest, type GitBranch, type GitStash, type GitStatus } from "./git-client.ts"

/** 状态重读间隔；足够跟上外部改动，又不至于让 git 进程常驻。 */
const POLL_MS = 3000

export interface GitStoreState {
  readonly loading: boolean
  readonly error?: string
  readonly status?: GitStatus
  readonly branches: readonly GitBranch[]
  /** 远程分支全名（`origin/main`），用于切到尚未在本地存在的分支。 */
  readonly remoteBranches: readonly string[]
  readonly stashes: readonly GitStash[]
  /** 有命令正在执行，工具栏据此显示忙碌并禁用重复触发。 */
  readonly busy: boolean
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useGitStore(sessionId: string | undefined, visible: boolean) {
  const [state, setState] = useState<GitStoreState>({ loading: true, branches: [], remoteBranches: [], stashes: [], busy: false })
  // 命令执行期间跳过轮询：git 的写操作与状态读取交错会读到中间态。
  const busyRef = useRef(false)

  const load = useCallback(async (signal?: AbortSignal) => {
    if (sessionId === undefined) {
      setState(current => ({ ...current, loading: false, status: undefined }))
      return
    }
    try {
      const status = await fetchStatus(sessionId, signal)
      if (signal?.aborted === true) return
      setState(current => ({ ...current, loading: false, error: undefined, status }))
    } catch (error) {
      if (signal?.aborted === true) return
      setState(current => ({ ...current, loading: false, error: toMessage(error) }))
    }
  }, [sessionId])

  useEffect(() => {
    if (!visible || sessionId === undefined) return
    let disposed = false
    let timer: number | undefined
    const controller = new AbortController()
    const tick = async (): Promise<void> => {
      if (!busyRef.current) await load(controller.signal)
      if (!disposed) timer = window.setTimeout(() => void tick(), POLL_MS)
    }
    void tick()
    return () => {
      disposed = true
      controller.abort()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [load, sessionId, visible])

  /**
   * 执行一条 git 命令并重读状态。返回错误文本而不是抛出，调用方据此决定是把
   * 它显示在提示条上还是忽略。
   */
  const run = useCallback(async (method: string, payload: Record<string, unknown> = {}): Promise<string | undefined> => {
    if (sessionId === undefined) return undefined
    busyRef.current = true
    setState(current => ({ ...current, busy: true }))
    try {
      await gitRequest(method, { sessionId, ...payload })
      await load()
      return undefined
    } catch (error) {
      await load()
      return toMessage(error)
    } finally {
      busyRef.current = false
      setState(current => ({ ...current, busy: false }))
    }
  }, [load, sessionId])

  /** 分支清单只在分支菜单打开时才需要，独立于状态轮询。 */
  const loadBranches = useCallback(async () => {
    if (sessionId === undefined) return
    try {
      const result = await gitRequest<{ local: readonly GitBranch[]; remote: readonly string[] }>("git.branches", { sessionId })
      setState(current => ({ ...current, branches: result.local, remoteBranches: result.remote }))
    } catch { /* 菜单退化为只剩新建分支，不值得打断用户 */ }
  }, [sessionId])

  const loadStashes = useCallback(async () => {
    if (sessionId === undefined) return
    try {
      const result = await gitRequest<{ stashes: readonly GitStash[] }>("git.stashList", { sessionId })
      setState(current => ({ ...current, stashes: result.stashes }))
    } catch { /* 贮藏段暂时不显示，状态轮询会再给一次机会 */ }
  }, [sessionId])

  const stashCount = state.status?.isRepo === true ? state.status.stashCount : 0
  // 贮藏条数变化即刷新列表，包括其他终端里 stash 之后。
  useEffect(() => {
    if (stashCount > 0) void loadStashes()
    else setState(current => (current.stashes.length === 0 ? current : { ...current, stashes: [] }))
  }, [loadStashes, stashCount])

  return { state, reload: load, run, loadBranches, loadStashes }
}
