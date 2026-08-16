/** Git 面板专用图标，线条粗细与 16 视窗与 `icons.tsx` 保持一致。 */
import type { ReactNode, SVGProps } from "react"

type IconProps = SVGProps<SVGSVGElement> & { readonly size?: number }

function Icon({ size = 16, ...rest }: IconProps, children: ReactNode) {
  return <svg {...rest} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">{children}</svg>
}

export function RefreshIcon(props: IconProps) {
  return Icon(props, <><path d="M13 8a5 5 0 1 1-1.6-3.66" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><path d="M13 2.5V5h-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></>)
}

export function MoreIcon(props: IconProps) {
  return Icon(props, <><circle cx="3.5" cy="8" r="1.1" fill="currentColor" /><circle cx="8" cy="8" r="1.1" fill="currentColor" /><circle cx="12.5" cy="8" r="1.1" fill="currentColor" /></>)
}

export function SyncIcon(props: IconProps) {
  return Icon(props, <><path d="M2.75 7a5.25 5.25 0 0 1 8.9-2.6L13.25 6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" /><path d="M13.25 9a5.25 5.25 0 0 1-8.9 2.6L2.75 10" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" /><path d="M13.25 3.25V6h-2.6M2.75 12.75V10h2.6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" /></>)
}

/** 暂存：加号。 */
export function StageIcon(props: IconProps) {
  return Icon(props, <path d="M8 4v8M4 8h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />)
}

/** 取消暂存：减号。 */
export function UnstageIcon(props: IconProps) {
  return Icon(props, <path d="M4 8h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />)
}

/** 撤销更改：与 VS Code discard 同构的左弯箭头。 */
export function DiscardIcon(props: IconProps) {
  return Icon(props, <><path d="M5.25 4.75 2.75 7.25 5.25 9.75" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /><path d="M2.75 7.25h6.75a3.25 3.25 0 1 1 0 6.5H8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></>)
}

/** 打开文件：文档加外链角标。 */
export function OpenFileIcon(props: IconProps) {
  return Icon(props, <><path d="M8.75 2.5H4.25v11h7.5V5.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M8.75 2.5v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></>)
}

/** 分支：一次分叉，用于分支选择器的前导标记。 */
export function BranchIcon(props: IconProps) {
  return Icon(props, <><circle cx="4.5" cy="3.75" r="1.5" stroke="currentColor" strokeWidth="1.3" /><circle cx="4.5" cy="12.25" r="1.5" stroke="currentColor" strokeWidth="1.3" /><circle cx="11.5" cy="3.75" r="1.5" stroke="currentColor" strokeWidth="1.3" /><path d="M4.5 5.25v5.5M11.5 5.25v1a2.5 2.5 0 0 1-2.5 2.5H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></>)
}

/** 交给模型生成：一大一小两颗星芒。 */
export function SparkleIcon(props: IconProps) {
  return Icon(props, <><path d="M6.5 2.5 7.6 5.4 10.5 6.5 7.6 7.6 6.5 10.5 5.4 7.6 2.5 6.5 5.4 5.4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="m11.75 9.25.62 1.63 1.63.62-1.63.62-.62 1.63-.62-1.63-1.63-.62 1.63-.62z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" /></>)
}

/** 折叠指示，展开时由 CSS 旋转 90 度。 */
export function SectionChevron(props: IconProps) {
  return Icon(props, <path d="m6 4 4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />)
}
