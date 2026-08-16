import { Tooltip } from "@deepseek-ai/dsh-client-ui-primitives"
import type { WorkbenchController } from "./controller.ts"
import css from "./workbench.module.css"
import { PanelBottomIcon, PanelRightIcon } from "./icons.tsx"
import { useSyncExternalStore } from "react"

export function Launcher(props: { readonly controller: WorkbenchController }) {
  const snapshot = useSyncExternalStore(props.controller.subscribe, props.controller.snapshot, props.controller.snapshot)
  const hasSession = snapshot.sessionId !== undefined
  return <div className={css.launcher} data-cocode-workbench-launcher>
    <Tooltip label="Toggle bottom panel" side="bottom" delayMs={500}>
      <button type="button" disabled={!hasSession} onClick={() => props.controller.toggleDock("bottom")} aria-label="Toggle bottom panel"><PanelBottomIcon size={16} /></button>
    </Tooltip>
    <Tooltip label="Toggle right panel" side="bottom" delayMs={500}>
      <button type="button" disabled={!hasSession} onClick={() => props.controller.toggleDock("right")} aria-label="Toggle right panel"><PanelRightIcon size={16} /></button>
    </Tooltip>
  </div>
}
