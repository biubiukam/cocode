/**
 * Single chat layout. Components only see Snapshot + dispatch.
 */

import { Box, Text, useInput, useStdout, useStdin } from 'ink'
import { useEffect, useMemo, useState } from 'react'
import type { TuiApp, TuiSnapshot } from '../runtime/app.ts'
import { matchKey, type Keymap } from '../runtime/keymap.ts'
import { resolveKeymap } from '../runtime/keymap-config.ts'
import { Composer } from './components/Composer.tsx'
import { FileMenu } from './components/FileMenu.tsx'
import { Header } from './components/Header.tsx'
import { Help } from './components/Help.tsx'
import { HistorySearch } from './components/HistorySearch.tsx'
import { MessageList } from './components/MessageList.tsx'
import { ResumePicker } from './components/ResumePicker.tsx'
import { RewindPicker } from './components/RewindPicker.tsx'
import { QuestionPanel } from './components/QuestionPanel.tsx'
import { SkillsPicker } from './components/SkillsPicker.tsx'
import { StatusLine } from './components/StatusLine.tsx'
import {
  filterSlashItems,
  moveSlashSelection,
  SlashMenu,
  type SlashMenuItem,
} from './components/SlashMenu.tsx'
import { theme } from './theme.ts'
import { findFileMentionAtCursor } from '../runtime/file-mentions.ts'
import { searchHistory } from '../runtime/history-search.ts'
import { listWorkspaceEntries, rankFileMatches } from '../runtime/workspace-files.ts'
import { moveMessageSelection, selectableMessageKeys } from './message-selection.ts'
import { visibleTail } from './visible-tail.ts'
import { focusConversationNodes } from '../runtime/focus.ts'
import { text } from '../runtime/ui-locale.ts'
import { visibleResumeItems } from '../runtime/resume-picker.ts'
import { editDraft } from '../runtime/external-editor.ts'
import { calculateChatLayout } from './chat-layout.ts'
import { Inspector, INSPECTOR_WIDTH } from './components/Inspector.tsx'

export function Chat(props: { app: TuiApp; keymap?: Keymap }) {
  const { app } = props
  const [snap, setSnap] = useState<TuiSnapshot>(() => app.snapshot())
  const keymap = useMemo(() => props.keymap ?? resolveKeymap(), [props.keymap])
  const [slashDismissed, setSlashDismissed] = useState(false)
  const [slashIndex, setSlashIndex] = useState(0)
  const [fileDismissed, setFileDismissed] = useState(false)
  const [fileIndex, setFileIndex] = useState(0)
  const [fileItems, setFileItems] = useState<readonly string[]>([])
  const [fileLoading, setFileLoading] = useState(false)
  const [historySearchOpen, setHistorySearchOpen] = useState(false)
  const [historyQuery, setHistoryQuery] = useState('')
  const [historyIndex, setHistoryIndex] = useState(0)
  const [messageSelectionActive, setMessageSelectionActive] = useState(false)
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [expandedMessageIds, setExpandedMessageIds] = useState<ReadonlySet<string>>(() => new Set())
  const [editorBusy, setEditorBusy] = useState(false)
  const [editorError, setEditorError] = useState<string | undefined>()
  const { stdout } = useStdout()
  const { isRawModeSupported, setRawMode } = useStdin()
  const slashItems = useMemo<readonly SlashMenuItem[]>(
    () => filterSlashItems(snap.commands, snap.composer.text),
    [snap.commands, snap.composer.text],
  )
  const resumeOpen = snap.resumePicker?.open === true
  const resumeItems = snap.resumePicker === undefined ? [] : visibleResumeItems(snap.resumePicker)
  const rewindState = snap.rewindPicker
  const rewindOpen = rewindState?.open === true
  const skillsState = snap.skillsPicker
  const skillsOpen = skillsState?.open === true
  const questionOpen = snap.question !== undefined
  const slashOpen =
    !questionOpen &&
    !rewindOpen &&
    !skillsOpen &&
    !resumeOpen &&
    !historySearchOpen &&
    !snap.helpOpen &&
    !slashDismissed &&
    slashItems.length > 0
  const fileMention = useMemo(
    () => findFileMentionAtCursor(snap.composer.text, snap.composer.cursor),
    [snap.composer.cursor, snap.composer.text],
  )
  const fileVisible =
    !questionOpen &&
    !rewindOpen &&
    !skillsOpen &&
    !resumeOpen &&
    !historySearchOpen &&
    !snap.helpOpen &&
    !slashOpen &&
    !fileDismissed &&
    fileMention !== undefined
  const fileOpen = fileVisible && (fileLoading || fileItems.length > 0)
  const historyItems = useMemo(
    () => searchHistory(snap.history, historyQuery, 8),
    [historyQuery, snap.history],
  )
  const layout = calculateChatLayout({
    viewportRows: stdout.rows,
    composerLines: snap.composer.text.split('\n').length,
    hasAttachments: snap.composer.attachments.length > 0,
    hasNotice: snap.notice !== undefined,
    hasStatusDetails: hasStatusDetails(snap.status),
    editorFeedbackRows: Number(editorBusy) + Number(editorError !== undefined),
    helpLines: snap.helpOpen ? snap.helpText.split('\n').length : undefined,
    slashItems: slashOpen ? slashItems.length : undefined,
    fileItems: fileOpen ? fileItems.length : undefined,
    fileLoading: fileOpen && fileLoading,
    historyMatches: historySearchOpen ? historyItems.length : undefined,
    resumeItems: resumeOpen ? resumeItems.length : undefined,
    resumeSelected: resumeOpen ? snap.resumePicker?.selected : undefined,
    rewindItems: rewindOpen ? rewindState.items.length : undefined,
    rewindSelected: rewindOpen ? rewindState.selected : undefined,
    rewindConfirming: rewindOpen ? rewindState.confirming : undefined,
    skillsItems: skillsOpen ? skillsState.skills.length : undefined,
    skillsSelected: skillsOpen ? skillsState.selected : undefined,
    questionRows:
      snap.question === undefined
        ? undefined
        : 6 +
          (snap.question.question.options?.length ?? 0) +
          Number(snap.question.question.detail !== undefined),
  })
  const messageMaxRows = layout.messageRows
  const wideInspector = stdout.columns >= 120
  const mainColumns = wideInspector
    ? Math.max(1, stdout.columns - INSPECTOR_WIDTH - 1)
    : stdout.columns
  const displayNodes = useMemo(
    () => focusConversationNodes(snap.nodes, snap.status.focusMode),
    [snap.nodes, snap.status.focusMode],
  )
  const selectableMessages = useMemo(
    () =>
      selectableMessageKeys(
        visibleTail(displayNodes, messageMaxRows, snap.verbose, expandedMessageIds),
      ),
    [displayNodes, expandedMessageIds, messageMaxRows, snap.verbose],
  )

  useEffect(
    () =>
      app.subscribe(() => {
        setSnap(app.snapshot())
      }),
    [app],
  )

  useEffect(() => {
    setSlashDismissed(false)
    setSlashIndex(0)
    setFileDismissed(false)
    setFileIndex(0)
  }, [snap.composer.text])

  useEffect(() => {
    if (!messageSelectionActive) return
    if (selectableMessages.length === 0) {
      setSelectedMessageId(null)
      return
    }
    if (selectedMessageId === null || !selectableMessages.includes(selectedMessageId)) {
      setSelectedMessageId(selectableMessages[selectableMessages.length - 1] ?? null)
    }
  }, [messageSelectionActive, selectableMessages, selectedMessageId])

  useEffect(() => {
    if (!fileVisible || fileMention === undefined) {
      setFileItems([])
      setFileLoading(false)
      return
    }
    let active = true
    setFileLoading(true)
    void listWorkspaceEntries({ cwd: snap.header.cwd })
      .then((files) => {
        if (!active) return
        setFileItems(rankFileMatches(files, fileMention.query, 8))
      })
      .catch(() => {
        if (active) setFileItems([])
      })
      .finally(() => {
        if (active) setFileLoading(false)
      })
    return () => {
      active = false
    }
  }, [fileMention, fileVisible, snap.header.cwd])

  function openExternalEditor(): void {
    if (!isRawModeSupported) {
      setEditorError(text(snap.locale, 'editorUnavailable'))
      return
    }
    setEditorBusy(true)
    setEditorError(undefined)
    try {
      setRawMode(false)
    } catch {
      setEditorBusy(false)
      setEditorError(text(snap.locale, 'editorUnavailable'))
      return
    }
    void editDraft({ text: snap.composer.text })
      .then((edited) => {
        app.dispatch({ type: 'setDraft', text: edited })
      })
      .catch((error: unknown) => {
        setEditorError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        try {
          setRawMode(true)
        } catch {
          // The terminal may already be closing.
        }
        setEditorBusy(false)
      })
  }

  useInput((input, key) => {
    if (editorBusy) return
    if (questionOpen) return
    if (rewindOpen) {
      if (key.escape) {
        app.dispatch({ type: 'rewind.close' })
        return
      }
      if (!rewindState?.confirming && (key.upArrow || key.downArrow)) {
        app.dispatch({ type: 'rewind.move', delta: key.upArrow ? -1 : 1 })
        return
      }
      if (key.return) {
        app.dispatch({ type: 'rewind.confirm' })
        return
      }
      return
    }
    if (skillsOpen) {
      if (key.escape) {
        app.dispatch({ type: 'skills.close' })
        return
      }
      if (key.upArrow || key.downArrow) {
        app.dispatch({ type: 'skills.move', delta: key.upArrow ? -1 : 1 })
        return
      }
      if (key.return) {
        app.dispatch({ type: 'skills.confirm' })
        return
      }
      if (key.backspace || key.delete) {
        app.dispatch({
          type: 'skills.setQuery',
          query: skillsState?.query.slice(0, -1) ?? '',
        })
        return
      }
      if (input !== '' && !key.ctrl) {
        app.dispatch({
          type: 'skills.setQuery',
          query: (skillsState?.query ?? '') + input,
        })
      }
      return
    }
    if (layout.tooSmall) {
      if (key.escape || (key.ctrl && (input === 'c' || input === 'd'))) {
        app.dispatch({ type: 'quit' })
      }
      return
    }
    if (snap.composer.disabled && !key.ctrl && input !== 'c') {
      if (key.escape || (key.ctrl && input === 'c')) {
        app.dispatch({ type: 'quit' })
      }
      return
    }

    if (snap.resumePicker?.open === true) {
      if (key.escape) {
        app.dispatch({ type: 'resume.close' })
        return
      }
      if (key.upArrow || key.downArrow) {
        app.dispatch({ type: 'resume.move', delta: key.upArrow ? -1 : 1 })
        return
      }
      if (key.return) {
        app.dispatch({ type: 'resume.confirm' })
        return
      }
      if (key.backspace || key.delete) {
        app.dispatch({
          type: 'resume.setQuery',
          query: snap.resumePicker.query.slice(0, -1),
        })
        return
      }
      if (input !== '' && !key.ctrl) {
        app.dispatch({
          type: 'resume.setQuery',
          query: snap.resumePicker.query + input,
        })
      }
      return
    }

    if (historySearchOpen) {
      if (key.escape) {
        setHistorySearchOpen(false)
        setHistoryQuery('')
        setHistoryIndex(0)
        return
      }
      if (key.upArrow) {
        setHistoryIndex((index) => moveSelection(index, -1, historyItems.length))
        return
      }
      if (key.downArrow) {
        setHistoryIndex((index) => moveSelection(index, 1, historyItems.length))
        return
      }
      if (key.return) {
        const selected = historyItems[moveSelection(historyIndex, 0, historyItems.length)]
        if (selected !== undefined) app.dispatch({ type: 'setDraft', text: selected })
        setHistorySearchOpen(false)
        setHistoryQuery('')
        setHistoryIndex(0)
        return
      }
      if (key.backspace || key.delete) {
        setHistoryQuery((query) => query.slice(0, -1))
        setHistoryIndex(0)
        return
      }
      if (input !== '' && !key.ctrl) {
        setHistoryQuery((query) => query + input)
        setHistoryIndex(0)
      }
      return
    }

    if (messageSelectionActive) {
      if (key.escape) {
        setMessageSelectionActive(false)
        setSelectedMessageId(null)
        return
      }
      if (key.upArrow || key.downArrow) {
        setSelectedMessageId((current) =>
          moveMessageSelection(selectableMessages, current, key.upArrow ? -1 : 1),
        )
        return
      }
      if (key.return && selectedMessageId !== null) {
        setExpandedMessageIds((current) => {
          const next = new Set(current)
          if (next.has(selectedMessageId)) next.delete(selectedMessageId)
          else next.add(selectedMessageId)
          return next
        })
        return
      }
      if (input === 'c' && !key.ctrl && !key.meta && !key.shift && selectedMessageId !== null) {
        app.dispatch({ type: 'copyNode', nodeKey: selectedMessageId })
        return
      }
      return
    }

    if (slashOpen) {
      if (key.escape) {
        setSlashDismissed(true)
        return
      }
      if (key.downArrow || key.tab) {
        setSlashIndex((index) => moveSlashSelection(index, 1, slashItems.length))
        return
      }
      if (key.upArrow) {
        setSlashIndex((index) => moveSlashSelection(index, -1, slashItems.length))
        return
      }
      if (key.return) {
        const selected = slashItems[moveSlashSelection(slashIndex, 0, slashItems.length)]
        if (selected !== undefined) {
          app.dispatch({ type: 'command', line: `/${selected.name}` })
        }
        return
      }
    }

    if (fileOpen && fileMention !== undefined) {
      if (key.escape) {
        setFileDismissed(true)
        return
      }
      if (key.downArrow || key.tab) {
        setFileIndex((index) => moveSelection(index, 1, fileItems.length))
        return
      }
      if (key.upArrow) {
        setFileIndex((index) => moveSelection(index, -1, fileItems.length))
        return
      }
      if (key.return) {
        const selected = fileItems[moveSelection(fileIndex, 0, fileItems.length)]
        if (selected !== undefined) {
          app.dispatch({
            type: 'attachFile',
            start: fileMention.start,
            end: fileMention.end,
            path: selected,
          })
        }
        return
      }
    }

    if (key.tab && snap.agent === 'running' && snap.composer.text.trim() !== '') {
      app.dispatch({ type: 'queuePrompt' })
      return
    }

    const matched = matchKey(
      {
        raw: input,
        return: key.return,
        escape: key.escape,
        upArrow: key.upArrow,
        downArrow: key.downArrow,
        leftArrow: key.leftArrow,
        rightArrow: key.rightArrow,
        tab: key.tab,
        backspace: key.backspace,
        delete: key.delete,
        ctrl: key.ctrl,
        alt: key.meta,
        shift: key.shift,
        empty: snap.composer.text === '',
      },
      keymap,
    )

    if (matched !== undefined) {
      if (matched.emptyOnly === true && snap.composer.text !== '') return
      if (matched.id === 'editor.open') {
        openExternalEditor()
        return
      }
      if (matched.id === 'history.search') {
        setHistorySearchOpen(true)
        setHistoryQuery('')
        setHistoryIndex(0)
        return
      }
      if (matched.id === 'messages.select') {
        if (selectableMessages.length === 0) return
        setMessageSelectionActive(true)
        setSelectedMessageId(selectableMessages[selectableMessages.length - 1] ?? null)
        return
      }
      runCommand(app, matched.id, snap.composer.text)
      return
    }
    if (key.leftArrow) {
      app.dispatch({ type: 'moveCursor', delta: -1 })
      return
    }
    if (key.rightArrow) {
      app.dispatch({ type: 'moveCursor', delta: 1 })
      return
    }
    if (key.backspace || key.delete) {
      app.dispatch({ type: 'deleteBackward' })
      return
    }
    if (input === '') return
    app.dispatch({ type: 'insertDraft', text: input })
  })

  if (layout.tooSmall) {
    return (
      <Box flexDirection="column" height={stdout.rows} overflowY="hidden">
        <Text color={theme.brand} bold wrap="truncate-end">
          cocode · {text(snap.locale, 'terminalTooSmall')}
        </Text>
        {stdout.rows > 1 ? (
          <Text color={theme.mute} wrap="truncate-end">
            {text(snap.locale, 'terminalResize', {
              current: String(stdout.rows),
              required: String(layout.minimumRows),
            })}
          </Text>
        ) : null}
        {rewindOpen && rewindState !== undefined ? (
          <RewindPicker
            state={rewindState}
            locale={snap.locale}
            maxRows={Math.max(1, stdout.rows - 2)}
          />
        ) : null}
      </Box>
    )
  }

  const overlays = (
    <>
      {slashOpen ? (
        <SlashMenu
          items={slashItems}
          selectedIndex={slashIndex}
          locale={snap.locale}
          maxRows={layout.overlayRows}
        />
      ) : null}
      {fileOpen ? (
        <FileMenu
          items={fileItems}
          selectedIndex={fileIndex}
          query={fileMention?.query ?? ''}
          loading={fileLoading}
          locale={snap.locale}
          maxRows={layout.overlayRows}
        />
      ) : null}
      {historySearchOpen ? (
        <HistorySearch
          query={historyQuery}
          matches={historyItems}
          selectedIndex={historyIndex}
          locale={snap.locale}
          maxRows={layout.overlayRows}
        />
      ) : null}
      {snap.resumePicker?.open === true ? (
        <ResumePicker
          state={snap.resumePicker}
          currentSessionId={snap.header.sessionId}
          locale={snap.locale}
          maxRows={layout.overlayRows}
        />
      ) : null}
      {rewindOpen ? (
        <RewindPicker state={rewindState} locale={snap.locale} maxRows={layout.overlayRows} />
      ) : null}
      {skillsOpen && skillsState !== undefined ? (
        <SkillsPicker state={skillsState} locale={snap.locale} maxRows={layout.overlayRows} />
      ) : null}
      {snap.question !== undefined ? (
        <QuestionPanel
          key={snap.question.key}
          state={snap.question}
          locale={snap.locale}
          dispatch={app.dispatch}
        />
      ) : null}
      {snap.helpOpen ? (
        <Help text={snap.helpText} locale={snap.locale} maxRows={layout.overlayRows} />
      ) : null}
    </>
  )

  return (
    <Box flexDirection="row" height={stdout.rows}>
      <Box
        flexDirection="column"
        height={stdout.rows}
        width={wideInspector ? mainColumns : undefined}
        minWidth={0}
        flexGrow={wideInspector ? 0 : 1}
      >
        <Header
          header={snap.header}
          agent={snap.agent}
          locale={snap.locale}
          columns={mainColumns}
        />
        <MessageList
          nodes={displayNodes}
          verbose={snap.verbose}
          maxRows={messageMaxRows}
          selectedNodeId={messageSelectionActive ? selectedMessageId : undefined}
          expandedNodeIds={expandedMessageIds}
          locale={snap.locale}
          maxColumns={mainColumns}
        />
        <StatusLine
          status={snap.status}
          agent={snap.agent}
          notice={snap.notice}
          locale={snap.locale}
        />
        {editorBusy ? (
          <Text color={theme.info} wrap="truncate-end">
            {text(snap.locale, 'editorOpening')}
          </Text>
        ) : null}
        {editorError !== undefined ? (
          <Text color={theme.error} wrap="truncate-end">
            {editorError}
          </Text>
        ) : null}
        {layout.overlayRows > 0 ? (
          <Box flexDirection="column" height={layout.overlayRows} overflowY="hidden">
            {overlays}
          </Box>
        ) : null}
        <Composer
          composer={snap.composer}
          locale={snap.locale}
          maxRows={layout.composerRows}
          maxColumns={mainColumns}
        />
        <Box width="100%" marginTop={1} justifyContent="space-between">
          {messageSelectionActive ? (
            <Text color={theme.brand} wrap="truncate-end">
              {text(snap.locale, 'messageMode')} · {text(snap.locale, 'messageModeHint')}
            </Text>
          ) : (
            <>
              <Text color={theme.mute} wrap="truncate-end">
                {text(snap.locale, 'footerHistory')} · {text(snap.locale, 'footerMessages')} ·{' '}
                {text(snap.locale, 'footerDetails')} · {text(snap.locale, 'footerHelp')}
              </Text>
              <Text color={theme.mute} wrap="truncate-end">
                {text(snap.locale, 'footerQuit')} · {text(snap.locale, 'footerRedraw')}
              </Text>
            </>
          )}
        </Box>
      </Box>
      {wideInspector ? <Inspector snapshot={snap} locale={snap.locale} /> : null}
    </Box>
  )
}

function hasTelemetry(telemetry: TuiSnapshot['status']['telemetry']): boolean {
  return (
    telemetry.tps !== undefined ||
    telemetry.cacheHitRate !== undefined ||
    telemetry.contextPercent !== undefined ||
    telemetry.reasoningEffort !== undefined ||
    telemetry.activity !== undefined ||
    Object.values(telemetry.contextSegments).some((value) => value > 0)
  )
}

function hasStatusDetails(status: TuiSnapshot['status']): boolean {
  return (
    hasTelemetry(status.telemetry) ||
    status.todos.length > 0 ||
    status.goal !== undefined ||
    status.agentPreset !== undefined ||
    status.transcript !== undefined
  )
}

function moveSelection(index: number, delta: number, count: number): number {
  if (count <= 0) return 0
  return (((index + delta) % count) + count) % count
}

function runCommand(app: TuiApp, id: string, draft: string): void {
  switch (id) {
    case 'input.submit':
      app.dispatch({ type: 'submit', text: draft })
      return
    case 'input.newline':
      app.dispatch({ type: 'insertDraft', text: '\n' })
      return
    case 'session.interruptOrQuit':
      app.dispatch({ type: 'interruptOrQuit' })
      return
    case 'app.quit':
      app.dispatch({ type: 'quit' })
      return
    case 'app.redraw':
      app.dispatch({ type: 'redraw' })
      return
    case 'transcript.toggleVerbose':
      app.dispatch({ type: 'toggleVerbose' })
      return
    case 'help.toggle':
      app.dispatch({ type: 'toggleHelp' })
      return
    case 'history.prev':
      app.dispatch({ type: 'historyPrev' })
      return
    case 'history.next':
      app.dispatch({ type: 'historyNext' })
      return
  }
}
