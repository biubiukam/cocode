/**
 * Host-plane plugin settings and the read-only Loader inventory.
 *
 * This is Cocode's own page for the harness Settings → 插件 surface. It does
 * not embed that UI and does not invent install/enable writes.
 */

import { useEffect, useState } from 'react'
import { Blocks } from 'lucide-react'
import { EmptyState, Segmented } from '@cocode/ui'
import { isLoopbackOrigin } from '../../host/bridge.ts'
import { focusZoneAttribute } from '../../runtime/index.ts'
import { useConnection, useLayout, useLayoutActions, usePluginSettingsStore } from '../runtime-context.tsx'
import { CenterHeader } from './center-header.tsx'
import { ConfigPanel } from './plugins/config-panel.tsx'
import { InventoryPanel } from './plugins/inventory-panel.tsx'

const LOOPBACK_HINT = '当前连接的不是本机 harness。设置与凭证方法被 harness 限定在 loopback 同源，远程连接下不可用——这不是 Cocode 的限制，改用本机运行或经隧道同源访问即可恢复。'

type PluginsTab = 'config' | 'list'

const TABS = [
  { value: 'config', label: '插件配置' },
  { value: 'list', label: '插件列表' },
] as const satisfies readonly { value: PluginsTab; label: string }[]

export function PluginsPage() {
  const pluginSettings = usePluginSettingsStore()
  const connection = useConnection()
  const actions = useLayoutActions()
  const sidebar = useLayout(layout => layout.sidebar)
  const sidebarDrawerOpen = useLayout(layout => layout.sidebarDrawerOpen)
  const sidebarDrawer = useLayout(layout => layout.sidebarDrawer)
  const rightSize = useLayout(layout => layout.right.size)
  const bottomSize = useLayout(layout => layout.bottom.size)
  const [tab, setTab] = useState<PluginsTab>('config')
  const [listVisited, setListVisited] = useState(false)

  const sidebarOpen = sidebarDrawer ? sidebarDrawerOpen : sidebar > 0
  const showSidebarToggleInCenter = sidebarDrawer ? !sidebarDrawerOpen : sidebar === 0
  const privileged = isLoopbackOrigin(connection.baseUrl)

  useEffect(() => {
    if (connection.phase !== 'ready' || !privileged) return
    setTab('config')
    setListVisited(false)
    void pluginSettings.loadSettings()
  }, [pluginSettings, privileged, connection.phase, connection.generation])

  useEffect(() => {
    return () => { pluginSettings.reset() }
  }, [pluginSettings])

  const selectTab = (next: PluginsTab) => {
    if (next === 'list') setListVisited(true)
    setTab(next)
  }

  return (
    <section
      {...focusZoneAttribute('conversation')}
      className="flex h-full min-h-0 min-w-0 flex-col bg-background"
    >
      <CenterHeader
        title="插件"
        showSidebarToggle={showSidebarToggleInCenter}
        sidebarOpen={sidebarOpen}
        rightOpen={rightSize > 0}
        bottomOpen={bottomSize > 0}
        onToggleSidebar={actions.toggleSidebar}
        onToggleRight={() => actions.toggleDock('right')}
        onToggleBottom={() => actions.toggleDock('bottom')}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[960px] px-6 py-6">
          {privileged
            ? (
                <>
                  <p className="text-[12px] leading-[1.5] text-muted-foreground">配置和查看本部署已安装的插件。</p>
                  <div className="mt-4">
                    <Segmented options={TABS} value={tab} onChange={selectTab} label="插件视图" />
                  </div>
                  <div className="mt-5" key={connection.generation}>
                    <div hidden={tab !== 'config'}>
                      <ConfigPanel />
                    </div>
                    {listVisited
                      ? (
                          <div hidden={tab !== 'list'}>
                            <InventoryPanel />
                          </div>
                        )
                      : null}
                  </div>
                </>
              )
            : (
                <EmptyState
                  icon={Blocks}
                  title="需要本机连接"
                  description={LOOPBACK_HINT}
                />
              )}
        </div>
      </div>
    </section>
  )
}
