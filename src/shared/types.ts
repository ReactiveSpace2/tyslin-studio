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

/** ask: file writes are staged for review · direct: written straight to disk */
export type WriteMode = 'ask' | 'direct'

export interface Agent {
  id: string
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
  createdAt: number
  updatedAt: number
}

export type AgentInput = Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>

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
export interface Preferences {
  /** File-change mode given to newly created agents. */
  defaultWriteMode: WriteMode
  /** Added to every agent's instructions. */
  sharedInstructions: string
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
    /** Deletes the pack's skills and detaches them from every agent. */
    uninstall(id: string): Promise<void>
  }
  settings: {
    get(): Promise<ProviderSettings>
    setKey(provider: KeyProvider, key: string): Promise<void>
    setOllamaUrl(url: string): Promise<void>
    prefs(): Promise<Preferences>
    setPrefs(p: Partial<Preferences>): Promise<Preferences>
  }
  app: {
    info(): Promise<AppInfo>
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
