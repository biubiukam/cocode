import { PanelBottom, PanelRight } from 'lucide-react'
import { IconButton, Tooltip } from '@cocode/ui'

export function HeaderDockActions(props: {
  rightOpen: boolean
  bottomOpen: boolean
  onToggleRight(): void
  onToggleBottom(): void
}) {
  return (
    <>
      <Tooltip content="开合底部 Dock">
        <IconButton size="md" label="开合底部 Dock" aria-pressed={props.bottomOpen} aria-controls="dock-panel-bottom" onClick={props.onToggleBottom}>
          <PanelBottom />
        </IconButton>
      </Tooltip>
      <Tooltip content="开合右侧 Dock">
        <IconButton size="md" label="开合右侧 Dock" aria-pressed={props.rightOpen} aria-controls="dock-panel-right" onClick={props.onToggleRight}>
          <PanelRight />
        </IconButton>
      </Tooltip>
    </>
  )
}
