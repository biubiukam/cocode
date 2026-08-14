import { Button, Field, Input } from '@cocode/ui'
import type { ProviderCard } from '../../../runtime/providers/store.ts'

export function ProviderForm({
  card,
  draftKey,
  draftEndpoint,
  endpointOpen,
  busy,
  error,
  onDraftKey,
  onDraftEndpoint,
  onToggleEndpoint,
  onSave,
}: {
  card: ProviderCard
  draftKey: string
  draftEndpoint: string
  endpointOpen: boolean
  busy: boolean
  error?: string
  onDraftKey(value: string): void
  onDraftEndpoint(value: string): void
  onToggleEndpoint(): void
  onSave(): void
}) {
  const envLocked = card.credential?.writable === false
  const alreadySet = card.credential?.configured === true

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <p className="text-[13px] font-semibold">{card.displayName}</p>
      {error !== undefined && card.apiKeyEnv === undefined
        ? <p className="text-[12px] text-danger">{error}</p>
        : null}
      {card.apiKeyEnv === undefined
        ? <p className="text-[12px] text-muted-foreground">这个提供方不需要 Key。</p>
        : (
            <Field
              label="API Key"
              helper={alreadySet ? '已保存' : undefined}
              error={error}
            >
              <Input
                type="password"
                autoComplete="off"
                disabled={envLocked || busy}
                placeholder={alreadySet ? '••••••••' : '粘贴 Key'}
                value={draftKey}
                onChange={event => onDraftKey(event.target.value)}
              />
            </Field>
          )}
      <button type="button" className="self-start text-[11px] text-muted-foreground underline" onClick={onToggleEndpoint}>
        {endpointOpen ? '收起 endpoint' : '可选 endpoint'}
      </button>
      {endpointOpen
        ? (
            <Field label="Endpoint">
              <Input
                disabled={busy}
                value={draftEndpoint}
                placeholder={card.baseURL}
                onChange={event => onDraftEndpoint(event.target.value)}
              />
            </Field>
          )
        : null}
      {envLocked
        ? <p className="text-[12px] text-warning">已由环境提供，不能在这里覆盖。</p>
        : null}
      <div className="mt-auto">
        <Button variant="primary" disabled={busy || envLocked} onClick={onSave}>
          {busy ? '测试中…' : '测试并保存'}
        </Button>
      </div>
    </div>
  )
}
