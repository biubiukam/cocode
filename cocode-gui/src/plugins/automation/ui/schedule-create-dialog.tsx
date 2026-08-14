import { useEffect, useMemo, useState } from 'react'
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogDescription, DialogTitle, Field, Input, Segmented, Select } from '@cocode/ui'
import type { SessionId } from '@cocode/gui-connection'
import { useAutomation, useAutomationSnapshot, useSessionDirectory, useSessions } from '../../../shell/runtime-context.tsx'
import { useToast } from '../../../shell/overlay/toast.tsx'
import type { ScheduleCreateInput } from '../store/types.ts'

type RuleKind = 'after' | 'at' | 'every'

const RULES = [
  { value: 'after', label: '延迟' },
  { value: 'at', label: '指定时间' },
  { value: 'every', label: '固定间隔' },
] as const satisfies readonly { value: RuleKind; label: string }[]

const AFTER_PRESETS = [
  { value: '60', label: '1 分钟' },
  { value: '300', label: '5 分钟' },
  { value: '900', label: '15 分钟' },
  { value: '3600', label: '1 小时' },
] as const

const EVERY_PRESETS = [
  { value: '300', label: '5 分钟' },
  { value: '900', label: '15 分钟' },
  { value: '1800', label: '30 分钟' },
  { value: '3600', label: '1 小时' },
] as const

function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  }
  catch {
    return 'UTC'
  }
}

function defaultDateTime(): { date: string; time: string } {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

function applyDraft(
  draft: ScheduleCreateInput | undefined,
  fallbackSession: SessionId | '',
): {
  sessionId: SessionId | ''
  prompt: string
  rule: RuleKind
  afterPreset: string
  everyPreset: string
  date: string
  time: string
} {
  const next = defaultDateTime()
  if (draft === undefined) {
    return {
      sessionId: fallbackSession,
      prompt: '',
      rule: 'after',
      afterPreset: '300',
      everyPreset: '900',
      date: next.date,
      time: next.time,
    }
  }
  if (draft.afterSeconds !== undefined) {
    return {
      sessionId: draft.sessionId,
      prompt: draft.prompt,
      rule: 'after',
      afterPreset: String(draft.afterSeconds),
      everyPreset: '900',
      date: next.date,
      time: next.time,
    }
  }
  if (draft.everySeconds !== undefined) {
    return {
      sessionId: draft.sessionId,
      prompt: draft.prompt,
      rule: 'every',
      afterPreset: '300',
      everyPreset: String(draft.everySeconds),
      date: next.date,
      time: next.time,
    }
  }
  if (draft.at !== undefined) {
    return {
      sessionId: draft.sessionId,
      prompt: draft.prompt,
      rule: 'at',
      afterPreset: '300',
      everyPreset: '900',
      date: draft.at.date,
      time: draft.at.time,
    }
  }
  return {
    sessionId: draft.sessionId,
    prompt: draft.prompt,
    rule: 'after',
    afterPreset: '300',
    everyPreset: '900',
    date: next.date,
    time: next.time,
  }
}

export function ScheduleCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  onCreated(): void
}) {
  const automation = useAutomation()
  const snap = useAutomationSnapshot()
  const sessions = useSessions()
  const directory = useSessionDirectory()
  const toast = useToast()
  const [sessionId, setSessionId] = useState<SessionId | ''>('')
  const [prompt, setPrompt] = useState('')
  const [rule, setRule] = useState<RuleKind>('after')
  const [afterPreset, setAfterPreset] = useState('300')
  const [everyPreset, setEveryPreset] = useState('900')
  const [date, setDate] = useState(defaultDateTime().date)
  const [time, setTime] = useState(defaultDateTime().time)
  const [busy, setBusy] = useState(false)

  const sessionOptions = useMemo(() => {
    return sessions.listVisibleSummaries().map(summary => {
      const title = sessions.session(summary.sessionId).getSnapshot().title
      return {
        value: summary.sessionId,
        label: title?.trim() || summary.cwd || summary.sessionId.slice(0, 8),
      }
    })
  }, [sessions, directory])

  useEffect(() => {
    if (!open) return
    const fallback = directory.activeSessionId ?? sessionOptions[0]?.value ?? ''
    const seeded = applyDraft(snap.pendingDraft, fallback)
    setSessionId(seeded.sessionId)
    setPrompt(seeded.prompt)
    setRule(seeded.rule)
    setAfterPreset(seeded.afterPreset)
    setEveryPreset(seeded.everyPreset)
    setDate(seeded.date)
    setTime(seeded.time)
  }, [open, directory.activeSessionId, sessionOptions, snap.pendingDraft])

  const afterOptions = useMemo(() => {
    const base = [...AFTER_PRESETS] as { value: string; label: string }[]
    if (!base.some(item => item.value === afterPreset)) {
      base.push({ value: afterPreset, label: `${afterPreset} 秒` })
    }
    return base
  }, [afterPreset])

  const everyOptions = useMemo(() => {
    const base = [...EVERY_PRESETS] as { value: string; label: string }[]
    if (!base.some(item => item.value === everyPreset)) {
      base.push({ value: everyPreset, label: `${everyPreset} 秒` })
    }
    return base
  }, [everyPreset])

  const submit = async () => {
    if (sessionId === '' || prompt.trim() === '') return
    setBusy(true)
    const error = await automation.createSchedule({
      sessionId,
      prompt: prompt.trim(),
      ...(rule === 'after' ? { afterSeconds: Number(afterPreset) } : {}),
      ...(rule === 'every' ? { everySeconds: Number(everyPreset) } : {}),
      ...(rule === 'at' ? { at: { date, time, timeZone: localZone() } } : {}),
    })
    setBusy(false)
    if (error !== undefined) {
      toast.push('warning', error)
      return
    }
    onCreated()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) automation.clearPendingCreate()
        onOpenChange(next)
      }}
    >
      <DialogContent className="w-[min(520px,calc(100vw-48px))]">
        <DialogBody>
          <DialogTitle>新建定时提醒</DialogTitle>
          <DialogDescription>
            提醒只在目标会话内投递。创建可能短暂恢复冷会话（与 Goal 变更相同）。
          </DialogDescription>

          <div className="mt-4 flex flex-col gap-3">
            <Select
              label="目标会话"
              options={sessionOptions.length === 0 ? [{ value: '' as const, label: '没有可用会话' }] : sessionOptions}
              value={sessionId}
              onChange={setSessionId}
            />
            <Field label="提醒内容">
              <Input
                value={prompt}
                onChange={event => setPrompt(event.target.value)}
                placeholder="到期后推进会话的内容"
              />
            </Field>
            <Segmented options={RULES} value={rule} onChange={value => setRule(value as RuleKind)} label="规则" />
            {rule === 'after'
              ? <Select label="延迟" options={afterOptions} value={afterPreset} onChange={setAfterPreset} />
              : null}
            {rule === 'every'
              ? (
                  <Select
                    label="间隔"
                    helper="最短 5 分钟"
                    options={everyOptions}
                    value={everyPreset}
                    onChange={setEveryPreset}
                  />
                )
              : null}
            {rule === 'at'
              ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="日期">
                      <Input type="date" value={date} onChange={event => setDate(event.target.value)} />
                    </Field>
                    <Field label="时间">
                      <Input type="time" value={time} onChange={event => setTime(event.target.value)} />
                    </Field>
                  </div>
                )
              : null}
          </div>
        </DialogBody>
        <DialogActions>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              automation.clearPendingCreate()
              onOpenChange(false)
            }}
          >
            取消
          </Button>
          <Button
            variant="primary"
            disabled={busy || sessionId === '' || prompt.trim() === ''}
            onClick={() => { void submit() }}
          >
            创建
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  )
}
