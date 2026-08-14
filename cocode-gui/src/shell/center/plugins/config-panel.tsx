/**
 * Hand-written cards for the three host-plane namespaces the page owns.
 *
 * A missing namespace renders nothing. Drafts stay here so a Host refresh
 * cannot overwrite text the user has not saved.
 */

import { useState } from 'react'
import { Badge, Button, EmptyState, Field, Input, Skeleton } from '@cocode/ui'
import { Blocks } from 'lucide-react'
import type { SettingsPathOp } from '@cocode/gui-connection'
import type { PluginSection, PluginSettingsNamespace } from '../../../runtime/plugin-settings/store.ts'
import { usePluginSettings, usePluginSettingsStore } from '../../runtime-context.tsx'
import { PluginCard, type PluginCardShell } from './plugin-card.tsx'

type Staged = { text: string; clear: boolean }

function formatNumber(value: unknown): string {
  return typeof value === 'number' ? String(value) : ''
}

function formatText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function parseNumber(text: string): { kind: 'set'; value: number } | { kind: 'clear' } | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return { kind: 'clear' }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? { kind: 'set', value: parsed } : undefined
}

function userHas(section: PluginSection, field: string): boolean {
  return section.user !== undefined && Object.hasOwn(section.user, field)
}

function NumberField({
  label,
  helper,
  section,
  field,
  staged,
  writable,
  onEdit,
  onReset,
}: {
  label: string
  helper: string
  section: PluginSection
  field: string
  staged: Staged | undefined
  writable: boolean
  onEdit(text: string): void
  onReset(): void
}) {
  const parsed = staged === undefined ? undefined : staged.clear ? { kind: 'clear' as const } : parseNumber(staged.text)
  const invalid = staged !== undefined && !staged.clear && parsed === undefined
  const overridden = staged === undefined ? userHas(section, field) : parsed?.kind === 'set'
  const text = staged?.text ?? formatNumber(section.value[field])
  return (
    <Field label={label} helper={invalid ? undefined : helper} error={invalid ? '请填数字；留空表示使用默认值。' : undefined}>
      <Input
        inputMode="numeric"
        value={text}
        disabled={!writable}
        aria-invalid={invalid}
        onChange={event => onEdit(event.target.value)}
      />
      {overridden
        ? (
            <div className="flex items-center gap-2">
              <Badge>已覆盖</Badge>
              <Button size="xs" variant="ghost" disabled={!writable} onClick={onReset}>恢复默认</Button>
            </div>
          )
        : null}
    </Field>
  )
}

function TextField({
  label,
  helper,
  section,
  field,
  staged,
  writable,
  onEdit,
  onReset,
}: {
  label: string
  helper: string
  section: PluginSection
  field: string
  staged: Staged | undefined
  writable: boolean
  onEdit(text: string): void
  onReset(): void
}) {
  const overridden = staged === undefined ? userHas(section, field) : staged.text.trim() !== ''
  const text = staged?.text ?? formatText(section.value[field])
  return (
    <Field label={label} helper={helper}>
      <Input value={text} disabled={!writable} onChange={event => onEdit(event.target.value)} />
      {overridden
        ? (
            <div className="flex items-center gap-2">
              <Badge>已覆盖</Badge>
              <Button size="xs" variant="ghost" disabled={!writable} onClick={onReset}>恢复默认</Button>
            </div>
          )
        : null}
    </Field>
  )
}

function planNumber(section: PluginSection, field: string, staged: Staged | undefined): SettingsPathOp | 'invalid' | undefined {
  if (staged === undefined) return undefined
  if (staged.clear) return userHas(section, field) ? { op: 'unset', path: [field] } : undefined
  if (staged.text === formatNumber(section.value[field])) return undefined
  const parsed = parseNumber(staged.text)
  if (parsed === undefined) return 'invalid'
  if (parsed.kind === 'clear') return userHas(section, field) ? { op: 'unset', path: [field] } : undefined
  return { op: 'set', path: [field], value: parsed.value }
}

function planText(section: PluginSection, field: string, staged: Staged | undefined): SettingsPathOp | undefined {
  if (staged === undefined) return undefined
  if (staged.clear || staged.text.trim() === '') {
    return userHas(section, field) ? { op: 'unset', path: [field] } : undefined
  }
  if (staged.text.trim() === formatText(section.value[field])) return undefined
  return { op: 'set', path: [field], value: staged.text.trim() }
}

function useCardOpen() {
  const [open, setOpen] = useState(false)
  return { open, toggle: () => setOpen(current => !current) }
}

function ShellCard({ section, writable }: { section: PluginSection; writable: boolean }) {
  const pluginSettings = usePluginSettingsStore()
  const disclosure = useCardOpen()
  const [timeoutMs, setTimeoutMs] = useState<Staged>()
  const [maxOutputBytes, setMaxOutputBytes] = useState<Staged>()
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const planned = [planNumber(section, 'timeoutMs', timeoutMs), planNumber(section, 'maxOutputBytes', maxOutputBytes)]
  const state: PluginCardShell = {
    writable,
    dirty: planned.some(item => item !== undefined),
    invalid: planned.includes('invalid'),
    saving,
    failed,
  }

  const discard = () => {
    setTimeoutMs(undefined)
    setMaxOutputBytes(undefined)
    setFailed(false)
  }

  const save = async () => {
    const ops = planned.filter((item): item is SettingsPathOp => item !== undefined && item !== 'invalid')
    if (ops.length === 0 || state.invalid || saving) return
    setSaving(true)
    setFailed(false)
    const ok = await pluginSettings.mutate(section.ns, ops)
    setSaving(false)
    if (ok) discard()
    else setFailed(true)
  }

  return (
    <PluginCard
      title="终端"
      description="限制 agent 运行的每一条命令。"
      state={state}
      open={disclosure.open}
      onToggle={disclosure.toggle}
      onSave={() => { void save() }}
      onDiscard={discard}
    >
      <NumberField
        label="命令超时（毫秒）"
        helper="单条命令允许运行多久，超时即终止。"
        section={section}
        field="timeoutMs"
        staged={timeoutMs}
        writable={writable}
        onEdit={text => { setTimeoutMs({ text, clear: false }); setFailed(false) }}
        onReset={() => { setTimeoutMs({ text: formatNumber(section.base?.timeoutMs), clear: true }); setFailed(false) }}
      />
      <NumberField
        label="单流输出上限（字节）"
        helper="超出部分会转存到临时文件，而不是被丢弃。"
        section={section}
        field="maxOutputBytes"
        staged={maxOutputBytes}
        writable={writable}
        onEdit={text => { setMaxOutputBytes({ text, clear: false }); setFailed(false) }}
        onReset={() => { setMaxOutputBytes({ text: formatNumber(section.base?.maxOutputBytes), clear: true }); setFailed(false) }}
      />
    </PluginCard>
  )
}

function AgentLoopCard({ section, writable }: { section: PluginSection; writable: boolean }) {
  const pluginSettings = usePluginSettingsStore()
  const disclosure = useCardOpen()
  const [maxParallel, setMaxParallel] = useState<Staged>()
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const planned = planNumber(section, 'maxParallelToolCalls', maxParallel)
  const state: PluginCardShell = {
    writable,
    dirty: planned !== undefined,
    invalid: planned === 'invalid',
    saving,
    failed,
  }

  const discard = () => {
    setMaxParallel(undefined)
    setFailed(false)
  }

  const save = async () => {
    if (planned === undefined || planned === 'invalid' || saving) return
    setSaving(true)
    setFailed(false)
    const ok = await pluginSettings.mutate(section.ns, [planned])
    setSaving(false)
    if (ok) discard()
    else setFailed(true)
  }

  return (
    <PluginCard
      title="Agent 循环"
      description="Agent 如何派发工具调用。"
      state={state}
      open={disclosure.open}
      onToggle={disclosure.toggle}
      onSave={() => { void save() }}
      onDiscard={discard}
    >
      <NumberField
        label="并行工具调用数"
        helper="同一步内最多同时运行多少个可并行的调用。"
        section={section}
        field="maxParallelToolCalls"
        staged={maxParallel}
        writable={writable}
        onEdit={text => { setMaxParallel({ text, clear: false }); setFailed(false) }}
        onReset={() => { setMaxParallel({ text: formatNumber(section.base?.maxParallelToolCalls), clear: true }); setFailed(false) }}
      />
    </PluginCard>
  )
}

function WebSearchCard({ section, writable }: { section: PluginSection; writable: boolean }) {
  const pluginSettings = usePluginSettingsStore()
  const snapshot = usePluginSettings()
  const disclosure = useCardOpen()
  const [baseURL, setBaseURL] = useState<Staged>()
  const [maxUses, setMaxUses] = useState<Staged>()
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const plannedText = planText(section, 'baseURL', baseURL)
  const plannedNumber = planNumber(section, 'maxUses', maxUses)
  const keyDirty = apiKey.trim() !== ''
  const state: PluginCardShell = {
    writable,
    dirty: plannedText !== undefined || plannedNumber !== undefined || keyDirty,
    invalid: plannedNumber === 'invalid',
    saving,
    failed,
  }

  const discard = () => {
    setBaseURL(undefined)
    setMaxUses(undefined)
    setApiKey('')
    setFailed(false)
  }

  const save = async () => {
    if (state.invalid || saving) return
    const ops = [plannedText, plannedNumber].filter((item): item is SettingsPathOp => item !== undefined && item !== 'invalid')
    setSaving(true)
    setFailed(false)
    const settingsOk = ops.length === 0 ? true : await pluginSettings.mutate(section.ns, ops)
    const keyOk = await pluginSettings.writeCredential(apiKey)
    setSaving(false)
    if (settingsOk && keyOk) discard()
    else setFailed(true)
  }

  const keyWritable = writable && snapshot.credential.writable

  return (
    <PluginCard
      title="网页搜索"
      description="DeepSeek 搜索提供方。"
      state={state}
      open={disclosure.open}
      onToggle={disclosure.toggle}
      onSave={() => { void save() }}
      onDiscard={discard}
    >
      <Field
        label="API Key"
        helper={snapshot.credential.configured ? '已配置密钥。不写入设置文件。留空表示保持当前密钥。' : '未配置密钥；配置之前搜索不可用。留空表示保持当前密钥。'}
      >
        <Input
          type="password"
          autoComplete="off"
          value={apiKey}
          disabled={!keyWritable}
          placeholder={snapshot.credential.configured ? '已配置' : undefined}
          onChange={event => { setApiKey(event.target.value); setFailed(false) }}
        />
      </Field>
      <TextField
        label="接口地址"
        helper="留空则使用提供方默认地址。"
        section={section}
        field="baseURL"
        staged={baseURL}
        writable={writable}
        onEdit={text => { setBaseURL({ text, clear: false }); setFailed(false) }}
        onReset={() => { setBaseURL({ text: formatText(section.base?.baseURL), clear: true }); setFailed(false) }}
      />
      <NumberField
        label="单次请求最多搜索次数"
        helper="一次请求在必须作答前最多可以搜索多少次。"
        section={section}
        field="maxUses"
        staged={maxUses}
        writable={writable}
        onEdit={text => { setMaxUses({ text, clear: false }); setFailed(false) }}
        onReset={() => { setMaxUses({ text: formatNumber(section.base?.maxUses), clear: true }); setFailed(false) }}
      />
    </PluginCard>
  )
}

const CARD_ORDER: PluginSettingsNamespace[] = ['shell', 'agent-loop', 'web-search-deepseek']

export function ConfigPanel() {
  const snapshot = usePluginSettings()

  if (snapshot.settingsStatus === 'idle' || snapshot.settingsStatus === 'loading') {
    return (
      <ul className="flex flex-col gap-2">
        <li><Skeleton className="h-[68px] rounded-lg" /></li>
        <li><Skeleton className="h-[68px] rounded-lg" /></li>
        <li><Skeleton className="h-[68px] rounded-lg" /></li>
      </ul>
    )
  }

  if (snapshot.settingsStatus === 'error') {
    return (
      <EmptyState
        icon={Blocks}
        title="暂时无法读取插件设置"
        description="本机 harness 没有返回插件配置。稍后重试，或确认当前连接的是 loopback。"
      />
    )
  }

  const cards = CARD_ORDER.flatMap(ns => {
    const section = snapshot.sections[ns]
    if (section === undefined) return []
    if (ns === 'shell') return [<ShellCard key={ns} section={section} writable={snapshot.writable} />]
    if (ns === 'agent-loop') return [<AgentLoopCard key={ns} section={section} writable={snapshot.writable} />]
    return [<WebSearchCard key={ns} section={section} writable={snapshot.writable} />]
  })

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={Blocks}
        title="本部署没有开放任何插件设置"
        description="只有被 Host 白名单暴露的宿主平面命名空间才会出现在这里。"
      />
    )
  }

  return <ul className="flex flex-col gap-2">{cards}</ul>
}
