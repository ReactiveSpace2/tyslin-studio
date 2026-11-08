import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, Notification, shell } from 'electron'
import { basename, join } from 'path'
import { randomUUID } from 'crypto'
import { existsSync, readFileSync, statSync, writeFileSync } from 'fs'
import * as db from './db'
import { setSecret, getSecret } from './secrets'
import { answerPermission, cancelRunPermissions, runtimeFor } from './runtime'
import { expireRunChanges, listProjectFiles, resolveChange } from './tools'
import { cancelInstall, deleteHermesProfile, engineLaunch, engineStatus, listEngines, runInstall, setEngineCommand } from './engines'
import { testAcp } from './acp'
import { driveCopyIn, driveList, driveMkdir, driveMove, driveOpen, drivePreview, driveRemove, driveRename, driveReveal, driveUpload } from './drive'
import { defaultModel, isStudioAssistant, studioAssistant, syncStudioAssistant } from './defaultModel'
import { DEFAULT_MODEL_AGENT } from '@shared/models'
import { inWorkspace } from '@shared/scope'
import { createProjectFolder, newProjectFolderPath, defaultProject, defaultProjectFolder, defaultProjectName, setDefaultProjectName, listStudioFiles, projectFor, readStudioFile, removeStudioFile, revealStudioFile, writeStudioFile } from './studio'
import { initTelegram, sendToLinkedChats, newLinkCode, notifyTask, onRunEvent, setTelegramNotify, setTelegramToken, telegramStatus, unlinkChat } from './telegram'
import { authStatus, cancelSignIn, connectDrive, disconnectDrive, signIn, signOut } from './auth'
import { cancelOpenRouter, connectOpenRouter, openRouterAccount } from './openrouterAuth'
import { removeIntegration, saveIntegration, testIntegration } from './integrations'
import { searchRegistry } from './mcpRegistry'
import { listMemory, readMemory, writeMemory } from './memory'
import { accountStatuses, cancelAccountSignIn, setUseAccount, signInAccount } from './accounts'
import { resetEverything, resetting } from './reset'
import { gdriveStatus, initGDrive, resetSyncState, setAutoSync, syncAll } from './gdrive'
import { pickAttachments, prepareAttachments } from './attachments'
import { checkPacks, claudeCatalog, discoverPacks, installPack, listPacks, uninstallPack } from './skillPacks'
import { parseSkillFile, serializeSkill, validateSkill } from './skillFiles'
import { checkForUpdates, getUpdateStatus, initUpdater, installUpdate, openUpdateDownload } from './updater'
import { nextRunAfter } from '@shared/schedule'
import { createAgency, removeAgency, updateAgency } from './agencies'
import { cardsOnRunEvent, initCards, onChangeResolved, briefLead, planNow, runCard, runningCards } from './cards'
import { boardHooks, setBoardChangedHook } from './boardTools'
import { initChannels, replyToLead, sendToBoss, setChannelMessageHook } from './channels'
import { initSlack, newSlackLinkCode, setSlackToken, slackStatus, unlinkSlackChannel } from './slack'
import type { AccountEngine, McpServerInput, AgencyCreateInput, AgencyUpdateInput, Agent, ChannelMessage, AgentStatus, AgentTestResult, AskResult, StudioKind, TelegramNotify, OrgColor, ScheduledTask, TaskInput, AgentInput, AppInfo, ExternalEngineId, KeyProvider, OnboardingInput, OnboardingStatus, OpenRouterModel, Preferences, ProviderSettings, RunEvent, RunEventBody, SkillImportResult, SkillInput } from '@shared/types'

let win: BrowserWindow | null = null
/** Replies in progress, by session, so they can be stopped. */
const activeRuns = new Map<string, { runId: string; controller: AbortController }>()

const REPO = 'ReactiveSpace2/tyslin-studio'
const STARS_TTL_MS = 60 * 60 * 1000
let stars: { count: number | null; at: number } = { count: null, at: 0 }

/**
 * GitHub stars for the app's repo, fetched at most once an hour (unauthenticated GitHub allows 60
 * calls an hour, shared with skill packs). Keeps the last good count when GitHub fails.
 */
async function githubStars(): Promise<{ count: number | null; url: string }> {
  const url = `https://github.com/${REPO}`
  if (Date.now() - stars.at < STARS_TTL_MS) return { count: stars.count, url }
  stars = { ...stars, at: Date.now() }
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, { headers: { 'user-agent': 'Tyslin-Studio', accept: 'application/vnd.github+json' } })
    if (res.ok) stars = { count: ((await res.json()) as { stargazers_count?: number }).stargazers_count ?? stars.count, at: Date.now() }
  } catch { /* offline: keep the last count */ }
  return { count: stars.count, url }
}

/** Page backgrounds, matching --parchment in index.css, so the window doesn't flash before the UI paints. */
const BACKGROUND = { light: '#FAFAF7', dark: '#121210' }

/** Height of the app's top bar (components/TopBar.tsx, 48 px; the sign-in and setup screens use a 48 px drag bar). */
const TITLEBAR_HEIGHT = 48
const isMac = process.platform === 'darwin'

/** Window buttons drawn by the system over the right of the title bar on Windows and Linux, in theme colours. */
const titleBarOverlay = (): Electron.TitleBarOverlayOptions => {
  // The top bar is 48 CSS px, so its on-screen height grows with the zoom; the buttons follow it.
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
  if (agent.paused) throw new Error(`${agent.name} is paused. Resume it on its page to chat or run tasks.`)
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
      db.setAgentRunResult(agent.id, '')
      send({ type: 'run_finished' })
      return { ok: true }
    } catch (err) {
      const message = controller.signal.aborted ? 'Stopped.' : err instanceof Error ? err.message : String(err)
      // Stopping isn't a failure.
      db.setAgentRunResult(agent.id, controller.signal.aborted ? '' : message)
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
      notifyTask(t.name, db.getAgent(t.agentId)?.name ?? 'Agent', r.ok, r.error ?? '', s.id)
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
  const safe = (): void => { if (!resetting) tick() }
  setTimeout(safe, 5000)
  setInterval(safe, 30_000)
}

const PROVIDER_NAMES: Record<string, string> = { anthropic: 'Claude', openai: 'OpenAI', gemini: 'Gemini' }

/** Why an agent can't run right now, or '' when it can (missing key, engine not installed). */
function setupProblem(a: Agent): string {
  if (a.engine === 'builtin') {
    if (a.provider === 'ollama') return ''
    return getSecret(a.provider) ? '' : `No ${PROVIDER_NAMES[a.provider] ?? a.provider} key yet`
  }
  const e = engineStatus(a.engine)
  if (a.engine === 'custom' && !e.command) return 'Custom engine has no command yet'
  return e.resolvedPath ? '' : `${e.name} is not installed`
}

/** Status for every agent: working (a reply is running), paused, needs setup, last run failed, or ready. */
function agentStatuses(): AgentStatus[] {
  const stats = db.agentStats()
  const busy = new Set([...activeRuns.keys()].map((sid) => db.getSession(sid)?.agentId).filter(Boolean) as string[])
  return db.listAgents().map((a) => {
    const st = stats.get(a.id)
    const problem = setupProblem(a)
    const [state, reason]: [AgentStatus['state'], string] =
      busy.has(a.id) ? ['working', 'Replying now']
        : a.paused ? ['paused', 'Paused']
          : problem ? ['setup', problem]
            : st?.lastError ? ['failed', st.lastError]
              : ['ready', 'Ready']
    return { agentId: a.id, state, reason, lastActive: st?.lastActive ?? null, tasks: st?.tasks ?? 0 }
  })
}

/** One short message to the model, or the engine handshake, for a saved agent or a draft. 45 s limit. */
async function testAgent(input: AgentInput): Promise<AgentTestResult> {
  const started = Date.now()
  const agent: Agent = {
    id: 'test', createdAt: started, updatedAt: started, projectId: null, leadId: null, pinned: false, paused: false,
    tools: { read: false, write: false }, channels: { telegram: false }, head: null, ...input, team: input.team ?? '', agency: input.agency ?? null
  }
  try {
    const problem = setupProblem(agent)
    if (problem) throw new Error(problem)
    if (agent.engine !== 'builtin') {
      const r = await testAcp(engineStatus(agent.engine).name, engineLaunch(agent.engine, app.getPath('home')), app.getVersion())
      if (!r.ok) throw new Error(r.error ?? 'The engine did not answer.')
      return { ok: true, ms: Date.now() - started, detail: r.agent ?? 'Connected' }
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 45_000)
    try {
      const reply = await runtimeFor(agent).run({
        runId: 'test-' + randomUUID(), sessionId: 'test', agent: { ...agent, instructions: '' }, skills: [], project: null,
        history: [{ id: 'test', sessionId: 'test', role: 'user', content: 'Reply with one short sentence to confirm you are working.', createdAt: started, attachments: [], context: '' }],
        emit: () => {}, signal: controller.signal
      })
      return { ok: true, ms: Date.now() - started, detail: reply.trim().slice(0, 200) || 'Replied' }
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    return { ok: false, ms: Date.now() - started, detail: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * One message to an agent or assistant in a new chat (same path as chat, so pause, statuses,
 * reviews and Telegram approvals all apply). Agents work in the given project; assistants have none.
 */
async function askAgent(agentId: string, projectId: string | null, prompt: string, title: string, onSession?: (id: string) => void): Promise<AskResult> {
  try {
    // "Default model" runs through the organization's Studio assistant, which follows the default model.
    const agent = agentId === DEFAULT_MODEL_AGENT ? studioAssistant() : db.getAgent(agentId)
    if (!agent) throw new Error('Pick an agent or assistant.')
    // Projects are workspaces: an agent or assistant only works in its own project.
    const where = projectFor(projectId)
    if (!inWorkspace(agent, where.id, db.getSetting('project:default'), db.getSetting('assistant:studio'))) {
      throw new Error(`${agent.name} belongs to another project. Pick one from ${where.name}.`)
    }
    const project = agent.kind === 'agent' ? projectFor(projectId) : null
    const s = db.createSession(agent.id, project?.id ?? null)
    onSession?.(s.id)
    const { done } = startRun(s.id, prompt)
    db.setSessionTitle(s.id, title)
    const r = await done
    if (!r.ok) return { ok: false, reply: '', error: r.error, sessionId: s.id }
    const reply = db.listMessages(s.id).filter((m) => m.role === 'assistant').pop()?.content ?? ''
    return { ok: true, reply, sessionId: s.id }
  } catch (err) {
    return { ok: false, reply: '', error: err instanceof Error ? err.message : String(err) }
  }
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
    title: 'Tyslin Studio — run your own AI agency',
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
  onRunEvent(e)
  cardsOnRunEvent(e)
}

/** OpenRouter's public model list with context and prices, cached for an hour. Empty when offline. */
let openrouterCache: { at: number; models: OpenRouterModel[] } | null = null
async function openrouterModels(): Promise<OpenRouterModel[]> {
  if (openrouterCache && Date.now() - openrouterCache.at < 3_600_000) return openrouterCache.models
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(15_000) })
    const body = await res.json() as { data?: { id: string; name?: string; context_length?: number; pricing?: { prompt?: string; completion?: string } }[] }
    // Prices come as dollars per token in strings; show them per million tokens.
    const perM = (v?: string): number | null => { const n = Number(v); return v !== undefined && Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 100) / 100 : null }
    const models = (body.data ?? []).map((m) => ({
      id: m.id, name: m.name || m.id, context: m.context_length ?? null, input: perM(m.pricing?.prompt), output: perM(m.pricing?.completion)
    })).sort((a, b) => a.name.localeCompare(b.name))
    openrouterCache = { at: Date.now(), models }
    return models
  } catch { return openrouterCache?.models ?? [] }
}

function initAgencies(): void {
  initCards({ startRun, runTask })
  setBoardChangedHook((projectId, path) => win?.webContents.send('board:changed', { projectId, path }))
  // Every Lead → boss message goes through the gateway (Lead-only, the agency's notify setting, Telegram or Slack).
  boardHooks.messageBoss = (agency, from, kind, text, extras) => sendToBoss(agency, from, kind, text, extras)
  initChannels({ startRun })
  setChannelMessageHook((m, wanted) => {
    win?.webContents.send('channel:message', m)
    updateBadge()
    if (wanted && !m.reply) notifyBoss(m)
  })
}

/** The app icon's count: unread Lead messages in the current organization (macOS dock, Linux launchers). */
function updateBadge(): void {
  try { app.setBadgeCount(db.unreadChannelMessages()) } catch { /* not supported here */ }
}

/** Opens the window on the message's agency, in its Inbox (the renderer resolves the agency from the message id). */
function openInbox(messageId: string): void {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  win.webContents.send('inbox:open', messageId)
}

/** Kept so notifications aren't garbage-collected before they're clicked. */
const shownNotifications = new Set<Notification>()
const NOTIFY_VERB: Record<ChannelMessage['kind'], string> = { question: 'asks', review: 'has work for you to review', brief: 'sent a brief', digest: 'sent a digest' }

/** A desktop notification for a Lead's message. macOS shows a reply field and the quick answers; elsewhere a click opens the agency's Inbox. */
function notifyBoss(m: ChannelMessage): void {
  if (!Notification.isSupported()) return
  const agency = db.getAgency(m.agencyId)
  const lead = db.getAgent(m.agentId)
  const who = lead?.name ?? 'Your Lead'
  const n = new Notification({
    title: `${who} · ${agency?.name ?? 'Agency'} ${NOTIFY_VERB[m.kind]}`,
    body: m.text.length > 240 ? `${m.text.slice(0, 240)}…` : m.text,
    hasReply: m.kind === 'question' || m.kind === 'review',
    replyPlaceholder: `Reply to ${who}`,
    actions: m.options.map((text) => ({ type: 'button' as const, text }))
  })
  const answer = (text: string): void => { try { replyToLead(m.id, text) } catch { openInbox(m.id) } }
  n.on('click', () => openInbox(m.id))
  n.on('reply', (_e, reply) => answer(reply))
  n.on('action', (_e, index) => { const o = m.options[index]; if (o) answer(o) })
  n.on('close', () => shownNotifications.delete(n))
  shownNotifications.add(n)
  n.show()
  if (win && !win.isFocused()) win.flashFrame(true)
}

function registerIpc(): void {
  ipcMain.handle('agents:list', () => {
    // Every organization has a Studio assistant on the default model (per computer); it catches up here.
    studioAssistant()
    return db.listAgents()
  })
  ipcMain.handle('agents:get', (_e, id: string) => db.getAgent(id))
  ipcMain.handle('agents:save', (_e, input: AgentInput & { id?: string }) => {
    const saved = db.saveAgent(input)
    // Changing the Studio assistant's model changes the default model (they are the same thing).
    if (isStudioAssistant(saved.id)) {
      const d = defaultModel()
      if (saved.provider !== d.provider || saved.model !== d.model) db.setPrefs({ defaultProvider: saved.provider, defaultModel: saved.model })
    }
    return saved
  })
  ipcMain.handle('agents:remove', (_e, id: string) => {
    if (isStudioAssistant(id)) throw new Error('Studio runs your default model for cards and the agency screens, so it stays. Change its model in Settings → Models.')
    const gone = db.getAgent(id)
    if (gone?.engine === 'hermes') deleteHermesProfile(gone)
    db.removeAgent(id)
  })
  ipcMain.handle('agents:statuses', () => agentStatuses())
  ipcMain.handle('agents:test', (_e, input: AgentInput) => testAgent(input))

  ipcMain.handle('projects:list', () => db.listProjects())
  // Every project has a real folder: an existing one the user picked, or a new one Tyslin makes.
  ipcMain.handle('projects:create', (_e, name: string, folder: string | null) => {
    const clean = String(name ?? '').trim()
    if (!clean) throw new Error('Give the project a name.')
    if (!folder) throw new Error('Pick a folder for the project, or let Tyslin create one.')
    if (!existsSync(folder) || !statSync(folder).isDirectory()) throw new Error('That folder no longer exists. Pick another one.')
    return db.createProject(clean, folder)
  })
  ipcMain.handle('projects:createWithFolder', (_e, name: string) => {
    const clean = String(name ?? '').trim()
    if (!clean) throw new Error('Give the project a name.')
    return createProjectFolder(clean)
  })
  ipcMain.handle('projects:newFolderPath', (_e, name: string) => newProjectFolderPath(String(name ?? '')))
  ipcMain.handle('projects:rename', (_e, id: string, name: string) => db.renameProjectChecked(id, String(name ?? '')))
  ipcMain.handle('projects:remove', (_e, id: string) => {
    const def = db.getSetting('project:default')
    // Stop anything still replying in that project first.
    for (const [sid, r] of activeRuns) { if (db.getSession(sid)?.projectId === id) r.controller.abort() }
    return db.removeProject(id, def)
  })
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
  ipcMain.handle('memory:list', (_e, agencyId: string) => listMemory(String(agencyId)))
  ipcMain.handle('memory:read', (_e, agencyId: string, key: string) => readMemory(String(agencyId), String(key)))
  ipcMain.handle('memory:write', (_e, agencyId: string, key: string, text: string) => writeMemory(String(agencyId), String(key), String(text ?? '')))
  ipcMain.handle('integrations:list', () => db.listMcpServers())
  ipcMain.handle('integrations:save', (_e, input: McpServerInput) => saveIntegration(input))
  ipcMain.handle('integrations:remove', (_e, id: string) => removeIntegration(id))
  ipcMain.handle('integrations:setAgents', (_e, id: string, agentIds: string[]) => db.setMcpAgents(id, Array.isArray(agentIds) ? agentIds.map(String) : []))
  ipcMain.handle('integrations:test', (_e, id: string) => testIntegration(id))
  ipcMain.handle('integrations:search', (_e, query: string, cursor?: string) => searchRegistry(String(query ?? ''), cursor ? String(cursor) : undefined))
  ipcMain.handle('accounts:status', () => accountStatuses())
  ipcMain.handle('accounts:signIn', async (_e, engine: AccountEngine) => {
    const s = await signInAccount(engine, app.getVersion(), (url) => win?.webContents.send('accounts:signInUrl', { engine, url }))
    win?.focus()
    return s
  })
  ipcMain.handle('accounts:cancelSignIn', (_e, engine: AccountEngine) => cancelAccountSignIn(engine))
  ipcMain.handle('accounts:setUseAccount', (_e, engine: AccountEngine, on: boolean) => setUseAccount(engine, !!on))
  ipcMain.handle('engines:cancelInstall', (_e, id: ExternalEngineId) => cancelInstall(id))
  ipcMain.handle('engines:test', async (_e, id: ExternalEngineId) => {
    try {
      return await testAcp(engineStatus(id).name, engineLaunch(id, app.getPath('home')), app.getVersion())
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })


  ipcMain.handle('changes:list', (_e, sessionId: string) => db.listChanges(sessionId))
  ipcMain.handle('changes:resolve', (_e, id: string, acceptedHunks: number[], note: string) => {
    const r = resolveChange(id, acceptedHunks, note)
    try { onChangeResolved(r) } catch { /* the card stays where it is */ }
    return r
  })

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
    openrouterKeySet: !!getSecret('openrouter'),
    ollamaUrl: db.getSetting('ollamaUrl') || 'http://localhost:11434',
    defaultModel: defaultModel()
  }))
  ipcMain.handle('settings:setKey', (_e, provider: KeyProvider, key: string) => {
    setSecret(provider, key.trim())
    syncStudioAssistant()
  })
  ipcMain.handle('settings:setOllamaUrl', (_e, url: string) => db.setSetting('ollamaUrl', url.trim()))
  ipcMain.handle('settings:removeKey', (_e, provider: KeyProvider) => {
    setSecret(provider, '')
    syncStudioAssistant()
  })
  ipcMain.handle('settings:openrouterModels', () => openrouterModels())
  ipcMain.handle('settings:connectOpenRouter', async () => {
    await connectOpenRouter()
    syncStudioAssistant()
    win?.focus()
  })
  ipcMain.handle('settings:cancelOpenRouter', () => cancelOpenRouter())
  ipcMain.handle('settings:openrouterAccount', () => openRouterAccount())
  ipcMain.handle('settings:prefs', () => db.getPrefs())
  ipcMain.handle('settings:setPrefs', (_e, p: Partial<Preferences>) => {
    const next = db.setPrefs(p)
    if (p.theme) applyTheme()
    if (typeof p.zoom === 'number') applyZoom()
    if (p.defaultProvider) syncStudioAssistant()
    return next
  })

  ipcMain.handle('gdrive:status', () => gdriveStatus())
  ipcMain.handle('gdrive:connect', async () => {
    await connectDrive()
    win?.webContents.send('gdrive:status', gdriveStatus())
    void syncAll().catch(() => {})
    return gdriveStatus()
  })
  ipcMain.handle('gdrive:disconnect', () => {
    disconnectDrive()
    resetSyncState()
    const s = gdriveStatus()
    win?.webContents.send('gdrive:status', s)
    return s
  })
  ipcMain.handle('gdrive:sync', () => syncAll())
  ipcMain.handle('gdrive:setAuto', (_e, on: boolean) => { const s = setAutoSync(!!on); win?.webContents.send('gdrive:status', s); return s })
  ipcMain.handle('gdrive:openFolder', () => { const url = gdriveStatus().folderUrl; if (url) void shell.openExternal(url) })

  ipcMain.handle('onboarding:status', (): OnboardingStatus => ({
    needed: db.getSetting('onboarded') !== '1',
    orgName: db.currentOrg().name,
    projectName: defaultProjectName(),
    projectFolder: defaultProjectFolder()
  }))
  ipcMain.handle('onboarding:finish', (_e, input: OnboardingInput) => {
    const org = db.currentOrg()
    const orgName = String(input.orgName ?? '').trim()
    if (orgName && orgName !== org.name) db.renameOrg(org.id, orgName)
    // After the organization's name, so a new Default project folder is created under it.
    setDefaultProjectName(String(input.projectName ?? '').trim() || 'Default project')
    if (input.defaultProvider) {
      db.setPrefs({ defaultProvider: input.defaultProvider, defaultModel: input.defaultModel })
      syncStudioAssistant()
    }
    db.setSetting('onboarded', '1')
  })

  ipcMain.handle('agencies:list', () => db.listAgencies())
  ipcMain.handle('agencies:get', (_e, id: string) => db.getAgency(id))
  ipcMain.handle('agencies:create', (_e, input: AgencyCreateInput) => {
    const a = createAgency(input)
    win?.webContents.send('tasks:changed')
    return a
  })
  ipcMain.handle('agencies:update', (_e, id: string, input: AgencyUpdateInput) => updateAgency(id, input))
  ipcMain.handle('agencies:remove', (_e, id: string) => { removeAgency(id); win?.webContents.send('tasks:changed') })
  ipcMain.handle('agencies:plan', (_e, id: string) => planNow(id))
  ipcMain.handle('agencies:brief', (_e, id: string, text: string) => briefLead(String(id ?? ''), String(text ?? '')))
  ipcMain.handle('slack:status', () => slackStatus())
  ipcMain.handle('slack:setToken', (_e, t: string) => setSlackToken(String(t ?? '')))
  ipcMain.handle('slack:linkCode', () => newSlackLinkCode())
  ipcMain.handle('slack:unlink', (_e, id: string) => unlinkSlackChannel(String(id ?? '')))
  ipcMain.handle('channels:list', (_e, agencyId?: string) => db.listChannelMessages(agencyId || undefined))
  ipcMain.handle('channels:reply', (_e, id: string, text: string) => replyToLead(String(id ?? ''), String(text ?? '')))
  ipcMain.handle('channels:markRead', (_e, ids: string[]) => { const n = db.markChannelMessagesRead(Array.isArray(ids) ? ids.map(String) : []); updateBadge(); return n })
  ipcMain.handle('channels:unread', () => db.unreadChannelMessages())
  ipcMain.handle('cards:run', (_e, agencyId: string, cardId: string) => runCard(agencyId, cardId))
  ipcMain.handle('cards:running', () => runningCards())

  ipcMain.handle('auth:status', () => authStatus())
  ipcMain.handle('auth:signIn', () => signIn())
  ipcMain.handle('auth:cancelSignIn', () => cancelSignIn())
  ipcMain.handle('auth:signOut', () => signOut())
  ipcMain.handle('app:dashboard', () => db.dashboardStats())
  ipcMain.handle('app:stars', () => githubStars())
  ipcMain.handle('tasks:list', () => db.listTasks())
  ipcMain.handle('tasks:save', (_e, input: TaskInput) =>
    db.saveTask(input, input.enabled ? nextRunAfter(input.schedule, Date.now()) : null))
  ipcMain.handle('tasks:remove', (_e, id: string) => db.removeTask(id))
  ipcMain.handle('tasks:runNow', (_e, id: string) => {
    const t = db.getTask(id)
    if (!t) throw new Error('That task no longer exists.')
    return runTask(t, false)
  })
  ipcMain.handle('studio:defaultProject', () => defaultProject())
  ipcMain.handle('studio:list', (_e, kind: StudioKind, projectId: string | null) => listStudioFiles(kind, projectId))
  ipcMain.handle('studio:read', (_e, projectId: string | null, path: string) => readStudioFile(projectId, path))
  ipcMain.handle('studio:write', (_e, projectId: string | null, target: { path?: string; kind?: StudioKind; name?: string }, content: string, encoding?: 'utf8' | 'base64') =>
    writeStudioFile(projectId, target, String(content ?? ''), encoding === 'base64' ? 'base64' : 'utf8'))
  ipcMain.handle('studio:remove', (_e, projectId: string | null, path: string) => removeStudioFile(projectId, path))
  ipcMain.handle('studio:reveal', (_e, projectId: string | null, path?: string) => revealStudioFile(projectId, path))
  ipcMain.handle('studio:ask', (_e, agentId: string, projectId: string | null, prompt: string, title: string) => askAgent(agentId, projectId, String(prompt ?? ''), String(title ?? 'Chat')))
  ipcMain.handle('drive:list', (_e, projectId: string | null, dir: string, showHidden?: boolean) => driveList(projectId, String(dir ?? ''), !!showHidden))
  ipcMain.handle('drive:preview', (_e, projectId: string | null, path: string) => drivePreview(projectId, path))
  ipcMain.handle('drive:mkdir', (_e, projectId: string | null, dir: string, name: string) => driveMkdir(projectId, String(dir ?? ''), String(name ?? '')))
  ipcMain.handle('drive:rename', (_e, projectId: string | null, path: string, name: string) => driveRename(projectId, path, String(name ?? '')))
  ipcMain.handle('drive:move', (_e, projectId: string | null, path: string, toDir: string) => driveMove(projectId, path, String(toDir ?? '')))
  ipcMain.handle('drive:remove', (_e, projectId: string | null, path: string) => driveRemove(projectId, path))
  ipcMain.handle('drive:upload', (_e, projectId: string | null, dir: string) => driveUpload(win, projectId, String(dir ?? '')))
  ipcMain.handle('drive:copyIn', (_e, projectId: string | null, dir: string, paths: string[]) => driveCopyIn(projectId, String(dir ?? ''), Array.isArray(paths) ? paths.map(String) : []))
  ipcMain.handle('drive:open', (_e, projectId: string | null, path: string) => driveOpen(projectId, path))
  ipcMain.handle('drive:reveal', (_e, projectId: string | null, path: string) => driveReveal(projectId, String(path ?? '')))
  ipcMain.handle('telegram:status', () => telegramStatus())
  ipcMain.handle('telegram:setToken', (_e, t: string) => setTelegramToken(String(t ?? '')))
  ipcMain.handle('telegram:linkCode', () => newLinkCode())
  ipcMain.handle('telegram:unlink', (_e, id: number) => unlinkChat(Number(id)))
  ipcMain.handle('telegram:setNotify', (_e, p: Partial<TelegramNotify>) => setTelegramNotify(p))
  ipcMain.handle('orgs:list', () => db.listOrgs())
  ipcMain.handle('orgs:create', (_e, name: string, color?: OrgColor) => db.createOrg(String(name ?? ''), color))
  ipcMain.handle('orgs:setColor', (_e, id: string, color: OrgColor) => db.setOrgColor(id, color))
  ipcMain.handle('orgs:rename', (_e, id: string, name: string) => db.renameOrg(id, String(name ?? '')))
  ipcMain.handle('orgs:switch', (_e, id: string) => {
    if (activeRuns.size) throw new Error('An agent is still replying. Stop it or wait, then switch.')
    db.switchOrg(id)
    updateBadge()
  })
  ipcMain.handle('app:info', (): AppInfo => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: `${process.platform} ${process.arch}`,
    dataPath: app.getPath('userData')
  }))
  ipcMain.handle('app:reset', async () => {
    // Revoke the Google Drive grant while its token is still readable; then stop replies and wipe.
    try { disconnectDrive(true) } catch { /* not connected */ }
    await resetEverything(() => {
      for (const r of activeRuns.values()) r.controller.abort()
    })
  })
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
  initAgencies()
  createWindow()
  startScheduler()
  void initTelegram({ startRun: (sid, text) => startRun(sid, text), resolveChange, answerPermission })
  void initSlack({ startRun: (sid, text) => startRun(sid, text) })
  initGDrive((s) => { win?.webContents.send('gdrive:status', s) })
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
