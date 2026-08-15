import { useEffect, useState, useSyncExternalStore } from "react"
import type { InjectFace, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots"
import { comboFromEvent, type ShortcutRegistry } from "./registry.ts"
import { formatCombo, isUsableCombo, type Combo } from "./combo.ts"

export type ShortcutsSectionInjected = { readonly registry: ShortcutRegistry }
export type ShortcutsSectionProps = PropsRuntime<"settings.section"> & InjectFace<ShortcutsSectionInjected>

function isChinese(): boolean {
  return document.documentElement.lang.toLowerCase().startsWith("zh") || navigator.language.toLowerCase().startsWith("zh")
}

export function ShortcutsSection({ registry }: ShortcutsSectionProps) {
  const state = useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot)
  const [recording, setRecording] = useState<string | undefined>()
  const zh = isChinese()

  useEffect(() => {
    registry.reloadSettings()
  }, [registry])

  useEffect(() => {
    if (recording === undefined) return
    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === "Escape") {
        registry.setRecording(false)
        setRecording(undefined)
        return
      }
      if (event.key === "Backspace") {
        const commandId = recording
        registry.setRecording(false)
        setRecording(undefined)
        registry.setBinding(commandId, { disabled: true })
        return
      }
      const combo = comboFromEvent(event)
      if (combo === undefined || !isUsableCombo(combo)) return
      const commandId = recording
      registry.setRecording(false)
      setRecording(undefined)
      registry.setBinding(commandId, { combo })
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => { window.removeEventListener("keydown", onKeyDown, true) }
  }, [recording, registry])

  const startRecording = (commandId: string): void => {
    registry.setRecording(true)
    setRecording(commandId)
  }

  return (
    <div style={{ color: "var(--dsw-alias-label-primary)", maxWidth: 720 }}>
      <h2 style={{ fontSize: 16, fontWeight: 500, lineHeight: "24px", margin: 0 }}>
        {zh ? "快捷键" : "Keyboard Shortcuts"}
      </h2>
      <p style={{ color: "var(--dsw-alias-label-tertiary)", fontSize: 14, lineHeight: "22px", margin: "8px 0 20px" }}>
        {zh ? "配置应用内和桌面全局快捷键。" : "Configure application and desktop global shortcuts."}
      </p>
      <div style={{ display: "grid", gap: 10 }}>
          {state.commands.map(command => {
            const binding = state.bindings.find(item => item.commandId === command.id)
            const user = registry.getUserBinding(command.id)
            const disabled = user?.disabled === true
            const currentScope = binding?.scope ?? command.defaultScope ?? "app"
            return (
              <div key={command.id} style={{ alignItems: "center", display: "flex", gap: 8, justifyContent: "space-between" }}>
                <div style={{ minWidth: 0 }}>
                  <div>{command.title}</div>
                  {command.description !== undefined && <div style={{ color: "var(--dsw-alias-label-secondary, #6b7280)", fontSize: 12 }}>{command.description}</div>}
                </div>
                <div style={{ alignItems: "center", display: "flex", gap: 6, flexShrink: 0 }}>
                  <code>{disabled ? (zh ? "已禁用" : "Disabled") : formatCombo(binding?.combo ?? command.defaultCombo)}</code>
                  <button
                    type="button"
                    disabled={!state.writable}
                    onClick={() => { startRecording(command.id) }}
                  >
                    {recording === command.id ? (zh ? "按键…" : "Press…") : (zh ? "录制" : "Record")}
                  </button>
                  <button
                    type="button"
                    disabled={!state.writable}
                    onClick={() => { registry.resetBinding(command.id) }}
                  >
                    {zh ? "重置" : "Reset"}
                  </button>
                  {command.globalCapable && (
                    <button
                      type="button"
                      disabled={!state.writable}
                      aria-pressed={currentScope === "global"}
                      onClick={() => {
                        registry.setBinding(command.id, {
                          ...(binding === undefined ? {} : { combo: binding.combo }),
                          scope: currentScope === "global" ? "app" : "global",
                        })
                      }}
                    >
                      {currentScope === "global" ? (zh ? "全局" : "Global") : (zh ? "应用" : "App")}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {state.conflicts.length > 0 && (
            <div role="alert" style={{ color: "#b42318", fontSize: 12 }}>
              {zh ? "快捷键冲突：" : "Shortcut conflicts: "}
              {state.conflicts.map(conflict => conflict.commandIds.join(" / ")).join(", ")}
            </div>
          )}
          {state.orphaned.length > 0 && (
            <div style={{ color: "var(--dsw-alias-label-secondary, #6b7280)", fontSize: 12 }}>
              {zh ? `存在 ${state.orphaned.length} 个无效快捷键配置。` : `${state.orphaned.length} orphaned shortcut setting(s).`}
            </div>
          )}
          {state.settingsStatus === "loading" && (
            <div style={{ color: "var(--dsw-alias-label-secondary, #6b7280)", fontSize: 12 }}>
              {zh ? "正在加载快捷键设置…" : "Loading shortcut settings…"}
            </div>
          )}
          {state.settingsStatus === "memory" && (
            <div style={{ color: "var(--dsw-alias-label-secondary, #6b7280)", fontSize: 12 }}>
              {zh ? "设置服务不可用，当前使用临时内存配置。" : "Settings route unavailable; using temporary in-memory bindings."}
            </div>
          )}
          {state.settingsError !== undefined && <div role="alert" style={{ color: "#b42318", fontSize: 12 }}>{state.settingsError}</div>}
          {state.globalError !== undefined && <div role="alert" style={{ color: "#b42318", fontSize: 12 }}>{state.globalError}</div>}
          {recording !== undefined && <div style={{ color: "var(--dsw-alias-label-secondary, #6b7280)", fontSize: 12 }}>{zh ? "按 Escape 取消，按 Backspace 禁用。" : "Press Escape to cancel or Backspace to disable."}</div>}
      </div>
    </div>
  )
}

export type { Combo }
