import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { EmptyState, Skeleton, cn } from '@cocode/ui'
import type { FileViewerProps } from '../../panels/preview/viewers.ts'

type SheetTable = { name: string; rows: string[][] }

function bytesOf(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function XlsxViewer({ base64, byteLength }: FileViewerProps) {
  const [sheets, setSheets] = useState<SheetTable[]>([])
  const [active, setActive] = useState(0)
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (base64 === undefined) {
      setLoading(false)
      setError('缺少文件字节')
      return
    }
    let cancelled = false
    setLoading(true)
    void import('xlsx').then(XLSX => {
      if (cancelled) return
      try {
        const workbook = XLSX.read(bytesOf(base64), { type: 'array' })
        const next = workbook.SheetNames.map(name => {
          const sheet = workbook.Sheets[name]
          const rows = sheet === undefined ? [] : XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' })
          return { name, rows: rows.map(row => row.map(cell => String(cell ?? ''))) }
        })
        setSheets(next)
        setActive(0)
        setError(undefined)
      }
      catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err))
      }
      finally {
        if (!cancelled) setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [base64])

  if (base64 === undefined) {
    return (
      <EmptyState
        icon={FileText}
        title="无法预览 Excel"
        description={`缺少字节内容（${String(byteLength ?? 0)} bytes）。`}
        className="m-4"
      />
    )
  }
  if (loading) {
    return <div className="flex flex-col gap-2 p-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-4" />)}</div>
  }
  if (error !== undefined) {
    return <EmptyState icon={FileText} title="Excel 解析失败" description={error} className="m-4" />
  }
  const sheet = sheets[active]
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
        {sheets.map((entry, index) => (
          <button
            key={entry.name}
            type="button"
            onClick={() => setActive(index)}
            className={cn(
              'rounded-sm px-2 py-1 text-[11px]',
              index === active ? 'bg-secondary font-semibold text-foreground' : 'text-muted-foreground hover:bg-surface-sunken',
            )}
          >
            {entry.name}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {sheet === undefined
          ? <EmptyState icon={FileText} title="空工作簿" description="没有可显示的工作表。" />
          : (
              <table className="min-w-full border-collapse text-left font-mono text-[11px]">
                <tbody>
                  {sheet.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-border">
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="whitespace-pre px-2 py-1 text-foreground">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
      </div>
      <p className="shrink-0 border-t border-border px-3 py-1 text-[10px] text-muted-foreground">
        社区版解析不保留单元格样式。
      </p>
    </div>
  )
}
