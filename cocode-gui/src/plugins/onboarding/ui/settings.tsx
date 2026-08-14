import { Button } from '@cocode/ui'

export function OnboardingSettings({ onReplay }: { onReplay?: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <p className="text-[13px] font-medium">首次引导</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">再走一遍模型来源设置。</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => { onReplay?.() }}>再走一遍</Button>
      </div>
    </div>
  )
}
