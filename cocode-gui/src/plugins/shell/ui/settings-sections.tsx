import { ExternalLink } from 'lucide-react'
import { Badge, Button, Segmented } from '@cocode/ui'
import { isLoopbackOrigin } from '../../../host/bridge.ts'
import { useConnection, useConnectionService, useHost, useShortcuts } from '../../../shell/runtime-context.tsx'
import { useThemeSetting } from '../../../shell/theme.tsx'

const THEME_OPTIONS = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
] as const

function SettingCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-surface px-4 py-1">{children}</div>
}

function SettingRow({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
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

export function AppearanceSettings() {
  const [themeSetting, setThemeSetting] = useThemeSetting()
  return (
    <SettingCard>
      <SettingRow title="主题" description="选择界面配色方案。">
        <Segmented options={THEME_OPTIONS} value={themeSetting} onChange={setThemeSetting} label="主题" />
      </SettingRow>
    </SettingCard>
  )
}

export function ConnectionSettings() {
  const host = useHost()
  const connection = useConnection()
  return (
    <SettingCard>
      <SettingRow title="载体" description="当前运行环境。">
        <Badge tone="neutral">{host.platform === 'electron' ? '桌面' : '浏览器'}</Badge>
      </SettingRow>
      <SettingRow title="harness 地址" description="Agent 运行时 HTTP 端点。">
        <span className="max-w-[220px] truncate font-mono text-[11px] text-secondary-foreground">
          {connection.baseUrl === '' ? '同源' : connection.baseUrl}
        </span>
      </SettingRow>
      <SettingRow title="harness 版本">
        <span className="font-mono text-[11px] text-secondary-foreground">{connection.description?.version ?? '—'}</span>
      </SettingRow>
      <SettingRow title="协议版本" description="wire 协议是否已通过握手校验。">
        {connection.protocolUnverified
          ? <Badge tone="warning">未声明</Badge>
          : <Badge tone="success">已校验</Badge>}
      </SettingRow>
    </SettingCard>
  )
}

export function ConfigSettings() {
  const connection = useConnection()
  const service = useConnectionService()
  const privileged = isLoopbackOrigin(connection.baseUrl)
  return (
    <>
      <SettingCard>
        <SettingRow title="harness 配置文件" description="在编辑器中打开 harness 侧配置文档。">
          <Button
            size="sm"
            variant="secondary"
            disabled={!privileged}
            onClick={() => { void service.activeTransport?.call('settings.openDocument', {}) }}
          >
            <ExternalLink />
            打开
          </Button>
        </SettingRow>
      </SettingCard>
      {privileged
        ? null
        : (
            <p className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--warning)_28%,var(--border))] bg-warning-soft p-3 text-[12px] leading-[1.5] text-warning">
              当前连接的不是本机 harness。设置与凭证方法被 harness 限定在 loopback 同源，远程连接下不可用。
            </p>
          )}
    </>
  )
}

export function ShortcutsSettings() {
  const shortcuts = useShortcuts().list()
  return (
    <SettingCard>
      {shortcuts.map(({ definition, combo, label }) => (
        <SettingRow key={definition.id} title={definition.description}>
          <div className="flex items-center gap-2">
            <kbd className="rounded-[4px] border border-border bg-surface-sunken px-1.5 py-px font-mono text-[11px]">{label}</kbd>
            {definition.browserCombo !== false && definition.browserCombo !== undefined && combo === definition.browserCombo
              ? <span className="text-[10px] text-muted-foreground">浏览器占用了原组合</span>
              : null}
          </div>
        </SettingRow>
      ))}
    </SettingCard>
  )
}
