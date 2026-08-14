/**
 * The IPC channel names shared by the main process and the preload. Keeping them
 * in one module is what makes the preload's `contextBridge` surface auditable:
 * anything not listed here cannot cross the process line.
 */

export const IPC = {
  harnessResolve: 'cocode:harness/resolve',
  harnessRestart: 'cocode:harness/restart',
  harnessState: 'cocode:harness/state',

  windowMinimize: 'cocode:window/minimize',
  windowToggleMaximize: 'cocode:window/toggle-maximize',
  windowClose: 'cocode:window/close',
  windowIsMaximized: 'cocode:window/is-maximized',
  windowMaximizedChanged: 'cocode:window/maximized-changed',

  webviewOpenDevTools: 'cocode:webview/open-devtools',

  shortcutRegister: 'cocode:shortcut/register',
  shortcutUnregister: 'cocode:shortcut/unregister',
  shortcutTriggered: 'cocode:shortcut/triggered',

  accountSnapshot: 'cocode:account/snapshot',
  accountSignIn: 'cocode:account/sign-in',
  accountSignOut: 'cocode:account/sign-out',
  accountCloudProvision: 'cocode:account/cloud-provision',
  accountChanged: 'cocode:account/changed',
} as const
