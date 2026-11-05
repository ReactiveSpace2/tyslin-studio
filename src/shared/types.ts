export type Shape = 'block' | 'round' | 'hex' | 'pill'
export type Tone = 'lime' | 'ink' | 'paper'
export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'ollama'
/** Providers that need an API key (stored encrypted). */
export type KeyProvider = 'anthropic' | 'openai' | 'gemini'
/**
 * What runs the agent: Tyslin's own model runtime, or an external agent driven over ACP
 * (Agent Client Protocol). The external program is installed by the user, never bundled.
 */
export type EngineId = 'builtin' | 'goose' | 'hermes' | 'zeroclaw' | 'openclaw' | 'custom'
export type ExternalEngineId = Exclude<EngineId, 'builtin'>

export interface EngineStatus {
  id: ExternalEngineId
  name: string
  description: string
  docsUrl: string
  /** Shown under the engine, e.g. "Needs a running OpenClaw Gateway." */
  note: string
  /** Default command line, e.g. "hermes acp". */
  defaultCommand: string
  /** The user's override, or '' to use the default. */
  command: string
  /** Absolute path of the program that would be started, or null if it can't be found. */
  resolvedPath: string | null
  /** The engine's official installer for this platform, or null if Tyslin can't install it. */
  install: EngineInstall | null
}

export interface EngineInstall {
  /** Exactly what will run, shown to the user before it does. */
  command: string
  /** Where the installer script comes from, e.g. "openclaw.ai". */
  source: string
  /** What the user still has to do afterwards, e.g. choose a model. */
  nextStep: string
}

export interface InstallOutput {
  id: ExternalEngineId
  text: string
}

export interface EngineTestResult {
  ok: boolean
  /** Name and version the agent reports, e.g. "hermes-agent 0.9.1". */
  agent?: string
  protocolVersion?: number
  /** Sign-in methods the agent offers; empty when it handles auth itself. */
  authMethods?: string[]
  error?: string
}

/**
 * agent: works in a project folder with file tools, can run on an external engine and on a schedule.
 * assistant: a prompt and a model for plain chat; no folder, no tools, no engine, no schedule.
 */
export type AgentKind = 'agent' | 'assistant'

/** ask: file writes are staged for review · direct: written straight to disk */
export type WriteMode = 'ask' | 'direct'

export interface Agent {
  id: string
  kind: AgentKind
  name: string
  description: string
  instructions: string
  shape: Shape
  tone: Tone
  provider: ProviderId
  model: string
  skills: string[]
  schedule: string
  engine: EngineId
  writeMode: WriteMode
  isMascot: boolean
  /** The one project an agent works in (agents only; null = no project yet). New chats use it. */
  projectId: string | null
  /** The agent it reports to in that project; null = reports to you. */
  leadId: string | null
  /** Pinned to the top of lists. */
  pinned: boolean
  /** Paused agents don't chat or run tasks. */
  paused: boolean
  /** File tools in the project folder. Write still goes through review unless writeMode is direct. */
  tools: { read: boolean; write: boolean }
  /** Chat channels this agent answers on. */
  channels: { telegram: boolean }
  /** A mascot head from shared/heads.ts; null = the simple robot shape (shape + tone). */
  head: string | null
  createdAt: number
  updatedAt: number
}

/** Fields added after v0.4 are optional on input; saving keeps the stored value when they're missing. */
type AgentExtras = 'projectId' | 'leadId' | 'pinned' | 'paused' | 'tools' | 'channels' | 'head'
export type AgentInput = Omit<Agent, 'id' | 'createdAt' | 'updatedAt' | AgentExtras> & Partial<Pick<Agent, AgentExtras>>

/** Files made on the Mind mapper, Workflows and Canvas screens (a run is a workflow's log). */
export type StudioKind = 'mindmap' | 'workflow' | 'run' | 'canvas'

export interface StudioFile {
  /** File name without the kind's extension. */
  name: string
  /** Relative to the project folder, with forward slashes. */
  path: string
  updatedAt: number
}

export interface MindNode {
  id: string
  text: string
  children: MindNode[]
  collapsed?: boolean
}

export interface MindMapDoc {
  version: 1
  root: MindNode
}

export interface WorkflowStep {
  id: string
  /** An agent or assistant. */
  agentId: string
  instruction: string
}

export interface WorkflowDoc {
  version: 1
  /** What the first step starts from. */
  brief: string
  steps: WorkflowStep[]
}

export interface WorkflowProgress {
  runId: string
  /** The workflow file being run. */
  path: string
  /** Step index, or -1 for the whole run. */
  step: number
  status: 'running' | 'done' | 'failed' | 'stopped'
  output?: string
  error?: string
  sessionId?: string
  /** When the run ends: the Markdown log, relative to the project folder. */
  logPath?: string
}

export interface AskResult {
  ok: boolean
  reply: string
  error?: string
  sessionId?: string
}

export type DriveKind = 'folder' | 'mindmap' | 'workflow' | 'canvas' | 'image' | 'text' | 'file'

export interface DriveEntry {
  name: string
  /** Relative to the project folder, with forward slashes. */
  path: string
  isDir: boolean
  kind: DriveKind
  size: number
  updatedAt: number
}

export interface DriveListing {
  /** The project actually shown (the Default project's id when none was chosen). */
  projectId: string
  folder: string
  /** '' for the project folder itself. */
  dir: string
  entries: DriveEntry[]
}

export type DrivePreview =
  | { kind: 'text'; text: string; truncated: boolean }
  | { kind: 'image'; dataUrl: string }
  | { kind: 'none'; note: string }

/** What linked Telegram chats are sent besides replies. */
export interface TelegramNotify {
  results: boolean
  approvals: boolean
  failures: boolean
}

export interface TelegramStatus {
  /** A bot token is saved. */
  connected: boolean
  botName: string
  linked: { chatId: number; name: string }[]
  /** Polling Telegram for messages right now. */
  running: boolean
  error: string
  notify: TelegramNotify
  /** The open one-time link code, if any. */
  linkCode: string | null
}

/** Live state for the agent lists and pages, worked out from keys, engines, runs and the last result. */
export interface AgentStatus {
  agentId: string
  state: 'ready' | 'working' | 'setup' | 'failed' | 'paused'
  /** Why, in a few words ("No Claude key", "Goose is not installed", the last error). */
  reason: string
  lastActive: number | null
  tasks: number
}

export interface AgentTestResult {
  ok: boolean
  ms: number
  /** The reply (built-in models) or the agent name and version (engines). */
  detail: string
}

export interface Project {
  id: string
  name: string
  folder: string | null
  createdAt: number
}

export interface Session {
  id: string
  agentId: string
  projectId: string | null
  title: string
  createdAt: number
  updatedAt: number
}

export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  /** Files and folders the user attached to this message. */
  attachments?: Attachment[]
}

/**
 * A file, image or folder attached to a chat message. Picked through `attachments.pick`, which
 * reads it once in the main process: text goes into the message the agent sees, images are
 * copied into the app's data folder so later turns can still send them.
 */
export interface Attachment {
  id: string
  kind: 'file' | 'image' | 'folder'
  name: string
  /** Where it was picked from on disk. */
  path: string
  size: number
  /** Folders: how many files were included. */
  files?: number
  /** Why some or all of it was left out (binary file, too large, past the size budget). */
  note?: string
}

export interface Skill {
  id: string
  name: string
  description: string
  body: string
  /** The skill's page on GitHub, for skills installed from a pack; shown as a link on its card. */
  sourceUrl?: string
  /** Set when the skill came from a skill pack (`SkillPack.id`). */
  packId?: string
}

/**
 * A set of skills installed from a public GitHub repo. Featured packs are picked in skillPacks.ts;
 * the rest are repos tagged `agent-skills` on GitHub (Skills page, "More on GitHub").
 */
export interface SkillPack {
  id: string
  name: string
  author: string
  description: string
  /** github.com URL of the repo. */
  url: string
  /** SPDX id from GitHub, or '' when the repo has no licence GitHub recognises. */
  license: string
  featured: boolean
  /** Which Skills tab shows it: 'claude' for Anthropic's skills repo, otherwise the GitHub tab. */
  group?: 'claude'
  /** GitHub stars, for topic repos. */
  stars?: number
  /** False when the pack can't be installed; `blockedReason` says why. */
  installable: boolean
  blockedReason?: string
  installed: boolean
  /** Skills currently installed from this pack. */
  skillCount: number
  installedCommit?: string
  installedAt?: number
  /** Latest commit on GitHub, once checked. */
  latestCommit?: string
  updateAvailable: boolean
  /** Why the last update check failed (offline, rate limit). */
  checkError?: string
}

/** One skill in Anthropic's skills repo (github.com/anthropics/skills), as listed on the Claude tab. */
export interface ClaudeSkill {
  /** Folder under skills/. */
  folder: string
  name: string
  description: string
  /** 'Apache-2.0' (open source, installable), 'source-available' (Anthropic all rights reserved) or 'none' (no licence file). */
  license: 'Apache-2.0' | 'source-available' | 'none'
  installable: boolean
  /** Why an open-source skill still can't be installed (for example, over the length limit). */
  blockedReason?: string
  url: string
}

/** One page of repos from the GitHub `agent-skills` topic, most stars first. */
export interface SkillPackSearch {
  packs: SkillPack[]
  total: number
  /** Page to ask for next, if there are more. */
  nextPage?: number
}

export interface SkillPackResult {
  pack: SkillPack
  added: number
  updated: number
  removed: number
  /** One line per skill that was skipped, with the reason. */
  skipped: string[]
}

export type SkillInput = Omit<Skill, 'id'> & { id?: string }

export interface SkillImportResult {
  imported: Skill[]
  /** One line per file that was skipped, with the reason. */
  skipped: string[]
}

export interface ProviderSettings {
  anthropicKeySet: boolean
  openaiKeySet: boolean
  geminiKeySet: boolean
  ollamaUrl: string
  /** The model Mind mapper, Canvas and Workflows use when "Default model" is picked (shown in the status bar). */
  defaultModel: DefaultModel
}

export interface DefaultModel {
  provider: ProviderId
  model: string
  /** false = nothing chosen yet; this is the fallback (first provider with a key). */
  chosen: boolean
  /** The provider has a key (always true for Ollama). */
  ready: boolean
  /** The current organization's Studio assistant, which runs "Default model" requests. */
  assistantId: string | null
}

/** First-run setup, shown once per computer after sign-in. */
export interface OnboardingStatus {
  needed: boolean
  orgName: string
  projectName: string
  /** The Default project's folder when it already exists (renaming keeps it there); null = created on finish. */
  projectFolder: string | null
}

export interface OnboardingInput {
  orgName: string
  projectName: string
  defaultProvider: ProviderId | null
  defaultModel: string
}

/**
 * Run event stream, shaped like AG-UI events so the hosted version can adopt AG-UI without UI changes.
 * Every runtime emits these; the UI and storage consume nothing else.
 */
export type RunEventBody =
  | { type: 'run_started' }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call_start'; toolCallId: string; name: string }
  | { type: 'tool_call_args'; toolCallId: string; delta: string }
  | { type: 'tool_call_end'; toolCallId: string }
  | { type: 'tool_result'; toolCallId: string; content: string; isError: boolean }
  | { type: 'approval_needed'; toolCallId: string; changeId: string; filePath: string }
  | { type: 'approval_needed'; toolCallId: string; permissionId: string; title: string; choices: PermissionChoice[] }
  | { type: 'state_update'; status: 'running' | 'waiting_for_review' }
  | { type: 'run_finished' }
  | { type: 'run_error'; error: string }

export type RunEvent = RunEventBody & { runId: string; sessionId: string }

/** An option an external agent offers when it asks permission, e.g. "Allow once". */
export interface PermissionChoice {
  id: string
  name: string
  kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'
}

export type ChangeStatus = 'pending' | 'accepted' | 'rejected' | 'partial' | 'expired'

/** A file write proposed by an agent, staged until the user reviews it. */
export interface PendingChange {
  id: string
  runId: string
  sessionId: string
  toolCallId: string
  /** Relative to the project folder. */
  filePath: string
  /** null when the agent is creating a new file. */
  original: string | null
  proposed: string
  status: ChangeStatus
  note: string
  createdAt: number
}

/** Workspace-wide defaults, edited in Settings → Agents. */
/**
 * A separate space with its own agents, assistants, projects, chats and skills (its own database file).
 * Sign-in, API keys, agent engine paths and the theme are shared by all organizations on this computer.
 */
/** Colour that marks an organization (switcher tile, and the accent when Accent is "Organization colour"). */
export type OrgColor = 'lime' | 'teal' | 'amber' | 'coral' | 'violet'
/** Fill shades, each with ink text on top (all at least 7:1). Text and line shades live in styles.css. */
export const ORG_COLORS: Record<OrgColor, { label: string; fill: string }> = {
  lime: { label: 'Lime', fill: '#7DB800' },
  teal: { label: 'Teal', fill: '#2BB3A3' },
  amber: { label: 'Amber', fill: '#F2B33D' },
  coral: { label: 'Coral', fill: '#F2836A' },
  violet: { label: 'Violet', fill: '#A992F5' }
}

export interface Organization {
  id: string
  name: string
  color: OrgColor
  createdAt: number
  current: boolean
}

/** When a scheduled task runs, in local time. */
export interface TaskSchedule {
  repeat: 'daily' | 'weekdays' | 'weekly'
  /** 24-hour HH:MM. */
  time: string
  /** Weekly only: 0 Sunday … 6 Saturday. */
  day?: number
}

/** A prompt an agent or assistant runs on a schedule, each run in a new chat (per organization). */
export interface ScheduledTask {
  id: string
  name: string
  prompt: string
  agentId: string
  /** Agents only; assistants never get a folder. */
  projectId: string | null
  schedule: TaskSchedule
  enabled: boolean
  nextRunAt: number | null
  lastRunAt: number | null
  lastStatus: 'running' | 'ok' | 'error' | null
  lastError: string
  /** The chat the last run wrote to. */
  lastSessionId: string | null
  createdAt: number
}

export type TaskInput = Pick<ScheduledTask, 'name' | 'prompt' | 'agentId' | 'projectId' | 'schedule' | 'enabled'> & { id?: string }

/** Activity summary for the Dashboard, from the local database. */
export interface DashboardStats {
  chats: number
  /** Messages you sent (not replies). */
  messages: number
  chatsThisWeek: number
  messagesThisWeek: number
  /** File changes waiting for your review, across all chats. */
  pendingChanges: number
  /** Messages you sent per local day, oldest first, last 14 days. `day` is YYYY-MM-DD. */
  daily: { day: string; count: number }[]
  /** Agents and assistants you messaged most in the last 30 days, most first. */
  topAgents: { agentId: string; messages: number }[]
  /** Chats with file changes waiting for review, newest first. */
  reviews: { sessionId: string; agentId: string; projectId: string | null; title: string; count: number }[]
}

/** system follows the computer's light or dark setting. */
export type Theme = 'system' | 'light' | 'dark'

export const ZOOM_MIN = 0.7
export const ZOOM_MAX = 1.5
export const ZOOM_STEP = 0.1
/** Clamps and rounds to whole percent. */
export const clampZoom = (z: number): number => Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(z) ? z : 1)) * 100) / 100

export interface Preferences {
  /** App colours; applied in main through nativeTheme so the CSS prefers-color-scheme rules follow it. */
  theme: Theme
  /** Page zoom, ZOOM_MIN–ZOOM_MAX (1 = 100%). Per computer, like the theme. */
  zoom: number
  /** outline: 1.6 px strokes · bold: 2.1 px. */
  iconStyle: 'outline' | 'bold'
  /** Names under the left-menu icons. */
  railLabels: boolean
  /** Fill and highlight colour: brand lime, dark green, ink only, or the current organization's colour. */
  accent: 'lime' | 'forest' | 'mono' | 'org'
  /** File-change mode given to newly created agents. */
  defaultWriteMode: WriteMode
  /** Added to every agent's instructions. */
  sharedInstructions: string
  /** The default model (per computer); null = not chosen yet. */
  defaultProvider: ProviderId | null
  defaultModel: string
}

/** The Google account signed in on this computer. Only the profile is kept; no Google tokens are stored. */
export interface Account {
  email: string
  name: string
}

export interface AuthStatus {
  /** False when this build has no Google client ID, so sign-in is hidden. */
  configured: boolean
  account: Account | null
}

export interface AppInfo {
  version: string
  electron: string
  platform: string
  /** Folder holding tyslin.db. */
  dataPath: string
}

export interface UpdateStatus {
  /** idle: not checked yet (always in dev) · none: up to date · available: newer version to download by hand */
  state: 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error'
  currentVersion: string
  /** True when this install can download and install updates itself (Windows, Linux AppImage). */
  autoInstall: boolean
  /** Set when another system updates the app (the Snap Store via snapd); the app then never checks itself. */
  managedBy?: 'snap'
  version?: string
  percent?: number
  downloadUrl?: string
  error?: string
}

export interface TyslinApi {
  agents: {
    list(): Promise<Agent[]>
    get(id: string): Promise<Agent | null>
    save(input: AgentInput & { id?: string }): Promise<Agent>
    remove(id: string): Promise<void>
    statuses(): Promise<AgentStatus[]>
    /** Sends one short message (built-in models) or runs the engine handshake. Works on unsaved drafts too. */
    test(input: AgentInput): Promise<AgentTestResult>
  }
  projects: {
    list(): Promise<Project[]>
    create(name: string, folder: string | null): Promise<Project>
    pickFolder(): Promise<string | null>
    files(projectId: string): Promise<string[]>
  }
  attachments: {
    /** Opens the system picker; the returned ids are passed to `sessions.send`. */
    pick(kind: 'file' | 'folder'): Promise<Attachment[]>
  }
  sessions: {
    list(agentId?: string): Promise<Session[]>
    create(agentId: string, projectId: string | null): Promise<Session>
    messages(sessionId: string): Promise<Message[]>
    /** `attachmentIds` come from `attachments.pick`. */
    send(sessionId: string, text: string, attachmentIds?: string[]): Promise<void>
    onEvent(cb: (e: RunEvent) => void): () => void
    /** Stops the session's running reply, if any. */
    stop(sessionId: string): Promise<void>
    /** Answers an external agent's permission request; null declines. */
    answerPermission(permissionId: string, choiceId: string | null): Promise<void>
  }
  engines: {
    list(): Promise<EngineStatus[]>
    setCommand(id: ExternalEngineId, command: string): Promise<EngineStatus>
    /** Starts the engine, runs the ACP handshake and stops it again. */
    test(id: ExternalEngineId): Promise<EngineTestResult>
    /** Runs the engine's official installer; output streams through onInstallOutput. */
    install(id: ExternalEngineId): Promise<{ ok: boolean; error?: string; status: EngineStatus }>
    cancelInstall(id: ExternalEngineId): Promise<void>
    onInstallOutput(cb: (o: InstallOutput) => void): () => void
  }
  changes: {
    list(sessionId: string): Promise<PendingChange[]>
    /** Applies the accepted hunks (indexes from `diffHunks`) and reports the outcome back into the run. */
    resolve(changeId: string, acceptedHunks: number[], note: string): Promise<PendingChange>
  }
  skills: {
    list(): Promise<Skill[]>
    /** Creates or updates; a rename also updates every agent that uses the skill. */
    save(input: SkillInput): Promise<Skill>
    /** Deletes the skill and detaches it from every agent. */
    remove(id: string): Promise<void>
    /** Opens a file picker for .md skill files (frontmatter: name, description). */
    importFiles(): Promise<SkillImportResult>
    /** Saves the skill as a .md file; false if the user cancelled. */
    exportFile(id: string): Promise<boolean>
  }
  skillPacks: {
    /** Packs with their install state, without going online. */
    list(): Promise<SkillPack[]>
    /** Same, plus the latest commit from GitHub for each (cached for 15 minutes). */
    check(): Promise<SkillPack[]>
    /** Repos tagged agent-skills on GitHub, optionally matching `query`. Featured packs are left out. */
    discover(query: string, page: number): Promise<SkillPackSearch>
    /** Installs the pack, or updates it to the latest commit. Replaces edits to its skills. */
    install(id: string): Promise<SkillPackResult>
    /** Every skill in Anthropic's skills repo with its licence (cached for 15 minutes). */
    claudeCatalog(): Promise<ClaudeSkill[]>
    /** Deletes the pack's skills and detaches them from every agent. */
    uninstall(id: string): Promise<void>
  }
  settings: {
    get(): Promise<ProviderSettings>
    setKey(provider: KeyProvider, key: string): Promise<void>
    setOllamaUrl(url: string): Promise<void>
    prefs(): Promise<Preferences>
    setPrefs(p: Partial<Preferences>): Promise<Preferences>
    /** Fires when the zoom changes anywhere (slider, Settings or keyboard shortcut). */
    onZoom(cb: (zoom: number) => void): () => void
  }
  tasks: {
    list(): Promise<ScheduledTask[]>
    save(input: TaskInput): Promise<ScheduledTask>
    remove(id: string): Promise<void>
    /** Starts the task now in a new chat and returns that chat's id. */
    runNow(id: string): Promise<string>
    /** Fires when a task starts or finishes a run (scheduled or manual). */
    onChanged(cb: () => void): () => void
  }
  studio: {
    /** The current organization's Default project (created with its folder on first use). */
    defaultProject(): Promise<Project>
    /** projectId null = the Default project. */
    list(kind: StudioKind, projectId: string | null): Promise<{ project: Project; files: StudioFile[] }>
    read(projectId: string | null, path: string): Promise<string>
    /** Saves to `path`, or to a new free name for `kind` + `name`. */
    write(projectId: string | null, target: { path?: string; kind?: StudioKind; name?: string }, content: string): Promise<StudioFile>
    remove(projectId: string | null, path: string): Promise<void>
    /** Shows the file (or the project folder) in the system file manager. */
    reveal(projectId: string | null, path?: string): Promise<void>
    /** One message to an agent or assistant in a new chat titled `title`; resolves with its reply. */
    ask(agentId: string, projectId: string | null, prompt: string, title: string): Promise<AskResult>
    runWorkflow(projectId: string | null, path: string): Promise<string>
    stopWorkflow(runId: string): Promise<void>
    onWorkflow(cb: (p: WorkflowProgress) => void): () => void
  }
  drive: {
    list(projectId: string | null, dir: string, showHidden?: boolean): Promise<DriveListing>
    preview(projectId: string | null, path: string): Promise<DrivePreview>
    mkdir(projectId: string | null, dir: string, name: string): Promise<void>
    rename(projectId: string | null, path: string, name: string): Promise<void>
    move(projectId: string | null, path: string, toDir: string): Promise<void>
    remove(projectId: string | null, path: string): Promise<void>
    /** System file picker; copies the chosen files into `dir`. Returns how many. */
    upload(projectId: string | null, dir: string): Promise<number>
    /** Copies files dropped onto the window (see `pathsFor`) into `dir`. */
    copyIn(projectId: string | null, dir: string, paths: string[]): Promise<number>
    /** Real paths of files dropped from the desktop. */
    pathsFor(files: File[]): string[]
    /** Opens with the system's app for that file type. */
    open(projectId: string | null, path: string): Promise<void>
    reveal(projectId: string | null, path: string): Promise<void>
  }
  telegram: {
    status(): Promise<TelegramStatus>
    /** Checks the token with Telegram, then saves it encrypted; '' disconnects. */
    setToken(token: string): Promise<TelegramStatus>
    /** A one-time code to send as /start CODE from the account to link (10 minutes). */
    linkCode(): Promise<TelegramStatus>
    unlink(chatId: number): Promise<TelegramStatus>
    setNotify(p: Partial<TelegramNotify>): Promise<TelegramStatus>
  }
  onboarding: {
    status(): Promise<OnboardingStatus>
    /** Names the current organization and its Default project, saves the default model and marks setup done. */
    finish(input: OnboardingInput): Promise<void>
  }
  orgs: {
    list(): Promise<Organization[]>
    /** Creates the organization; call `switch` to move into it. */
    create(name: string, color?: OrgColor): Promise<Organization>
    setColor(id: string, color: OrgColor): Promise<void>
    rename(id: string, name: string): Promise<void>
    /** Fails while a reply is still running. The renderer reloads afterwards. */
    switch(id: string): Promise<void>
  }
  auth: {
    status(): Promise<AuthStatus>
    /** Opens Google in the browser and resolves once the user has signed in there. */
    signIn(): Promise<AuthStatus>
    cancelSignIn(): Promise<void>
    signOut(): Promise<AuthStatus>
  }
  app: {
    info(): Promise<AppInfo>
    dashboard(): Promise<DashboardStats>
    /** GitHub stars for Tyslin's repo (null when GitHub couldn't be reached), and the repo URL. */
    stars(): Promise<{ count: number | null; url: string }>
    openDataFolder(): Promise<void>
  }
  updates: {
    status(): Promise<UpdateStatus>
    check(): Promise<UpdateStatus>
    install(): Promise<void>
    openDownload(): Promise<void>
    onStatus(cb: (s: UpdateStatus) => void): () => void
  }
}
