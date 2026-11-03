export type Shape = 'block' | 'round' | 'hex' | 'pill'
export type Tone = 'lime' | 'ink' | 'paper'
export type ProviderId = 'anthropic' | 'openai' | 'ollama'
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
}

export interface Skill {
  id: string
  name: string
  description: string
  body: string
}

export interface ProviderSettings {
  anthropicKeySet: boolean
  openaiKeySet: boolean
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
  | { type: 'state_update'; status: 'running' | 'waiting_for_review' }
  | { type: 'run_finished' }
  | { type: 'run_error'; error: string }

export type RunEvent = RunEventBody & { runId: string; sessionId: string }

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

export interface UpdateStatus {
  /** idle: not checked yet (always in dev) · none: up to date · available: newer version to download by hand */
  state: 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error'
  currentVersion: string
  /** True when this install can download and install updates itself (Windows, Linux AppImage). */
  autoInstall: boolean
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
  sessions: {
    list(agentId?: string): Promise<Session[]>
    create(agentId: string, projectId: string | null): Promise<Session>
    messages(sessionId: string): Promise<Message[]>
    send(sessionId: string, text: string): Promise<void>
    onEvent(cb: (e: RunEvent) => void): () => void
  }
  changes: {
    list(sessionId: string): Promise<PendingChange[]>
    /** Applies the accepted hunks (indexes from `diffHunks`) and reports the outcome back into the run. */
    resolve(changeId: string, acceptedHunks: number[], note: string): Promise<PendingChange>
  }
  skills: {
    list(): Promise<Skill[]>
  }
  settings: {
    get(): Promise<ProviderSettings>
    setKey(provider: 'anthropic' | 'openai', key: string): Promise<void>
    setOllamaUrl(url: string): Promise<void>
  }
  updates: {
    status(): Promise<UpdateStatus>
    check(): Promise<UpdateStatus>
    install(): Promise<void>
    openDownload(): Promise<void>
    onStatus(cb: (s: UpdateStatus) => void): () => void
  }
}
