import type { WorkbenchPanelDescriptor } from "./model.ts"
import { FilesPanel } from "./files-panel.tsx"
import { PreviewPanel } from "./preview-panel.tsx"
import { JobsPanel, SubagentsPanel } from "./panels.tsx"
import { BrowserPanel } from "./browser/BrowserPanel.tsx"
import { GitPanel } from "./git-panel.tsx"
import { TerminalPanel } from "./terminal-panel.tsx"
import { BrowserIcon, FilesIcon, GitIcon, JobsIcon, PreviewIcon, SubagentsIcon, TerminalIcon } from "./icons.tsx"
import { t } from "./locales.ts"

/**
 * 标题以 thunk 形式给出：面板注册只发生一次，而语言可以随时切换，读取时机
 * 必须晚于注册时机才能跟上当前语言。
 */
export function builtInPanels(): readonly WorkbenchPanelDescriptor[] {
  return [
    { id: "files", title: () => t("panel.files"), icon: <FilesIcon size={15} />, defaultDock: "right", singleton: true, order: 10, render: props => <FilesPanel {...props} /> },
    { id: "preview", title: () => t("panel.preview"), icon: <PreviewIcon size={15} />, defaultDock: "right", addable: false, order: 20, render: props => <PreviewPanel {...props} /> },
    { id: "git", title: () => t("panel.git"), icon: <GitIcon size={15} />, defaultDock: "right", singleton: true, order: 30, render: props => <GitPanel {...props} /> },
    { id: "jobs", title: () => t("panel.jobs"), icon: <JobsIcon size={15} />, defaultDock: "bottom", singleton: true, order: 40, render: props => <JobsPanel {...props} /> },
    { id: "terminal", title: () => t("panel.terminal"), icon: <TerminalIcon size={15} />, defaultDock: "bottom", order: 50, render: props => <TerminalPanel {...props} /> },
    { id: "browser", title: () => t("panel.browser"), icon: <BrowserIcon size={15} />, defaultDock: "bottom", order: 60, render: props => <BrowserPanel {...props} /> },
    { id: "subagents", title: () => t("panel.subagents"), icon: <SubagentsIcon size={15} />, defaultDock: "right", singleton: true, order: 70, render: props => <SubagentsPanel {...props} /> },
  ]
}
