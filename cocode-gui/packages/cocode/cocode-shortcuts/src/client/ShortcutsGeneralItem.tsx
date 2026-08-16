import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import type { ReactNode } from "react"
import {
  Button,
  IconEditOutline16,
  IconSearchOutline16,
  IconTrashOutline16,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives"
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots"
import {
  comboFromEvent,
  NEW_SESSION_COMMAND,
  SIDEBAR_TOGGLE_COMMAND,
  type ShortcutCommand,
  type ShortcutRegistry,
} from "./registry.ts"
import {
  formatCombo,
  formatComboGlyphs,
  formatComboSearchText,
  isUsableCombo,
  type Combo,
} from "./combo.ts"
import type { ShortcutsLocaleKey } from "./locales.ts"
import css from "./ShortcutsSection.module.css"

export type ShortcutsSectionInjected = { readonly registry: ShortcutRegistry }
export type ShortcutsSectionProps =
  PropsRuntime<"settings.section">
  & InjectFace<ShortcutsSectionInjected>
  & PropsLocale<"settings.shortcuts">

const COMMAND_COPY: Record<string, { title: ShortcutsLocaleKey; hint: ShortcutsLocaleKey }> = {
  [SIDEBAR_TOGGLE_COMMAND]: { title: "sidebarToggle", hint: "sidebarToggleHint" },
  [NEW_SESSION_COMMAND]: { title: "newSession", hint: "newSessionHint" },
}

function commandTitle(command: ShortcutCommand, t: ShortcutsSectionProps["t"]): string {
  const copy = COMMAND_COPY[command.id]
  return copy === undefined ? command.title : t(copy.title)
}

function commandHint(command: ShortcutCommand, t: ShortcutsSectionProps["t"]): string | undefined {
  const copy = COMMAND_COPY[command.id]
  if (copy !== undefined) return t(copy.hint)
  return command.description
}

function matchesQuery(
  command: ShortcutCommand,
  title: string,
  hint: string | undefined,
  combo: Combo | undefined,
  query: string,
): boolean {
  if (query.length === 0) return true
  const haystack = [
    title,
    hint ?? "",
    command.id,
    formatComboSearchText(combo),
  ].join(" ").toLocaleLowerCase()
  return haystack.includes(query)
}

export function ShortcutsSection({ registry, t }: ShortcutsSectionProps) {
  const state = useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot)
  const [recording, setRecording] = useState<string | undefined>()
  const [query, setQuery] = useState("")

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
    if (recording === commandId) {
      registry.setRecording(false)
      setRecording(undefined)
      return
    }
    registry.setRecording(true)
    setRecording(commandId)
  }

  const stopRecording = (): void => {
    registry.setRecording(false)
    setRecording(undefined)
  }

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = useMemo(
    () => state.commands.filter((command) => {
      const user = registry.getUserBinding(command.id)
      const combo = user?.disabled === true ? undefined : user?.combo ?? command.defaultCombo
      return matchesQuery(command, commandTitle(command, t), commandHint(command, t), combo, normalizedQuery)
    }),
    [normalizedQuery, registry, state.commands, t],
  )

  const hasOverrides = state.orphaned.length > 0
    || state.commands.some(command => registry.getUserBinding(command.id) !== undefined)
  const conflictNames = state.conflicts.map(conflict => conflict.commandIds
    .map(commandId => {
      const command = state.commands.find(item => item.id === commandId)
      return command === undefined ? commandId : commandTitle(command, t)
    })
    .join(" / ")).join(", ")

  return (
    <div className={css.section}>
      <header className={css.header}>
        <div className={css.heading}>
          <h2 className={css.title}>{t("title")}</h2>
          <p className={css.intro}>{t("intro")}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className={css.resetAll}
          disabled={!state.writable || !hasOverrides}
          onClick={() => {
            stopRecording()
            void registry.resetAllBindings()
          }}
        >
          {t("resetAll")}
        </Button>
      </header>

      <label className={css.search}>
        <IconSearchOutline16 aria-hidden="true" />
        <span className={css.hidden}>{t("search")}</span>
        <input
          type="search"
          value={query}
          placeholder={t("search")}
          aria-label={t("search")}
          onChange={(event) => { setQuery(event.currentTarget.value) }}
        />
      </label>

      {state.settingsStatus === "loading" && <p className={css.notice}>{t("loading")}</p>}
      {state.settingsStatus === "memory" && <p className={css.notice}>{t("memory")}</p>}
      {state.settingsError !== undefined && <p role="alert" className={css.alert}>{state.settingsError}</p>}
      {state.globalError !== undefined && <p role="alert" className={css.alert}>{state.globalError}</p>}
      {state.conflicts.length > 0 && (
        <p role="alert" className={css.alert}>{t("conflicts").replace("{names}", conflictNames)}</p>
      )}
      {state.orphaned.length > 0 && (
        <div className={css.banner}>
          <p className={css.notice}>{t("orphaned").replace("{count}", String(state.orphaned.length))}</p>
          <button
            type="button"
            className={css.bannerAction}
            disabled={!state.writable}
            onClick={() => { void registry.clearOrphaned() }}
          >
            {t("clearOrphaned")}
          </button>
        </div>
      )}
      {recording !== undefined && <p className={css.hint} aria-live="polite">{t("recordHint")}</p>}

      {state.commands.length > 0 && filtered.length === 0 ? (
        <p className={css.empty}>{t("emptySearch")}</p>
      ) : (
        <ul className={css.list}>
          {filtered.map((command) => {
            const binding = state.bindings.find(item => item.commandId === command.id)
            const user = registry.getUserBinding(command.id)
            const disabled = user?.disabled === true
            const combo = disabled ? undefined : binding?.combo ?? command.defaultCombo
            const currentScope = binding?.scope ?? command.defaultScope ?? "app"
            const isRecording = recording === command.id
            const conflicted = state.conflicts.some(conflict => conflict.commandIds.includes(command.id))
            const title = commandTitle(command, t)
            const hint = commandHint(command, t)
            return (
              <ShortcutRow
                key={command.id}
                title={title}
                hint={hint}
                combo={combo}
                disabled={disabled}
                writable={state.writable}
                recording={isRecording}
                conflicted={conflicted}
                globalCapable={command.globalCapable === true}
                scope={currentScope}
                t={t}
                onRecord={() => { startRecording(command.id) }}
                onUnassign={() => {
                  stopRecording()
                  registry.setBinding(command.id, { disabled: true })
                }}
                onToggleScope={() => {
                  registry.setBinding(command.id, {
                    ...(combo === undefined ? {} : { combo }),
                    scope: currentScope === "global" ? "app" : "global",
                  })
                }}
              />
            )
          })}
        </ul>
      )}
    </div>
  )
}

function ShortcutRow({
  title,
  hint,
  combo,
  disabled,
  writable,
  recording,
  conflicted,
  globalCapable,
  scope,
  t,
  onRecord,
  onUnassign,
  onToggleScope,
}: {
  title: string
  hint: string | undefined
  combo: Combo | undefined
  disabled: boolean
  writable: boolean
  recording: boolean
  conflicted: boolean
  globalCapable: boolean
  scope: "app" | "global"
  t: ShortcutsSectionProps["t"]
  onRecord: () => void
  onUnassign: () => void
  onToggleScope: () => void
}): ReactNode {
  const glyphs = formatComboGlyphs(combo)
  const readable = formatCombo(combo)
  const empty = disabled || combo === undefined
  const kbdLabel = recording ? t("recording") : empty ? t("unassigned") : glyphs

  return (
    <li className={css.row} data-recording={recording ? "true" : undefined}>
      <div className={css.copy}>
        <div className={css.name}>{title}</div>
        {hint !== undefined && <div className={css.description}>{hint}</div>}
      </div>
      <div className={css.controls}>
        {globalCapable && (
          <Tooltip label={scope === "global" ? t("globalHint") : t("appHint")} side="bottom" delayMs={400}>
            <button
              type="button"
              className={css.scope}
              disabled={!writable}
              aria-pressed={scope === "global"}
              onClick={onToggleScope}
            >
              {scope === "global" ? t("global") : t("app")}
            </button>
          </Tooltip>
        )}
        <button
          type="button"
          className={css.kbd}
          disabled={!writable}
          data-recording={recording ? "true" : undefined}
          data-empty={empty && !recording ? "true" : undefined}
          data-conflict={conflicted ? "true" : undefined}
          aria-label={recording ? t("recording") : empty ? t("unassigned") : readable}
          onClick={onRecord}
        >
          {kbdLabel}
        </button>
        <Tooltip label={recording ? t("recording") : t("record")} side="bottom" delayMs={400}>
          <button
            type="button"
            className={css.iconBtn}
            disabled={!writable}
            aria-label={t("record")}
            aria-pressed={recording}
            onClick={onRecord}
          >
            <IconEditOutline16 size={14} />
          </button>
        </Tooltip>
        <Tooltip label={t("unassign")} side="bottom" delayMs={400}>
          <button
            type="button"
            className={css.iconBtn}
            disabled={!writable || empty}
            aria-label={t("unassign")}
            onClick={onUnassign}
          >
            <IconTrashOutline16 size={14} />
          </button>
        </Tooltip>
      </div>
    </li>
  )
}

export type { Combo }
