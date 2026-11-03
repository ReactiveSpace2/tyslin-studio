import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'path'
import * as db from './db'
import { setSecret, getSecret } from './secrets'
import { listProjectFiles, runtimeFor } from './runtime'
import { checkForUpdates, getUpdateStatus, initUpdater, installUpdate, openUpdateDownload } from './updater'
import type { AgentInput, ProviderSettings, StreamEvent } from '@shared/types'

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

function emit(e: StreamEvent): void {
  win?.webContents.send('stream', e)
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
    // Run in the background; the renderer listens to stream events.
    void (async () => {
      try {
        const reply = await runtimeFor(agent).run({
          agent,
          skills: db.listSkills(),
          project,
          history: db.listMessages(sessionId),
          onDelta: (t) => emit({ sessionId, type: 'delta', text: t })
        })
        db.addMessage(sessionId, 'assistant', reply)
        emit({ sessionId, type: 'done' })
      } catch (err) {
        emit({ sessionId, type: 'error', error: err instanceof Error ? err.message : String(err) })
      }
    })()
  })

  ipcMain.handle('skills:list', () => db.listSkills())

  ipcMain.handle('settings:get', (): ProviderSettings => ({
    anthropicKeySet: !!getSecret('anthropic'),
    openaiKeySet: !!getSecret('openai'),
    ollamaUrl: db.getSetting('ollamaUrl') || 'http://localhost:11434'
  }))
  ipcMain.handle('settings:setKey', (_e, provider: 'anthropic' | 'openai', key: string) => setSecret(provider, key.trim()))
  ipcMain.handle('settings:setOllamaUrl', (_e, url: string) => db.setSetting('ollamaUrl', url.trim()))

  ipcMain.handle('updates:status', () => getUpdateStatus())
  ipcMain.handle('updates:check', () => checkForUpdates())
  ipcMain.handle('updates:install', () => installUpdate())
  ipcMain.handle('updates:openDownload', () => openUpdateDownload())
}

app.whenReady().then(() => {
  app.setAppUserModelId('ai.tyslin.studio')
  db.openDb()
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
