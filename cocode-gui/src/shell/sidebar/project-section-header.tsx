/**
 * The divider between global sidebar actions and the project/task list.
 *
 * The trailing controls mirror Codex-style project chrome: add on the right,
 * display mode in an overflow menu beside it.
 */

import { Ellipsis, Plus } from 'lucide-react'
import {
  IconButton,
  SelectOption,
  SelectPopover,
  SelectPopoverLabel,
  SelectPopoverOptions,
  Tooltip,
  useSelectPopover,
} from '@cocode/ui'
import type { TaskListDisplay } from './task-list-display.ts'

const DISPLAY_OPTIONS = [
  { value: 'grouped', label: '按项目分组' },
  { value: 'flat', label: '列表显示' },
] as const satisfies readonly { value: TaskListDisplay; label: string }[]

export type ProjectSectionHeaderProps = {
  display: TaskListDisplay
  onDisplayChange(display: TaskListDisplay): void
  onAddProject(): void
}

export function ProjectSectionHeader({ display, onDisplayChange, onAddProject }: ProjectSectionHeaderProps) {
  const { open, toggle, close, shellRef } = useSelectPopover()

  return (
    <div className="flex min-h-[32px] items-center gap-1 px-3">
      <h2 className="subsection-title m-0 min-w-0 flex-1 truncate">项目</h2>
      <Tooltip content="添加项目">
        <IconButton size="xs" label="添加项目" onClick={onAddProject}>
          <Plus />
        </IconButton>
      </Tooltip>
      <div className="relative" ref={shellRef}>
        <IconButton
          size="xs"
          label="展示模式"
          aria-haspopup="listbox"
          aria-expanded={open}
          className={open ? 'bg-secondary' : undefined}
          onClick={toggle}
        >
          <Ellipsis />
        </IconButton>
        <SelectPopover open={open} label="展示模式" withHeader className="left-auto right-0 w-[168px]">
          <SelectPopoverLabel>展示模式</SelectPopoverLabel>
          <SelectPopoverOptions>
            {DISPLAY_OPTIONS.map(option => (
              <SelectOption
                key={option.value}
                selected={display === option.value}
                onClick={() => {
                  onDisplayChange(option.value)
                  close()
                }}
              >
                {option.label}
              </SelectOption>
            ))}
          </SelectPopoverOptions>
        </SelectPopover>
      </div>
    </div>
  )
}
