import { useState } from 'react'
import { loadTaskListDisplay, saveTaskListDisplay, type TaskListDisplay } from './task-list-display.ts'

export function useTaskListDisplay(): readonly [TaskListDisplay, (display: TaskListDisplay) => void] {
  const [display, setDisplay] = useState<TaskListDisplay>(() => loadTaskListDisplay())
  const update = (next: TaskListDisplay) => {
    setDisplay(next)
    saveTaskListDisplay(next)
  }
  return [display, update] as const
}
