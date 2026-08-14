/**
 * Electron main process: window, menu, harness lifecycle, and the native side of
 * the HostBridge.
 *
 * Security baseline is not negotiable (RFC §4.2): context isolation on, Node
 * integration off, sandbox on. `webviewTag` is the single deliberate exception —
 * the Browser panel needs an embedded view — and every attach is filtered below.
 */

import { app, BrowserWindow, globalShortcut, ipcMain, shell, webContents } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { IPC } from './ipc.ts'
import { HarnessProcess } from './harness-process.ts'
import { AccountAuth } from './account-auth.ts'

const here = dirname(fileURLToPath(import.meta.url))
const devServerUrl = process.env.COCODE_DEV_SERVER_URL

const harness = new HarnessProcess()
const account = new AccountAuth()
let mainWindow: BrowserWindow | undefined
const registeredShortcuts = new Map<string, string>()

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 760,
    minHeight: 560,
    show: false,
    // The shell draws its own title bar into the sidebar's brand row.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'darwin' ? {} : { titleBarOverlay: false, frame: false }),
    backgroundColor: '#ffffff', // design-token-exempt: native frame paint before CSS loads
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  })

  window.once('ready-to-show', () => window.show())
  window.on('maximize', () => window.webContents.send(IPC.windowMaximizedChanged, true))
  window.on('unmaximize', () => window.webContents.send(IPC.windowMaximizedChanged, false))
  window.on('closed', () => { mainWindow = undefined })

  // A link that wants a new window opens in the user's browser instead: the shell
  // is a single-window product and an unmanaged Electron window has no chrome.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Embedded views may not gain Node or a preload of their own.
  window.webContents.on('will-attach-webview', (_event, webPreferences, params) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    params.allowpopups = 'false'
  })

  if (devServerUrl !== undefined) void window.loadURL(devServerUrl)
  else void window.loadFile(join(here, '../dist/index.html'))

  return window
}

function registerIpc(): void {
  ipcMain.handle(IPC.harnessResolve, () => harness.start())
  ipcMain.handle(IPC.harnessRestart, () => harness.restart())

  ipcMain.handle(IPC.windowMinimize, () => { mainWindow?.minimize() })
  ipcMain.handle(IPC.windowToggleMaximize, () => {
    if (mainWindow === undefined) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.handle(IPC.windowClose, () => { mainWindow?.close() })
  ipcMain.handle(IPC.windowIsMaximized, () => mainWindow?.isMaximized() ?? false)

  ipcMain.handle(IPC.webviewOpenDevTools, (_event, webContentsId: number) => {
    webContents.fromId(webContentsId)?.openDevTools({ mode: 'detach' })
  })

  ipcMain.handle(IPC.shortcutRegister, (_event, accelerator: string, id: string) => {
    if (registeredShortcuts.has(accelerator)) return true
    const ok = globalShortcut.register(accelerator, () => {
      mainWindow?.webContents.send(IPC.shortcutTriggered, id)
    })
    if (ok) registeredShortcuts.set(accelerator, id)
    return ok
  })
  ipcMain.handle(IPC.shortcutUnregister, (_event, accelerator: string) => {
    globalShortcut.unregister(accelerator)
    registeredShortcuts.delete(accelerator)
  })

  ipcMain.handle(IPC.accountSnapshot, () => account.snapshot())
  ipcMain.handle(IPC.accountSignIn, () => account.signIn())
  ipcMain.handle(IPC.accountSignOut, () => account.signOut())
  ipcMain.handle(IPC.accountCloudProvision, () => account.cloudProvision())
}

// A second instance would start a second embedded harness against the same
// session store; focus the existing window instead.
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (mainWindow === undefined) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    registerIpc()
    harness.onStateChange(info => mainWindow?.webContents.send(IPC.harnessState, info))
    account.onChange(profile => mainWindow?.webContents.send(IPC.accountChanged, profile))
    mainWindow = createWindow()
    void harness.start()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  // Both hooks run: `will-quit` covers the ordinary path, `before-quit` covers a
  // quit initiated while windows are still closing. Killing twice is harmless.
  app.on('before-quit', () => harness.stop())
  app.on('will-quit', () => {
    harness.stop()
    globalShortcut.unregisterAll()
  })
}
