import { app, BrowserWindow, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '../shared/updater-types'

autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

let state: UpdateState = {
  status: 'idle',
  currentVersion: app.getVersion()
}

function broadcastUpdateState(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('update:state', state)
    }
  }
}

function setState(partial: Partial<UpdateState>): void {
  state = { ...state, currentVersion: app.getVersion(), ...partial }
  broadcastUpdateState()
}

export function getUpdateState(): UpdateState {
  return { ...state, currentVersion: app.getVersion() }
}

export function initAutoUpdater(): void {
  if (!app.isPackaged) {
    setState({
      status: 'unsupported',
      message: 'Updates run in the installed app only (not dev mode).'
    })
    return
  }

  autoUpdater.on('checking-for-update', () => {
    setState({ status: 'checking', message: 'Checking for updates…' })
  })

  autoUpdater.on('update-available', (info) => {
    setState({
      status: 'available',
      availableVersion: info.version,
      message: `Update ${info.version} is available. Downloading…`
    })
  })

  autoUpdater.on('update-not-available', () => {
    setState({
      status: 'not-available',
      message: 'You are on the latest version.'
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    setState({
      status: 'downloading',
      percent: Math.round(progress.percent),
      message: `Downloading update… ${Math.round(progress.percent)}%`
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    setState({
      status: 'downloaded',
      availableVersion: info.version,
      message: `Update ${info.version} is ready. Restart to install.`
    })

    void promptRestart(info.version)
  })

  autoUpdater.on('error', (error) => {
    setState({
      status: 'error',
      message: error.message || 'Update check failed'
    })
  })

  setTimeout(() => {
    void checkForUpdates()
  }, 8000)
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (!app.isPackaged) {
    setState({
      status: 'unsupported',
      message: 'Updates are disabled in development.'
    })
    return getUpdateState()
  }

  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    setState({
      status: 'error',
      message: error instanceof Error ? error.message : 'Update check failed'
    })
  }

  return getUpdateState()
}

export async function quitAndInstall(): Promise<void> {
  if (!app.isPackaged) return

  for (const window of BrowserWindow.getAllWindows()) {
    window.destroy()
  }

  // Silent install on Windows — avoids the full NSIS wizard while the app is still open
  autoUpdater.quitAndInstall(true, true)
}

async function promptRestart(version: string): Promise<void> {
  const focused = BrowserWindow.getFocusedWindow()
  const result = await dialog.showMessageBox(focused ?? undefined, {
    type: 'info',
    title: 'Update ready',
    message: `Exchange Bureau ${version} has been downloaded.`,
    detail: 'Restart the app now to install the update.',
    buttons: ['Restart now', 'Later'],
    defaultId: 0,
    cancelId: 1
  })

  if (result.response === 0) {
    await quitAndInstall()
  }
}
