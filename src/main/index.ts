import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from 'electron'
import { basename, join } from 'path'
import { randomUUID } from 'crypto'
import { readFileSync, statSync, writeFileSync } from 'fs'
import * as db from './db'
import { setSecret, getSecret } from './secrets'
import { answerPermission, cancelRunPermissions, runtimeFor } from './runtime'
import { expireRunChanges, listProjectFiles, resolveChange } from './tools'
import { cancelInstall, engineLaunch, engineStatus, listEngines, runInstall, setEngineCommand } from './engines'
import { testAcp } from './acp'
import { authStatus, cancelSignIn, signIn, signOut } from './auth'
import { pickAttachments, prepareAttachments } from './attachments'
import { checkPacks, claudeCatalog, discoverPacks, installPack, listPacks, uninstallPack } from './skillPacks'
import { parseSkillFile, serializeSkill, validateSkill } from './skillFiles'
import { checkForUpdates, getUpdateStatus, initUpdater, installUpdate, openUpdateDownload } from './updater'
import { nextRunAfter } from '@shared/schedule'
import type { ScheduledTask, TaskInput, AgentInput, AppInfo, ExternalEngineId, KeyProvider, Preferences, ProviderSettings, RunEvent, RunEventBody, SkillImportResult, SkillInput } from '@shared/types'

let win: BrowserWindow | null = null
/** Replies in progress, by session, so they can be stopped. */
const activeRuns = new Map<string, { runId: string; controller: AbortController }>()

/** Page backgrounds, matching --parchment in styles.css, so the window doesn't flash before the UI paints. */
const BACKGROUND = { light: '#FAFAF7', dark: '#121210' }

/** Height of the app's own title bar (`.titlebar` in styles.css). */
const TITLEBAR_HEIGHT = 44
const isMac = process.platform === 'darwin'

/** Window buttons drawn by the system over the right of the title bar on Windows and Linux, in theme colours. */
const titleBarOverlay = (): Electron.TitleBarOverlayOptions => {
  // The title bar is 44 CSS px, so its on-screen height grows with the zoom; the buttons follow it.
  const height = Math.round(TITLEBAR_HEIGHT * db.getPrefs().zoom)
  return nativeTheme.shouldUseDarkColors
    ? { color: BACKGROUND.dark, symbolColor: '#F3F3EE', height }
    : { color: BACKGROUND.light, symbolColor: '#0F0F0D', height }
}

/** Applies the saved zoom to the page and the window buttons, and tells the renderer. */
function applyZoom(): void {
  if (!win) return
  const zoom = db.getPrefs().zoom
  win.webContents.setZoomFactor(zoom)
  if (!isMac) win.setTitleBarOverlay(titleBarOverlay())
  win.webContents.send('zoom:changed', zoom)
}

/** Light, dark or the system setting. The renderer's CSS follows it through prefers-color-scheme. */
function applyTheme(): void {
  nativeTheme.themeSource = db.getPrefs().theme
  win?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light)
  if (win && !isMac) win.setTitleBarOverlay(titleBarOverlay())
}

/**
 * Saves the user's message and starts the agent's reply in the background (chat and scheduled tasks).
 * The renderer follows the run through run events; `done` settles when the run ends.
 */
function startRun(sessionId: string, text: string, attachments: ReturnType<typeof prepareAttachments> = { attachments: [], context: '' }): { runId: string; done: Promise<{ ok: boolean; error?: string }> } {
  const session = db.getSession(sessionId)
  if (!session) throw new Error('Session not found')
  const agent = db.getAgent(session.agentId)
  if (!agent) throw new Error('Agent not found')
  if (activeRuns.has(sessionId)) throw new Error(`${agent.name} is still working on the last message.`)
  db.addMessage(sessionId, 'user', text, attachments)
  const project = session.projectId && agent.kind === 'agent' ? db.getProject(session.projectId) : null
  const runId = randomUUID()
  const controller = new AbortController()
  activeRuns.set(sessionId, { runId, controller })
  const send = (e: RunEventBody): void => emit({ ...e, runId, sessionId })
  const done = (async () => {
    send({ type: 'run_started' })
    try {
      const reply = await runtimeFor(agent).run({
        runId,
        sessionId,
        agent,
        skills: db.listSkills(),
        project,
        history: db.listModelMessages(sessionId),
        emit: send,
        signal: controller.signal
      })
      if (reply) db.addMessage(sessionId, 'assistant', reply)
      send({ type: 'run_finished' })
      return { ok: true }
    } catch (err) {
      const message = controller.signal.aborted ? 'Stopped.' : err instanceof Error ? err.message : String(err)
      send({ type: 'run_error', error: message })
      return { ok: false, error: message }
    } finally {
      activeRuns.delete(sessionId)
      expireRunChanges(runId)
      cancelRunPermissions(runId)
    }
  })()
  return { runId, done }
}

/**
 * Runs a task in a new chat titled after it. Scheduled runs also move the task to its next time.
 * The result is written when the reply ends; the renderer hears `tasks:changed` either way.
 */
function runTask(t: ScheduledTask, scheduled: boolean): string {
  const now = Date.now()
  const next = scheduled ? nextRunAfter(t.schedule, now) : undefined
  try {
    const s = db.createSession(t.agentId, t.projectId)
    const { done } = startRun(s.id, t.prompt)
    db.setSessionTitle(s.id, t.name)
    db.markTaskRun(t.id, { lastRunAt: now, lastStatus: 'running', lastSessionId: s.id, nextRunAt: next })
    win?.webContents.send('tasks:changed')
    void done.then((r) => {
      db.markTaskRun(t.id, { lastStatus: r.ok ? 'ok' : 'error', lastError: r.error ?? '' })
      win?.webContents.send('tasks:changed')
    })
    return s.id
  } catch (err) {
    db.markTaskRun(t.id, { lastRunAt: now, lastStatus: 'error', lastError: err instanceof Error ? err.message : String(err), nextRunAt: next })
    win?.webContents.send('tasks:changed')
    throw err
  }
}

/** Every 30 seconds, start the current organization's tasks that are due. Missed runs while the app was closed run once on launch. */
function startScheduler(): void {
  const tick = (): void => {
    for (const t of db.dueTasks(Date.now())) {
      try { runTask(t, true) } catch { /* recorded on the task */ }
    }
  }
  setTimeout(tick, 5000)
  setInterval(tick, 30_000)
}

function createWindow(): void {
  applyTheme()
  // No File/Edit/View menu bar on Windows and Linux; the app draws its own title bar. macOS keeps its menu in the system bar.
  if (!isMac) Menu.setApplicationMenu(null)
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    title: 'Tyslin Studio',
    backgroundColor: nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light,
    icon: join(__dirname, '../../resources/icon.png'),
    titleBarStyle: 'hidden',
    ...(isMac ? { trafficLightPosition: { x: 16, y: 15 } } : { titleBarOverlay: titleBarOverlay() }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  // Zoom survives reloads (the shortcuts live in the renderer, ZoomControl.tsx).
  win.webContents.on('did-finish-load', applyZoom)
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
  ipcMain.handle('attachments:pick', (_e, kind: 'file' | 'folder') => pickAttachments(win!, kind === 'folder' ? 'folder' : 'file'))
  ipcMain.handle('sessions:send', async (_e, sessionId: string, text: string, attachmentIds: string[] = []) => {
    startRun(sessionId, text, prepareAttachments(Array.isArray(attachmentIds) ? attachmentIds : []))
  })
  ipcMain.handle('sessions:stop', (_e, sessionId: string) => {
    const run = activeRuns.get(sessionId)
    if (!run) return
    run.controller.abort()
    // Unblock a run that is waiting on the user, so it can wind down.
    expireRunChanges(run.runId)
    cancelRunPermissions(run.runId)
  })
  ipcMain.handle('sessions:answerPermission', (_e, permissionId: string, choiceId: string | null) => answerPermission(permissionId, choiceId))

  ipcMain.handle('engines:list', () => listEngines())
  ipcMain.handle('engines:setCommand', (_e, id: ExternalEngineId, command: string) => setEngineCommand(id, command))
  ipcMain.handle('engines:install', async (_e, id: ExternalEngineId) => {
    const r = await runInstall(id, (text) => win?.webContents.send('engines:installOutput', { id, text }))
    return { ...r, status: engineStatus(id) }
  })
  ipcMain.handle('engines:cancelInstall', (_e, id: ExternalEngineId) => cancelInstall(id))
  ipcMain.handle('engines:test', async (_e, id: ExternalEngineId) => {
    try {
      return await testAcp(engineStatus(id).name, engineLaunch(id, app.getPath('home')), app.getVersion())
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })


  ipcMain.handle('changes:list', (_e, sessionId: string) => db.listChanges(sessionId))
  ipcMain.handle('changes:resolve', (_e, id: string, acceptedHunks: number[], note: string) => resolveChange(id, acceptedHunks, note))

  ipcMain.handle('skills:list', () => db.listSkills())
  ipcMain.handle('skillPacks:list', () => listPacks())
  ipcMain.handle('skillPacks:check', () => checkPacks())
  ipcMain.handle('skillPacks:discover', (_e, query: string, page: number) => discoverPacks(String(query ?? ''), Number(page) || 1))
  ipcMain.handle('skillPacks:install', (_e, id: string) => installPack(id))
  ipcMain.handle('skillPacks:uninstall', (_e, id: string) => uninstallPack(id))
  ipcMain.handle('skillPacks:claudeCatalog', () => claudeCatalog())
  ipcMain.handle('skills:save', (_e, input: SkillInput) => {
    const s = { ...input, name: input.name.trim(), description: input.description.trim(), body: input.body.trim() }
    const problem = validateSkill(s)
    if (problem) throw new Error(problem)
    if (db.skillNameTaken(s.name, s.id)) throw new Error(`A skill called ${s.name} already exists.`)
    return db.saveSkill(s)
  })
  ipcMain.handle('skills:remove', (_e, id: string) => db.removeSkill(id))
  ipcMain.handle('skills:importFiles', async (): Promise<SkillImportResult> => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Import skills',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]
    })
    const result: SkillImportResult = { imported: [], skipped: [] }
    if (r.canceled) return result
    for (const file of r.filePaths) {
      const label = basename(file)
      try {
        if (statSync(file).size > 200_000) throw new Error('file is over 200 KB')
        const s = parseSkillFile(readFileSync(file, 'utf8'), label)
        const problem = validateSkill(s)
        if (problem) throw new Error(problem)
        if (db.skillNameTaken(s.name)) throw new Error(`a skill called ${s.name} already exists`)
        result.imported.push(db.saveSkill(s))
      } catch (err) {
        result.skipped.push(`${label}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    return result
  })
  ipcMain.handle('skills:exportFile', async (_e, id: string) => {
    const s = db.getSkill(id)
    if (!s) throw new Error('Skill not found')
    const r = await dialog.showSaveDialog(win!, { title: 'Export skill', defaultPath: `${s.name}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] })
    if (r.canceled || !r.filePath) return false
    writeFileSync(r.filePath, serializeSkill(s), 'utf8')
    return true
  })

  ipcMain.handle('settings:get', (): ProviderSettings => ({
    anthropicKeySet: !!getSecret('anthropic'),
    openaiKeySet: !!getSecret('openai'),
    geminiKeySet: !!getSecret('gemini'),
    ollamaUrl: db.getSetting('ollamaUrl') || 'http://localhost:11434'
  }))
  ipcMain.handle('settings:setKey', (_e, provider: KeyProvider, key: string) => setSecret(provider, key.trim()))
  ipcMain.handle('settings:setOllamaUrl', (_e, url: string) => db.setSetting('ollamaUrl', url.trim()))
  ipcMain.handle('settings:prefs', () => db.getPrefs())
  ipcMain.handle('settings:setPrefs', (_e, p: Partial<Preferences>) => {
    const next = db.setPrefs(p)
    if (p.theme) applyTheme()
    if (typeof p.zoom === 'number') applyZoom()
    return next
  })

  ipcMain.handle('auth:status', () => authStatus())
  ipcMain.handle('auth:signIn', () => signIn())
  ipcMain.handle('auth:cancelSignIn', () => cancelSignIn())
  ipcMain.handle('auth:signOut', () => signOut())
  ipcMain.handle('app:dashboard', () => db.dashboardStats())
  ipcMain.handle('tasks:list', () => db.listTasks())
  ipcMain.handle('tasks:save', (_e, input: TaskInput) =>
    db.saveTask(input, input.enabled ? nextRunAfter(input.schedule, Date.now()) : null))
  ipcMain.handle('tasks:remove', (_e, id: string) => db.removeTask(id))
  ipcMain.handle('tasks:runNow', (_e, id: string) => {
    const t = db.getTask(id)
    if (!t) throw new Error('That task no longer exists.')
    return runTask(t, false)
  })
  ipcMain.handle('orgs:list', () => db.listOrgs())
  ipcMain.handle('orgs:create', (_e, name: string) => db.createOrg(String(name ?? '')))
  ipcMain.handle('orgs:rename', (_e, id: string, name: string) => db.renameOrg(id, String(name ?? '')))
  ipcMain.handle('orgs:switch', (_e, id: string) => {
    if (activeRuns.size) throw new Error('An agent is still replying. Stop it or wait, then switch.')
    db.switchOrg(id)
  })
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
  startScheduler()
  // With the System theme, keep the window buttons and background in step when the OS switches.
  nativeTheme.on('updated', () => {
    win?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light)
    if (win && !isMac) win.setTitleBarOverlay(titleBarOverlay())
  })
  initUpdater(win!)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
