/**
 * Single chat layout. Components only see Snapshot + dispatch.
 */

import { Box, Text, useInput, useStdout } from 'ink'
import { useEffect, useMemo, useState } from 'react'
import type { TuiApp, TuiSnapshot } from '../runtime/app.ts'
import { matchKey } from '../runtime/keymap.ts'
import { Composer } from './components/Composer.tsx'
import { FileMenu } from './components/FileMenu.tsx'
import { Header } from './components/Header.tsx'
import { Help } from './components/Help.tsx'
import { HistorySearch } from './components/HistorySearch.tsx'
import { MessageList } from './components/MessageList.tsx'
import { ResumePicker } from './components/ResumePicker.tsx'
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
import { text } from '../runtime/ui-locale.ts'
import { visibleResumeItems } from '../runtime/resume-picker.ts'

export function Chat(props: { app: TuiApp }) {
  const { app } = props
  const [snap, setSnap] = useState<TuiSnapshot>(() => app.snapshot())
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
  const { stdout } = useStdout()
  const slashItems = useMemo<readonly SlashMenuItem[]>(
    () => filterSlashItems(snap.commands, snap.composer.text),
    [snap.commands, snap.composer.text],
  )
  const resumeOpen = snap.resumePicker?.open === true
  const resumeItems = snap.resumePicker === undefined ? [] : visibleResumeItems(snap.resumePicker)
  const slashOpen = !resumeOpen && !historySearchOpen && !slashDismissed && slashItems.length > 0
  const fileMention = useMemo(
    () => findFileMentionAtCursor(snap.composer.text, snap.composer.cursor),
    [snap.composer.cursor, snap.composer.text],
  )
  const fileVisible =
    !resumeOpen && !historySearchOpen && !slashOpen && !fileDismissed && fileMention !== undefined
  const fileOpen = fileVisible && (fileLoading || fileItems.length > 0)
  const historyItems = useMemo(
    () => searchHistory(snap.history, historyQuery, 8),
    [historyQuery, snap.history],
  )
  const composerRows = Math.max(1, snap.composer.text.split('\n').length)
  const reservedRows =
    11 +
    composerRows +
    (snap.composer.attachments.length > 0 ? 1 : 0) +
    (snap.notice ? 1 : 0) +
    (hasStatusDetails(snap.status) ? 1 : 0) +
    (snap.helpOpen ? snap.helpText.split('\n').length + 4 : 0) +
    (slashOpen ? slashItems.length + 4 : 0) +
    (fileOpen ? fileItems.length + (fileLoading ? 5 : 4) : 0) +
    (historySearchOpen ? historyItems.length + 5 : 0) +
    (resumeOpen ? Math.min(resumeItems.length, 8) + 7 : 0)
  const messageMaxRows = Math.max(0, stdout.rows - reservedRows)
  const selectableMessages = useMemo(
    () =>
      selectableMessageKeys(
        visibleTail(snap.nodes, messageMaxRows, snap.verbose, expandedMessageIds),
      ),
    [expandedMessageIds, messageMaxRows, snap.nodes, snap.verbose],
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

  useInput((input, key) => {
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
      return
    }

    if (key.ctrl && input === 'r') {
      setHistorySearchOpen(true)
      setHistoryQuery('')
      setHistoryIndex(0)
      return
    }

    if (key.shift && key.upArrow) {
      if (selectableMessages.length === 0) return
      setMessageSelectionActive(true)
      setSelectedMessageId(selectableMessages[selectableMessages.length - 1] ?? null)
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

    const matched = matchKey({
      raw: input,
      return: key.return,
      escape: key.escape,
      upArrow: key.upArrow,
      downArrow: key.downArrow,
      ctrl: key.ctrl,
      shift: key.shift,
      empty: snap.composer.text === '',
    })

    if (matched !== undefined) {
      if (matched.emptyOnly === true && snap.composer.text !== '') return
      runCommand(app, matched.id, snap.composer.text)
      return
    }

    if (key.ctrl && input === 'l') {
      app.dispatch({ type: 'redraw' })
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

  return (
    <Box flexDirection="column" height={stdout.rows}>
      <Header header={snap.header} agent={snap.agent} />
      <MessageList
        nodes={snap.nodes}
        verbose={snap.verbose}
        maxRows={messageMaxRows}
        selectedNodeId={messageSelectionActive ? selectedMessageId : undefined}
        expandedNodeIds={expandedMessageIds}
      />
      <StatusLine
        status={snap.status}
        agent={snap.agent}
        notice={snap.notice}
        locale={snap.locale}
      />
      <Composer composer={snap.composer} locale={snap.locale} />
      <Box width="100%" marginTop={1} justifyContent="space-between">
        {messageSelectionActive ? (
          <Text color={theme.brand}>
            {text(snap.locale, 'messageMode')} · {text(snap.locale, 'messageModeHint')}
          </Text>
        ) : (
          <>
            <Text color={theme.mute}>
              {text(snap.locale, 'footerHistory')} · {text(snap.locale, 'footerMessages')} ·{' '}
              {text(snap.locale, 'footerDetails')} · {text(snap.locale, 'footerHelp')}
            </Text>
            <Text color={theme.mute}>
              {text(snap.locale, 'footerQuit')} · {text(snap.locale, 'footerRedraw')}
            </Text>
          </>
        )}
      </Box>
      {slashOpen ? (
        <SlashMenu items={slashItems} selectedIndex={slashIndex} locale={snap.locale} />
      ) : null}
      {fileOpen ? (
        <FileMenu
          items={fileItems}
          selectedIndex={fileIndex}
          query={fileMention?.query ?? ''}
          loading={fileLoading}
          locale={snap.locale}
        />
      ) : null}
      {historySearchOpen ? (
        <HistorySearch
          query={historyQuery}
          matches={historyItems}
          selectedIndex={historyIndex}
          locale={snap.locale}
        />
      ) : null}
      {snap.resumePicker?.open === true ? (
        <ResumePicker
          state={snap.resumePicker}
          currentSessionId={snap.header.sessionId}
          locale={snap.locale}
        />
      ) : null}
      {snap.helpOpen ? <Help text={snap.helpText} locale={snap.locale} /> : null}
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
    status.agentPreset !== undefined
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
