import type { ReactNode, SVGProps } from "react"

type IconProps = SVGProps<SVGSVGElement> & { readonly size?: number }

function Icon(props: IconProps, children: ReactNode) {
  const { size = 16, ...rest } = props
  return <svg {...rest} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">{children}</svg>
}

export function PanelRightIcon(props: IconProps) {
  return Icon(props, <><rect x="1.5" y="2" width="13" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5" /><rect x="10.5" y="3.25" width="2.75" height="9.5" rx="1" fill="currentColor" /></>)
}

export function PanelBottomIcon(props: IconProps) {
  return Icon(props, <><rect x="1.5" y="2" width="13" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5" /><rect x="3.25" y="10" width="9.5" height="2.75" rx="1" fill="currentColor" /></>)
}

export function CloseIcon(props: IconProps) {
  return Icon(props, <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />)
}

export function PlusIcon(props: IconProps) {
  return Icon(props, <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />)
}

export function MoveIcon(props: IconProps) {
  return Icon(props, <><path d="m5 3-2 2 2 2M11 13l2-2-2-2M3 5h7M13 11H6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /></>)
}

export function FilesIcon(props: IconProps) {
  return Icon(props, <><path d="M3 3.5h6l2 2v7H3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M5 3.5V2.5h6l2 2v7h-2" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></>)
}

export function GitIcon(props: IconProps) {
  return Icon(props, <><circle cx="4" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.3" /><circle cx="12" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.3" /><circle cx="8" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.3" /><path d="M4 5.5v2a2 2 0 0 0 2 2h2M12 5.5v2a2 2 0 0 1-2 2H8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></>)
}

export function TerminalIcon(props: IconProps) {
  return Icon(props, <><rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" /><path d="m4.5 6.25 2.25 1.75L4.5 9.75M8.5 10.4h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></>)
}

export function SearchIcon(props: IconProps) {
  return Icon(props, <><circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.4" /><path d="m10.2 10.2 3.3 3.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></>)
}

export function ChevronIcon(props: IconProps) {
  return Icon(props, <path d="m6 4 4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />)
}

export function FolderGlyph(props: IconProps) {
  return Icon(props, <path d="M2.5 4.25h4.1l1.2 1.35H13.5v6.9H2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />)
}

export function FileGlyph(props: IconProps) {
  return Icon(props, <path d="M4.25 2.5h5.1L11.75 5v8.5h-7.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />)
}
