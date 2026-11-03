import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'path'
import { randomUUID } from 'crypto'
import * as db from './db'
import { setSecret, getSecret } from './secrets'
import { runtimeFor } from './runtime'
import { listProjectFiles, resolveChange } from './tools'
import { checkForUpdates, getUpdateStatus, initUpdater, installUpdate, openUpdateDownload } from './updater'
import type { AgentInput, AppInfo, KeyProvider, Preferences, ProviderSettings, RunEvent, RunEventBody } from '@shared/types'

let win: BrowserWindow | null = null

function createWindow(): void {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    title: 'Tyslin Studio',
    backgroundColor: '#FAFAF7',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

function emit(e: RunEvent): void {
  win?.webContents.send('run-event', e)
}

function registerIpc(): void {
  ipcMain.handle('agents:list', () => db.listAgents())
  ipcMain.handle('agents:get', (_e, id: string) => db.getAgent(id))
  ipcMain.handle('agents:save', (_e, input: AgentInput & { id?: string }) => db.saveAgent(input))
  ipcMain.handle('agents:remove', (_e, id: string) => db.removeAgent(id))

  ipcMain.handle('projects:list', () => db.listProjects())
  ipcMain.handle('projects:create', (_e, name: string, folder: string | null) => db.createProject(name, folder))
  ipcMain.handle('projects:pickFolder', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('projects:files', (_e, id: string) => {
    const p = db.getProject(id)
    return p?.folder ? listProjectFiles(p.folder) : []
  })

  ipcMain.handle('sessions:list', (_e, agentId?: string) => db.listSessions(agentId))
  ipcMain.handle('sessions:create', (_e, agentId: string, projectId: string | null) => db.createSession(agentId, projectId))
  ipcMain.handle('sessions:messages', (_e, id: string) => db.listMessages(id))
  ipcMain.handle('sessions:send', async (_e, sessionId: string, text: string) => {
    const session = db.getSession(sessionId)
    if (!session) throw new Error('Session not found')
    const agent = db.getAgent(session.agentId)
    if (!agent) throw new Error('Agent not found')
    db.addMessage(sessionId, 'user', text)
    const project = session.projectId ? db.getProject(session.projectId) : null
    const runId = randomUUID()
    const send = (e: RunEventBody): void => emit({ ...e, runId, sessionId })
    // Run in the background; the renderer listens to run events.
    void (async () => {
      send({ type: 'run_started' })
      try {
        const reply = await runtimeFor(agent).run({
          runId,
          sessionId,
          agent,
          skills: db.listSkills(),
          project,
          history: db.listMessages(sessionId),
          emit: send
        })
        if (reply) db.addMessage(sessionId, 'assistant', reply)
        send({ type: 'run_finished' })
      } catch (err) {
        send({ type: 'run_error', error: err instanceof Error ? err.message : String(err) })
      }
    })()
  })

  ipcMain.handle('changes:list', (_e, sessionId: string) => db.listChanges(sessionId))
  ipcMain.handle('changes:resolve', (_e, id: string, acceptedHunks: number[], note: string) => resolveChange(id, acceptedHunks, note))

  ipcMain.handle('skills:list', () => db.listSkills())

  ipcMain.handle('settings:get', (): ProviderSettings => ({
    anthropicKeySet: !!getSecret('anthropic'),
    openaiKeySet: !!getSecret('openai'),
    geminiKeySet: !!getSecret('gemini'),
    ollamaUrl: db.getSetting('ollamaUrl') || 'http://localhost:11434'
  }))
  ipcMain.handle('settings:setKey', (_e, provider: KeyProvider, key: string) => setSecret(provider, key.trim()))
  ipcMain.handle('settings:setOllamaUrl', (_e, url: string) => db.setSetting('ollamaUrl', url.trim()))
  ipcMain.handle('settings:prefs', () => db.getPrefs())
  ipcMain.handle('settings:setPrefs', (_e, p: Partial<Preferences>) => db.setPrefs(p))

  ipcMain.handle('app:info', (): AppInfo => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: `${process.platform} ${process.arch}`,
    dataPath: app.getPath('userData')
  }))
  ipcMain.handle('app:openDataFolder', () => shell.openPath(app.getPath('userData')).then(() => undefined))

  ipcMain.handle('updates:status', () => getUpdateStatus())
  ipcMain.handle('updates:check', () => checkForUpdates())
  ipcMain.handle('updates:install', () => installUpdate())
  ipcMain.handle('updates:openDownload', () => openUpdateDownload())
}

app.whenReady().then(() => {
  app.setAppUserModelId('ai.tyslin.studio')
  db.openDb()
  db.expireStaleChanges()
  registerIpc()
  createWindow()
  initUpdater(win!)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
