import { Button } from '@cocode/ui'

export function DeviceLogin({
  userCode,
  verificationUri,
}: {
  userCode: string
  verificationUri: string
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-start gap-3">
      <p className="text-[13px] text-muted-foreground">在浏览器打开下面的地址，输入代码完成登录。</p>
      <p className="font-mono text-[22px] font-semibold tracking-[0.12em]">{userCode}</p>
      <a href={verificationUri} target="_blank" rel="noreferrer" className="text-[12px] text-accent-ink underline">
        {verificationUri}
      </a>
      <Button variant="primary" asChild>
        <a href={verificationUri} target="_blank" rel="noreferrer">打开浏览器</a>
      </Button>
    </div>
  )
}
