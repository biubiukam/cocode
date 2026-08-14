import { useSyncExternalStore } from 'react'
import { Segmented } from '@cocode/ui'
import {
  getDockPrefs,
  setDockPrefs,
  subscribeDockPrefs,
  type DockPrefs,
} from '../../../runtime/prefs/dock-prefs.ts'

const BOOL = [
  { value: 'on', label: '开' },
  { value: 'off', label: '关' },
] as const

const LIMITS = [
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '5', label: '5' },
  { value: '8', label: '8' },
] as const

function usePrefs(): DockPrefs {
  return useSyncExternalStore(subscribeDockPrefs, getDockPrefs, getDockPrefs)
}

function SettingCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-surface px-4 py-1">{children}</div>
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-6 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground">{title}</p>
        {description !== undefined && description !== ''
          ? <p className="mt-0.5 text-[12px] leading-[1.45] text-muted-foreground">{description}</p>
          : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

function boolValue(on: boolean): 'on' | 'off' {
  return on ? 'on' : 'off'
}

export function DockWorkbenchSettings() {
  const prefs = usePrefs()
  return (
    <SettingCard>
      <SettingRow title="每工作区终端上限" description="用户终端 tab 数量上限；满后无法再新建。">
        <Segmented
          label="终端上限"
          options={LIMITS}
          value={String(prefs.terminalLimit)}
          onChange={value => setDockPrefs({ terminalLimit: Number(value) })}
        />
      </SettingRow>
      <SettingRow title="底栏首开自动终端" description="底部 Dock 首次展开且无 tab 时自动打开终端。">
        <Segmented
          label="底栏首开终端"
          options={BOOL}
          value={boolValue(prefs.bottomAutoTerminal)}
          onChange={value => setDockPrefs({ bottomAutoTerminal: value === 'on' })}
        />
      </SettingRow>
      <SettingRow title="终端保活" description="关闭终端 tab 时保留 PTY（进阶；默认关）。">
        <Segmented
          label="终端保活"
          options={BOOL}
          value={boolValue(prefs.terminalKeepAlive)}
          onChange={value => setDockPrefs({ terminalKeepAlive: value === 'on' })}
        />
      </SettingRow>
      <SettingRow title="对话链接在 Browser 打开" description="默认关闭。⌘/Ctrl+点击仍外开。">
        <Segmented
          label="链接接管"
          options={BOOL}
          value={boolValue(prefs.browserInterceptLinks)}
          onChange={value => setDockPrefs({ browserInterceptLinks: value === 'on' })}
        />
      </SettingRow>
      <SettingRow title="HTML 预览关闭沙箱" description="危险：内容与界面同源。仅用于完全可信文件。">
        <Segmented
          label="HTML 沙箱"
          options={BOOL}
          value={boolValue(prefs.htmlViewerNoSandbox)}
          onChange={value => setDockPrefs({ htmlViewerNoSandbox: value === 'on' })}
        />
      </SettingRow>
      <SettingRow title="自动展开 Jobs" description="新后台任务出现时打开 Jobs 面板（不抢焦点）。">
        <Segmented
          label="自动 Jobs"
          options={BOOL}
          value={boolValue(prefs.autoOpenJobs)}
          onChange={value => setDockPrefs({ autoOpenJobs: value === 'on' })}
        />
      </SettingRow>
    </SettingCard>
  )
}
