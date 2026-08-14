/**
 * Single chat layout. Components only see Snapshot + dispatch.
 */

import { Box, Text, useInput, useStdout } from 'ink'
import { useEffect, useMemo, useState } from 'react'
import type { TuiApp, TuiSnapshot } from '../runtime/app.ts'
import { matchKey } from '../runtime/keymap.ts'
import { Composer } from './components/Composer.tsx'
import { Header } from './components/Header.tsx'
import { Help } from './components/Help.tsx'
import { MessageList } from './components/MessageList.tsx'
import { StatusLine } from './components/StatusLine.tsx'
import {
  filterSlashItems,
  moveSlashSelection,
  SlashMenu,
  type SlashMenuItem,
} from './components/SlashMenu.tsx'
import { theme } from './theme.ts'

export function Chat(props: { app: TuiApp }) {
  const { app } = props
  const [snap, setSnap] = useState<TuiSnapshot>(() => app.snapshot())
  const [slashDismissed, setSlashDismissed] = useState(false)
  const [slashIndex, setSlashIndex] = useState(0)
  const { stdout } = useStdout()
  const slashItems = useMemo<readonly SlashMenuItem[]>(
    () => filterSlashItems(snap.commands, snap.composer.text),
    [snap.commands, snap.composer.text],
  )
  const slashOpen = !slashDismissed && slashItems.length > 0
  const composerRows = Math.max(1, snap.composer.text.split('\n').length)
  const reservedRows =
    11 +
    composerRows +
    (snap.notice ? 1 : 0) +
    (snap.helpOpen ? snap.helpText.split('\n').length + 4 : 0) +
    (slashOpen ? slashItems.length + 4 : 0)

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
  }, [snap.composer.text])

  useInput((input, key) => {
    if (snap.composer.disabled && !key.ctrl && input !== 'c') {
      if (key.escape || (key.ctrl && input === 'c')) {
        app.dispatch({ type: 'quit' })
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
        maxRows={Math.max(0, stdout.rows - reservedRows)}
      />
      <StatusLine status={snap.status} agent={snap.agent} notice={snap.notice} />
      <Composer composer={snap.composer} />
      <Box width="100%" marginTop={1} justifyContent="space-between">
        <Text color={theme.mute}>↑↓ history · ctrl+o details · ? help</Text>
        <Text color={theme.mute}>esc quit · ctrl+l redraw</Text>
      </Box>
      {slashOpen ? <SlashMenu items={slashItems} selectedIndex={slashIndex} /> : null}
      {snap.helpOpen ? <Help text={snap.helpText} /> : null}
    </Box>
  )
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
