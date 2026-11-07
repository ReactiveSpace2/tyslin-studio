export type Shape = 'block' | 'round' | 'hex' | 'pill'
export type Tone = 'lime' | 'ink' | 'paper'
export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'openrouter'
/** Providers that need an API key (stored encrypted). */
export type KeyProvider = 'anthropic' | 'openai' | 'gemini' | 'openrouter'
/**
 * What runs the agent: Tyslin's own model runtime, or an external agent driven over ACP
 * (Agent Client Protocol). The external program is installed by the user, never bundled.
 */
export type EngineId = 'builtin' | 'goose' | 'hermes' | 'zeroclaw' | 'openclaw' | 'custom' | 'claude-code' | 'gemini-cli' | 'codex'
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

/** An integration: an MCP server agents on external adapters can use. Secret values never leave main. */
export interface McpServerInfo {
  id: string
  /** Also the server name the agent sees (lowercase letters, digits, - and _). */
  name: string
  /** Preset id from shared/mcpPresets.ts, or '' for one the user set up. */
  preset: string
  transport: 'http' | 'stdio'
  url: string
  command: string
  args: string[]
  agentIds: string[]
  /** Names of the saved headers and environment variables (values stay encrypted in main). */
  secretNames: string[]
  lastTest?: { ok: boolean; at: number; tools?: string[]; error?: string }
  createdAt: number
}

export interface McpServerInput {
  id?: string
  name: string
  preset: string
  transport: 'http' | 'stdio'
  url?: string
  /** stdio: the command line, e.g. "npx -y some-mcp-server". */
  commandLine?: string
  /** A preset's token, sent as "Authorization: Bearer <token>". Undefined keeps the saved one. */
  token?: string
  /** Custom http: "Name: value" lines. Undefined keeps the saved ones. */
  headers?: string
  /** Custom stdio: "NAME=value" lines. Undefined keeps the saved ones. */
  env?: string
  agentIds?: string[]
}

/** Adapters that sign in with the user's own Claude, ChatGPT or Google account. */
export type AccountEngine = 'claude-code' | 'codex' | 'gemini-cli'

/** Whether an account adapter is installed and signed in, read from the adapter's own login (never stored by Tyslin). */
export interface AccountStatus {
  engine: AccountEngine
  installed: boolean
  signedIn: boolean
  email?: string
  /** Plan name when the adapter reports one, e.g. "max", "plus". */
  plan?: string
  /** true = agents on this adapter use the account; false = the API key from Settings → Models when one is saved. */
  useAccount: boolean
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
  /** The agency this agent belongs to (agencies.id), null for Builder and loose agents. */
  agency: string | null
  /** The department team it was created for (archived teams), '' if none. */
  team: string
  createdAt: number
  updatedAt: number
}

/** Fields added after v0.4 are optional on input; saving keeps the stored value when they're missing. */
type AgentExtras = 'projectId' | 'leadId' | 'pinned' | 'paused' | 'tools' | 'channels' | 'head' | 'team' | 'agency'
export type AgentInput = Omit<Agent, 'id' | 'createdAt' | 'updatedAt' | AgentExtras> & Partial<Pick<Agent, AgentExtras>>

/** Kanban: columns of cards (boards/<name>.board.json). A card can be given to an agent and run. */
export interface KanbanCard {
  id: string
  title: string
  notes: string
  /** Label ids from the board's labels. */
  labels: string[]
  /** YYYY-MM-DD. */
  due?: string
  /** An agent, an assistant or 'default' (the default model). */
  agentId?: string
  /** The agent's last reply for this card, and its chat. */
  result?: string
  sessionId?: string
  /** Agency boards: the worker the Lead gave the card to (same as agentId once it runs). */
  assignee?: string
  /** The agency this board belongs to. */
  agency?: string
  /** Estimated cost of the runs on this card, in the provider's currency; undefined = not reported. */
  cost?: number
  /** The card this one was split from. */
  parentCard?: string
  /** What happened on the card: moves, runs, reviews. */
  log?: { at: number; text: string }[]
  /** The last run on this card and where it stands. */
  runId?: string
  status?: 'running' | 'done' | 'failed'
  createdAt: number
}

/** An agency: a Lead and its workers in one project, with a board, a channel and a budget (agencies table). */
export interface Agency {
  id: string
  name: string
  description: string
  goal: string
  /** Standing instructions every agent in the agency follows. */
  prompt: string
  plan: string[]
  templateId: string
  leadId: string | null
  projectId: string
  /** Default adapter for new workers: an engine id, or 'template' for the template's own mix. */
  adapter: string
  /** Board file, relative to the project folder. */
  boardPath: string
  channel: { kind: 'telegram' | 'slack' | 'none' }
  notify: 'all' | 'questions' | 'digest'
  /** Monthly budget in the default model's currency; null = none set. */
  budget: number | null
  spent: number
  autoRun: boolean
  paused: boolean
  createdAt: number
  updatedAt: number
}

export interface AgencyCreateInput {
  name: string
  templateId: string | null
  description: string
  goal: string
  prompt: string
  /** 'template' keeps each worker on the engine its template names. */
  adapter: string
  /** Skill packs to install (skillPacks.ts ids). */
  packs: string[]
  autoRun: boolean
  channel: 'telegram' | 'slack' | 'none'
  notify: 'all' | 'questions' | 'digest'
  budget: number | null
}

export type AgencyUpdateInput = Partial<Pick<Agency, 'name' | 'description' | 'goal' | 'prompt' | 'plan' | 'adapter' | 'notify' | 'budget' | 'autoRun' | 'paused'> & { channel: Agency['channel'] }>

export interface KanbanColumn {
  id: string
  title: string
  cards: KanbanCard[]
}

export interface KanbanDoc {
  version: 1
  columns: KanbanColumn[]
  labels: { id: string; name: string; color: OrgColor }[]
}

/** Canvas: a design board of frames, shapes, text and lines (canvas/<name>.canvas.json). */
export type CanvasElType = 'frame' | 'rect' | 'ellipse' | 'text' | 'line'

export interface CanvasEl {
  id: string
  type: CanvasElType
  /** Frames show it above them; other layers use it in the layer list. */
  name?: string
  /** Lines run from (x, y) to (x + w, y + h), so w and h may be negative. */
  x: number
  y: number
  w: number
  h: number
  /** CSS colour or 'none'. */
  fill: string
  stroke: string
  strokeWidth: number
  radius: number
  opacity: number
  text?: string
  fontSize?: number
  fontWeight?: number
  /** Text colour. */
  color?: string
  align?: 'left' | 'center' | 'right'
  /** Lines: arrow head at the end. */
  arrow?: boolean
}

export interface CanvasDoc {
  version: 2
  elements: CanvasEl[]
}

/** Files made on the Mind mapper, Automation and Canvas screens (a run is an automation's log). */
export type StudioKind = 'mindmap' | 'automation' | 'run' | 'canvas' | 'board' | 'document' | 'svg' | 'png'

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

/** Old Workflows file (workflows/<name>.workflow.json); converted to an automation when Automation lists files. */
export interface WorkflowDoc {
  version: 1
  brief: string
  steps: { id: string; agentId: string; instruction: string }[]
}

/**
 * Automation: a graph of nodes, like n8n. Triggers start a run; each node gets the text the node before
 * it produced ({{input}}) and passes its own output on. Saved as automations/<name>.automation.json.
 */
export type AutoNodeType = 'manual' | 'schedule' | 'agent' | 'http' | 'condition' | 'template' | 'file' | 'telegram' | 'wait'

export interface AutoNode {
  id: string
  type: AutoNodeType
  name: string
  x: number
  y: number
  config: Record<string, string | number | boolean>
}

export interface AutoEdge {
  id: string
  from: string
  /** 'out', or 'true'/'false' from an If node. */
  port: 'out' | 'true' | 'false'
  to: string
}

export interface AutomationDoc {
  version: 1
  /** Schedule triggers only fire while the automation is active (and Tyslin is open). */
  active: boolean
  nodes: AutoNode[]
  edges: AutoEdge[]
}

export interface AutomationProgress {
  runId: string
  /** The automation file being run. */
  path: string
  projectId: string
  trigger: 'manual' | 'schedule'
  /** A node's state; absent with `finished` for the whole run. */
  nodeId?: string
  status: 'running' | 'done' | 'failed' | 'stopped'
  output?: string
  error?: string
  sessionId?: string
  finished?: boolean
  /** When the run ends: the Markdown log, relative to the project folder. */
  logPath?: string
}

export interface AskResult {
  ok: boolean
  reply: string
  error?: string
  sessionId?: string
}

export type DriveKind = 'folder' | 'mindmap' | 'automation' | 'canvas' | 'board' | 'image' | 'text' | 'pdf' | 'archive' | 'file'

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

export interface SlackStatus {
  connected: boolean
  botName: string
  linked: { channelId: string; name: string }[]
  running: boolean
  error: string
  /** The open one-time code, if any: post "tyslin CODE" in the channel after inviting the bot. */
  linkCode: string | null
}

export type MessageKind = 'brief' | 'question' | 'review' | 'digest'

/** A message from an agency's Lead to the boss, kept whether or not it left the app (channels.ts). */
export interface ChannelMessage {
  id: string
  agencyId: string
  agentId: string
  kind: MessageKind
  text: string
  /** Where it was delivered; 'app' when it stayed in Tyslin. */
  via: 'telegram' | 'slack' | 'app'
  delivered: boolean
  createdAt: number
  /** Quick answers the Lead offered with a question (shown as buttons in the Inbox and the notification). */
  options: string[]
  /** The card the message is about, when the Lead named one. */
  cardId: string | null
  /** The boss's answer, sent back to the Lead ('' = not answered). */
  reply: string
  repliedAt: number | null
  /** When the boss opened it in the Inbox (null = unread). */
  readAt: number | null
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
  openrouterKeySet: boolean
  ollamaUrl: string
  /** The model Mind mapper, Canvas and Automation use when "Default model" is picked (shown in the status bar). */
  defaultModel: DefaultModel
}

/** The saved OpenRouter key's details (GET /api/v1/key). `valid` false = the key was revoked. Dollars. */
export interface OpenRouterAccount {
  valid: boolean
  label: string
  usage: number
  limit: number | null
  freeTier: boolean
}

/** One model from OpenRouter's public list. Prices are dollars per million tokens; null = unknown. */
export interface OpenRouterModel {
  id: string
  name: string
  context: number | null
  input: number | null
  output: number | null
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

/** A starter agent or assistant from the library ("New agent" / "New assistant"). */
export interface StarterInfo {
  kind: AgentKind
  name: string
  description: string
  head: string | null
  shape: Shape
  tone: Tone
  engine: EngineId
  skills: string[]
}

/** Creating a department team (shared/teams.ts). */
export interface TeamCreateInput {
  templateId: string
  /** An existing project with a folder; leave out to make a new project folder. */
  projectId?: string | null
  newProjectName?: string
  /** Turn on the lead's scheduled task. Default true. */
  onTheirOwn?: boolean
  /** File changes wait for review. Default true. */
  askBeforeWrite?: boolean
  /** The lead answers on Telegram. */
  telegramLead?: boolean
}

export interface TeamCreateResult {
  projectId: string
  projectName: string
  agentIds: string[]
  leadId: string | null
  taskId?: string
}

export interface TeamsStatus {
  /** Each template and the projects that already have it. */
  teams: { id: string; projects: string[] }[]
}

/** Google Drive sync of the current organization's project folders. */
export interface GDriveStatus {
  /** This build has a Google client (needed to connect). */
  configured: boolean
  connected: boolean
  email: string
  auto: boolean
  autoMinutes: number
  syncing: boolean
  /** The project being synced now. */
  current?: string
  lastSync: number | null
  lastError: string
  /** The organization's folder in Google Drive. */
  folderUrl: string
  projects: { id: string; name: string; lastSync: number | null; files: number; error: string }[]
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
  /** Token counts for one model call (built-in runtimes only); cards add them up for their cost. */
  | { type: 'usage'; inputTokens: number; outputTokens: number }
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
    /** The starter agents and assistants that can be added to a project. */
  }
  projects: {
    list(): Promise<Project[]>
    create(name: string, folder: string | null): Promise<Project>
    pickFolder(): Promise<string | null>
    /** A new project with a new folder under Documents/Tyslin Studio/<organization>/. */
    createWithFolder(name: string): Promise<Project>
    /** Where createWithFolder would put the folder. */
    newFolderPath(name: string): Promise<string>
    rename(id: string, name: string): Promise<void>
    /** Deletes the project with its agents, assistants, chats and tasks (files stay on disk). Not the Default project. */
    remove(id: string): Promise<{ agents: number }>
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
  integrations: {
    list(): Promise<McpServerInfo[]>
    save(input: McpServerInput): Promise<McpServerInfo>
    remove(id: string): Promise<void>
    /** Which agents use it (only agents on an external adapter can). */
    setAgents(id: string, agentIds: string[]): Promise<McpServerInfo>
    /** Connects, lists its tools and stops; the result is kept as lastTest. */
    test(id: string): Promise<McpServerInfo>
  }
  accounts: {
    /** Sign-in state of Claude Code, Codex and Gemini CLI. */
    status(): Promise<AccountStatus[]>
    /** Opens the adapter's own browser sign-in and waits for it (5 min). Afterwards agents on it use the account. */
    signIn(engine: AccountEngine): Promise<AccountStatus>
    cancelSignIn(engine: AccountEngine): Promise<void>
    /** Agents on this adapter use the account (true) or the saved API key (false). */
    setUseAccount(engine: AccountEngine, on: boolean): Promise<AccountStatus>
    /** The sign-in page's address when the adapter prints one, so the user can open it if the browser didn't. */
    onSignInUrl(cb: (o: { engine: AccountEngine; url: string }) => void): () => void
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
    /** Forgets a provider's key (the provider is then "not connected"). */
    removeKey(provider: KeyProvider): Promise<void>
    /** OpenRouter's public model list with context and prices, cached for an hour; [] when offline. */
    openrouterModels(): Promise<OpenRouterModel[]>
    /** Sign in on openrouter.ai in the browser (OAuth PKCE) and save the key it hands over. */
    connectOpenRouter(): Promise<void>
    cancelOpenRouter(): Promise<void>
    /** The saved OpenRouter key's label, spend and limit; null without a key or offline. */
    openrouterAccount(): Promise<OpenRouterAccount | null>
    prefs(): Promise<Preferences>
    setPrefs(p: Partial<Preferences>): Promise<Preferences>
    /** Fires when the zoom changes anywhere (slider, Settings or keyboard shortcut). */
    onZoom(cb: (zoom: number) => void): () => void
  }
  slack: {
    status(): Promise<SlackStatus>
    /** Checks the token with Slack, then saves it encrypted; '' disconnects. */
    setToken(token: string): Promise<SlackStatus>
    linkCode(): Promise<SlackStatus>
    unlink(channelId: string): Promise<SlackStatus>
  }
  channels: {
    /** Messages Leads sent the boss, newest first; for one agency when given. */
    list(agencyId?: string): Promise<ChannelMessage[]>
    onMessage(cb: (m: ChannelMessage) => void): () => void
    /** Answers a message: saved on it, noted on its card and sent to the Lead's Inbox chat. */
    reply(id: string, text: string): Promise<ChannelMessage>
    markRead(ids: string[]): Promise<number>
    /** Unread messages in the current organization (the Inbox count and the app icon badge). */
    unread(): Promise<number>
    /** A desktop notification was clicked: open the Inbox at that message. */
    onOpen(cb: (id: string) => void): () => void
  }
  agencies: {
    list(): Promise<Agency[]>
    get(id: string): Promise<Agency | null>
    /** Creates the project folder, the Lead and workers, the board, the channel link and the Lead's task. */
    create(input: AgencyCreateInput): Promise<Agency>
    update(id: string, input: AgencyUpdateInput): Promise<Agency>
    /** Deletes the agency, its agents, board and task; files in its folder stay. */
    remove(id: string): Promise<void>
    /** Runs the Lead's "plan the Inbox" prompt now; returns the chat id. */
    plan(id: string): Promise<string>
    /** A brief from the Inbox: a card in Inbox, then the Lead's planning run unless the agency is paused. */
    brief(id: string, text: string): Promise<{ cardId: string; planned: boolean }>
  }
  cards: {
    /** Runs a card with its assignee (or the Lead); the result, chat and cost land on the card. Returns the chat id. */
    run(agencyId: string, cardId: string): Promise<string>
    /** Card ids with a run in progress. */
    running(): Promise<string[]>
    /** A board file changed on disk (a run finished, the Lead moved a card). */
    onBoardChanged(cb: (p: { projectId: string; path: string }) => void): () => void
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
    write(projectId: string | null, target: { path?: string; kind?: StudioKind; name?: string }, content: string, encoding?: 'utf8' | 'base64'): Promise<StudioFile>
    remove(projectId: string | null, path: string): Promise<void>
    /** Shows the file (or the project folder) in the system file manager. */
    reveal(projectId: string | null, path?: string): Promise<void>
    /** One message to an agent or assistant in a new chat titled `title`; resolves with its reply. */
    ask(agentId: string, projectId: string | null, prompt: string, title: string): Promise<AskResult>
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
  gdrive: {
    status(): Promise<GDriveStatus>
    /** Opens Google in the browser to grant Drive access (drive.file), then syncs. */
    connect(): Promise<GDriveStatus>
    disconnect(): Promise<GDriveStatus>
    sync(): Promise<GDriveStatus>
    setAuto(on: boolean): Promise<GDriveStatus>
    openFolder(): Promise<void>
    onStatus(cb: (s: GDriveStatus) => void): () => void
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
    /** Deletes all app data, moves Tyslin's files to the Trash, then restarts as a fresh install. */
    reset(): Promise<void>
  }
  updates: {
    status(): Promise<UpdateStatus>
    check(): Promise<UpdateStatus>
    install(): Promise<void>
    openDownload(): Promise<void>
    onStatus(cb: (s: UpdateStatus) => void): () => void
  }
}
