/**
 * Exposes the HostBridge to the renderer over `contextBridge`.
 *
 * Bundled as CommonJS: a sandboxed preload has no ESM loader. Nothing here does
 * work of its own — it forwards to the main process, so the renderer's reachable
 * surface is exactly the channels listed in `ipc.ts`.
 */

import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from './ipc.ts'
import type { AccountProfile, CloudProvision, HarnessEndpointInfo, HostBridge } from '../src/host/bridge.ts'

/** Subscribes to a main→renderer channel and returns the unsubscribe function. */
function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: unknown, payload: T) => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => { ipcRenderer.off(channel, handler) }
}

const bridge: HostBridge = {
  platform: 'electron',

  harness: {
    resolve: () => ipcRenderer.invoke(IPC.harnessResolve) as Promise<HarnessEndpointInfo>,
    restart: () => ipcRenderer.invoke(IPC.harnessRestart) as Promise<HarnessEndpointInfo>,
    onStateChange: listener => subscribe<HarnessEndpointInfo>(IPC.harnessState, listener),
  },

  embeddedBrowser: {
    kind: 'webview',
    openDevTools: webContentsId => ipcRenderer.invoke(IPC.webviewOpenDevTools, webContentsId) as Promise<void>,
  },

  window: {
    minimize: () => { void ipcRenderer.invoke(IPC.windowMinimize) },
    toggleMaximize: () => { void ipcRenderer.invoke(IPC.windowToggleMaximize) },
    close: () => { void ipcRenderer.invoke(IPC.windowClose) },
    isMaximized: () => ipcRenderer.invoke(IPC.windowIsMaximized) as Promise<boolean>,
    onMaximizedChange: listener => subscribe<boolean>(IPC.windowMaximizedChanged, listener),
    // macOS traffic lights sit in the frame; other platforms draw their own controls on the right.
    trafficLightInset: process.platform === 'darwin' ? 78 : 0,
  },

  globalShortcut: {
    register: (accelerator, id) => ipcRenderer.invoke(IPC.shortcutRegister, accelerator, id) as Promise<boolean>,
    unregister: accelerator => ipcRenderer.invoke(IPC.shortcutUnregister, accelerator) as Promise<void>,
    onTriggered: listener => subscribe<string>(IPC.shortcutTriggered, listener),
  },

  account: {
    snapshot: () => ipcRenderer.invoke(IPC.accountSnapshot) as Promise<AccountProfile | null>,
    signIn: () => ipcRenderer.invoke(IPC.accountSignIn) as Promise<void>,
    signOut: () => ipcRenderer.invoke(IPC.accountSignOut) as Promise<void>,
    cloudProvision: () => ipcRenderer.invoke(IPC.accountCloudProvision) as Promise<CloudProvision | null>,
    onChange: listener => subscribe<AccountProfile | null>(IPC.accountChanged, listener),
  },
}

contextBridge.exposeInMainWorld('cocode', bridge)
