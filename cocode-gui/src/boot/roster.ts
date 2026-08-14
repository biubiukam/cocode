/**
 * GUI Loader graph. Each row is a static import — not a Host `/plugins` URL.
 * Adding a user-visible capability is one directory plus one row here.
 */

import * as slots from '../plugins/slots/apply.ts'
import * as nodes from '../plugins/nodes/apply.ts'
import * as panels from '../plugins/panels/apply.ts'
import * as shortcuts from '../plugins/shortcuts/apply.ts'
import * as layout from '../plugins/layout/apply.ts'
import * as focus from '../plugins/focus/apply.ts'
import * as connection from '../plugins/connection/apply.ts'
import * as sessions from '../plugins/sessions/apply.ts'
import * as commands from '../plugins/commands/apply.ts'
import * as terminals from '../plugins/terminals/apply.ts'
import * as pluginSettings from '../plugins/plugin-settings/apply.ts'
import * as account from '../plugins/account/apply.ts'
import * as providers from '../plugins/providers/apply.ts'
import * as theme from '../plugins/theme/apply.ts'
import * as toast from '../plugins/toast/apply.ts'
import * as shell from '../plugins/shell/apply.ts'
import * as connectionGate from '../plugins/connection-gate/apply.ts'
import * as conversation from '../plugins/conversation/apply.ts'
import * as tool from '../plugins/tool/apply.ts'
import * as files from '../plugins/files/apply.ts'
import * as git from '../plugins/git/apply.ts'
import * as terminal from '../plugins/terminal/apply.ts'
import * as preview from '../plugins/preview/apply.ts'
import * as browser from '../plugins/browser/apply.ts'
import * as trajectory from '../plugins/trajectory/apply.ts'
import * as jobs from '../plugins/jobs/apply.ts'
import * as pluginPage from '../plugins/plugin-page/apply.ts'
import * as automation from '../plugins/automation/apply.ts'
import * as onboarding from '../plugins/onboarding/apply.ts'

export type RosterPlugin = {
  name: string
  inject?: string[]
  apply: (ctx: never, config?: unknown) => unknown
}

export const roster: readonly { id: string; plugin: RosterPlugin }[] = [
  { id: 'slots', plugin: slots },
  { id: 'nodes', plugin: nodes },
  { id: 'panels', plugin: panels },
  { id: 'shortcuts', plugin: shortcuts },
  { id: 'layout', plugin: layout },
  { id: 'focus', plugin: focus },
  { id: 'connection', plugin: connection },
  { id: 'sessions', plugin: sessions },
  { id: 'commands', plugin: commands },
  { id: 'terminals', plugin: terminals },
  { id: 'plugin-settings', plugin: pluginSettings },
  { id: 'account', plugin: account },
  { id: 'providers', plugin: providers },
  { id: 'theme', plugin: theme },
  { id: 'toast', plugin: toast },
  { id: 'shell', plugin: shell },
  { id: 'connection-gate', plugin: connectionGate },
  { id: 'conversation', plugin: conversation },
  { id: 'tool', plugin: tool },
  { id: 'files', plugin: files },
  { id: 'git', plugin: git },
  { id: 'terminal', plugin: terminal },
  { id: 'preview', plugin: preview },
  { id: 'browser', plugin: browser },
  { id: 'trajectory', plugin: trajectory },
  { id: 'jobs', plugin: jobs },
  { id: 'plugin-page', plugin: pluginPage },
  { id: 'automation', plugin: automation },
  { id: 'onboarding', plugin: onboarding },
]
