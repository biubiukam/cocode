/** How the sidebar lists tasks under the projects section. */
export type TaskListDisplay = 'grouped' | 'flat'

const STORAGE_KEY = 'cocode.sidebar.taskListDisplay'

export function loadTaskListDisplay(): TaskListDisplay {
  try {
    return globalThis.localStorage.getItem(STORAGE_KEY) === 'flat' ? 'flat' : 'grouped'
  }
  catch {
    return 'grouped'
  }
}

export function saveTaskListDisplay(display: TaskListDisplay): void {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, display)
  }
  catch {
    // Private-mode storage denial: the preference simply won't persist.
  }
}
