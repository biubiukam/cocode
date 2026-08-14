/**
 * Single chat layout. Components only see Snapshot + dispatch.
 */

import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import type { TuiApp, TuiSnapshot } from "../runtime/app.ts";
import { matchKey } from "../runtime/keymap.ts";
import { Composer } from "./components/Composer.tsx";
import { Header } from "./components/Header.tsx";
import { Help } from "./components/Help.tsx";
import { MessageList } from "./components/MessageList.tsx";
import { StatusLine } from "./components/StatusLine.tsx";
import { theme } from "./theme.ts";

export function Chat(props: { app: TuiApp }) {
  const { app } = props;
  const [snap, setSnap] = useState<TuiSnapshot>(() => app.snapshot());

  useEffect(
    () =>
      app.subscribe(() => {
        setSnap(app.snapshot());
      }),
    [app],
  );

  useInput((input, key) => {
    if (snap.composer.disabled && !key.ctrl && input !== "c") {
      if (key.escape || (key.ctrl && input === "c")) {
        app.dispatch({ type: "quit" });
      }
      return;
    }

    const matched = matchKey({
      raw: input,
      return: key.return,
      escape: key.escape,
      upArrow: key.upArrow,
      downArrow: key.downArrow,
      ctrl: key.ctrl,
      shift: key.shift,
      empty: snap.composer.text === "",
    });

    if (matched !== undefined) {
      if (matched.emptyOnly === true && snap.composer.text !== "") return;
      runCommand(app, matched.id, snap.composer.text);
      return;
    }

    if (key.ctrl && input === "l") return;
    if (key.backspace || key.delete) {
      app.dispatch({
        type: "setDraft",
        text: snap.composer.text.slice(0, -1),
      });
      return;
    }
    if (input === "") return;
    app.dispatch({ type: "setDraft", text: snap.composer.text + input });
  });

  return (
    <Box flexDirection="column">
      <Header header={snap.header} />
      <MessageList nodes={snap.nodes} verbose={snap.verbose} />
      <Box marginTop={1}>
        <StatusLine status={snap.status} notice={snap.notice} />
      </Box>
      <Composer composer={snap.composer} />
      <Text color={theme.mute}>
        enter send · esc quit-or-interrupt · ? help
      </Text>
      {snap.helpOpen ? <Help text={snap.helpText} /> : null}
    </Box>
  );
}

function runCommand(app: TuiApp, id: string, draft: string): void {
  switch (id) {
    case "input.submit":
      app.dispatch({ type: "submit", text: draft });
      return;
    case "input.newline":
      app.dispatch({ type: "setDraft", text: `${draft}\n` });
      return;
    case "session.interruptOrQuit":
      app.dispatch({ type: "interruptOrQuit" });
      return;
    case "app.quit":
      app.dispatch({ type: "quit" });
      return;
    case "transcript.toggleVerbose":
      app.dispatch({ type: "toggleVerbose" });
      return;
    case "help.toggle":
      app.dispatch({ type: "toggleHelp" });
      return;
    case "history.prev":
      app.dispatch({ type: "historyPrev" });
      return;
    case "history.next":
      app.dispatch({ type: "historyNext" });
      return;
  }
}
