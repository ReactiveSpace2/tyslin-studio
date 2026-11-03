import { app, shell, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '@shared/types'

const RELEASES = 'https://github.com/ReactiveSpace2/tyslin-studio/releases'
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

let status: UpdateStatus = { state: 'idle', currentVersion: app.getVersion(), autoInstall: false }
let win: BrowserWindow | null = null

/**
 * Whether this install can replace itself. Windows (NSIS) and the Linux AppImage can.
 * macOS needs a signed, notarised build before Squirrel will install an update, and .deb
 * installs are owned by the package manager, so those get a "download the new version" notice.
 */
function canAutoInstall(): boolean {
  if (process.platform === 'win32') return true
  if (process.platform === 'linux') return !!process.env['APPIMAGE']
  return false
}

function set(next: Partial<UpdateStatus>): void {
  status = { ...status, ...next }
  win?.webContents.send('updates:status', status)
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  // Dev builds have no release metadata to compare against.
  if (!app.isPackaged) return status
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    set({ state: 'error', error: err instanceof Error ? err.message : String(err) })
  }
  return status
}

export function installUpdate(): void {
  if (status.state === 'ready') autoUpdater.quitAndInstall()
}

export function openUpdateDownload(): void {
  void shell.openExternal(status.downloadUrl ?? `${RELEASES}/latest`)
}

export function initUpdater(window: BrowserWindow): void {
  win = window
  const auto = canAutoInstall()
  set({ autoInstall: auto })
  if (!app.isPackaged) return

  autoUpdater.autoDownload = auto
  autoUpdater.autoInstallOnAppQuit = auto

  autoUpdater.on('checking-for-update', () => set({ state: 'checking', error: undefined }))
  autoUpdater.on('update-not-available', () => set({ state: 'none' }))
  autoUpdater.on('update-available', (info) =>
    set({
      state: auto ? 'downloading' : 'available',
      version: info.version,
      percent: 0,
      downloadUrl: `${RELEASES}/tag/v${info.version}`
    })
  )
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => set({ state: 'ready', version: info.version, percent: 100 }))
  autoUpdater.on('error', (err) => set({ state: 'error', error: err.message }))

  // Let the window finish loading before the first check, then re-check while the app stays open.
  setTimeout(() => void checkForUpdates(), 10_000)
  setInterval(() => void checkForUpdates(), CHECK_EVERY_MS)
}
