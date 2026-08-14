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
  const slashOpen = !historySearchOpen && !slashDismissed && slashItems.length > 0
  const fileMention = useMemo(
    () => findFileMentionAtCursor(snap.composer.text, snap.composer.cursor),
    [snap.composer.cursor, snap.composer.text],
  )
  const fileVisible =
    !historySearchOpen && !slashOpen && !fileDismissed && fileMention !== undefined
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
    (snap.helpOpen ? snap.helpText.split('\n').length + 4 : 0) +
    (slashOpen ? slashItems.length + 4 : 0) +
    (fileOpen ? fileItems.length + (fileLoading ? 3 : 4) : 0) +
    (historySearchOpen ? historyItems.length + 4 : 0)
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
      <StatusLine status={snap.status} agent={snap.agent} notice={snap.notice} />
      <Composer composer={snap.composer} />
      <Box width="100%" marginTop={1} justifyContent="space-between">
        {messageSelectionActive ? (
          <Text color={theme.brand}>message mode · ↑↓ move · enter expand · esc close</Text>
        ) : (
          <>
            <Text color={theme.mute}>↑↓ history · shift+↑ messages · ctrl+o details · ? help</Text>
            <Text color={theme.mute}>esc quit · ctrl+l redraw</Text>
          </>
        )}
      </Box>
      {slashOpen ? <SlashMenu items={slashItems} selectedIndex={slashIndex} /> : null}
      {fileOpen ? (
        <FileMenu
          items={fileItems}
          selectedIndex={fileIndex}
          query={fileMention?.query ?? ''}
          loading={fileLoading}
        />
      ) : null}
      {historySearchOpen ? (
        <HistorySearch query={historyQuery} matches={historyItems} selectedIndex={historyIndex} />
      ) : null}
      {snap.helpOpen ? <Help text={snap.helpText} /> : null}
    </Box>
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
