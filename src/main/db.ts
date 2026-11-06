import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, renameSync } from 'fs'
import { randomUUID } from 'crypto'
import { BUILT_IN_SKILLS, SKILL_LIBRARY_VERSION } from './seedSkills'
import { BUILT_IN_AGENTS } from './seedAgents'
import type { StoredAttachment } from './attachments'
import { clampZoom } from '@shared/types'
import { HEAD_IDS } from '@shared/heads'
import type { Agency, AgencyUpdateInput, Agent, AgentInput, ChangeStatus, DashboardStats, Organization, OrgColor, ScheduledTask, TaskInput, Message, PendingChange, Preferences, Project, ProviderId, Session, Skill, SkillInput } from '@shared/types'

/**
 * Organizations: each one is its own SQLite file, so agents, assistants, projects, chats, skills and
 * agent settings never mix. The default organization ("Tyslin") is the original tyslin.db, which is
 * also the home database: it lists the organizations and keeps what belongs to this computer rather
 * than to one organization (see GLOBAL_SETTING).
 */
let home: Database.Database
/** The current organization's database. Every query below uses it. */
let db: Database.Database

export const DEFAULT_ORG = 'default'

/**
 * Schema generation, kept in SQLite's user_version. 2 = the agencies schema (6 Nov 2026). A home database
 * from before it is set aside as tyslin-v0.5.db (with its orgs/ folder as orgs-v0.5/) and a fresh one is
 * created; only per-computer settings are copied across (see COPIED_SETTINGS).
 */
export const SCHEMA_VERSION = 2
const OLD_SUFFIX = '-v0.5'
/** Settings carried into a fresh database: keys, the account, appearance, Telegram, Drive. Not `onboarded`, so setup runs. */
const COPIED_SETTINGS = (key: string): boolean =>
  key.startsWith('secret:') || key.startsWith('engine:') || key.startsWith('telegram:') || key.startsWith('gdrive:') ||
  key === 'account' || key === 'ollamaUrl' || key === 'pref:theme' || key === 'pref:zoom' ||
  key === 'pref:iconStyle' || key === 'pref:railLabels' || key === 'pref:accent' ||
  key === 'pref:defaultProvider' || key === 'pref:defaultModel'

/** Settings shared by every organization on this computer. Everything else is per organization. */
const GLOBAL_SETTING = (key: string): boolean =>
  key.startsWith('secret:') || key.startsWith('engine:') || key.startsWith('org:') || key.startsWith('telegram:') || key.startsWith('gdrive:') ||
  key === 'account' || key === 'ollamaUrl' || key === 'pref:theme' || key === 'pref:zoom' ||
  key === 'pref:iconStyle' || key === 'pref:railLabels' || key === 'pref:accent' ||
  key === 'pref:defaultProvider' || key === 'pref:defaultModel' || key === 'onboarded'

const orgFile = (id: string): string =>
  id === DEFAULT_ORG ? join(app.getPath('userData'), 'tyslin.db') : join(app.getPath('userData'), 'orgs', `${id}.db`)

/** Opens an organization's database, bringing its schema up to date and adding the built-ins it is missing. */
function openOrgDb(id: string): Database.Database {
  if (id !== DEFAULT_ORG) mkdirSync(join(app.getPath('userData'), 'orgs'), { recursive: true })
  const d = new Database(orgFile(id))
  d.pragma('journal_mode = WAL')
  d.pragma('foreign_keys = ON')
  db = d
  if (id === DEFAULT_ORG) home = d
  migrate()
  seed()
  seedSkills()
  return d
}

/** Moves a pre-agencies home database (and its orgs/) aside and returns the settings worth copying from it. */
function setAsideOldDb(): [string, string][] {
  const file = orgFile(DEFAULT_ORG)
  if (!existsSync(file)) return []
  const probe = new Database(file)
  const version = probe.pragma('user_version', { simple: true }) as number
  if (version >= SCHEMA_VERSION) { probe.close(); return [] }
  let rows: [string, string][] = []
  try {
    rows = (probe.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[])
      .filter((r) => COPIED_SETTINGS(r.key)).map((r) => [r.key, r.value])
  } catch { /* no settings table: nothing to copy */ }
  probe.close()
  const base = app.getPath('userData')
  for (const ext of ['', '-wal', '-shm']) {
    if (existsSync(file + ext)) renameSync(file + ext, join(base, `tyslin${OLD_SUFFIX}.db${ext}`))
  }
  if (existsSync(join(base, 'orgs'))) renameSync(join(base, 'orgs'), join(base, `orgs${OLD_SUFFIX}`))
  return rows
}

export function openDb(): Database.Database {
  const copied = setAsideOldDb()
  openOrgDb(DEFAULT_ORG)
  home.pragma(`user_version = ${SCHEMA_VERSION}`)
  for (const [key, value] of copied) setSetting(key, value)
  home.exec('CREATE TABLE IF NOT EXISTS orgs (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL)')
  if (!(home.prepare('PRAGMA table_info(orgs)').all() as { name: string }[]).some((c) => c.name === 'color')) {
    home.exec("ALTER TABLE orgs ADD COLUMN color TEXT NOT NULL DEFAULT 'lime'")
  }
  home.prepare('INSERT OR IGNORE INTO orgs (id, name, created_at) VALUES (?, ?, ?)').run(DEFAULT_ORG, 'Tyslin', Date.now())
  const current = getSetting('org:current')
  if (current && current !== DEFAULT_ORG && home.prepare('SELECT 1 FROM orgs WHERE id = ?').get(current)) openOrgDb(current)
  return db
}

export function listOrgs(): Organization[] {
  const current = getSetting('org:current') || DEFAULT_ORG
  return (home.prepare('SELECT id, name, color, created_at AS createdAt FROM orgs ORDER BY id = ? DESC, created_at').all(DEFAULT_ORG) as Omit<Organization, 'current'>[])
    .map((o) => ({ ...o, color: ORG_COLOR_IDS.includes(o.color) ? o.color : 'lime', current: o.id === current }))
}

export function currentOrg(): Organization {
  return listOrgs().find((o) => o.current) ?? listOrgs()[0]
}

/** Creates an organization with its own empty database (plus the built-in agents, assistants and skills). */
const ORG_COLOR_IDS: OrgColor[] = ['lime', 'teal', 'amber', 'coral', 'violet']

export function setOrgColor(id: string, color: OrgColor): void {
  if (!ORG_COLOR_IDS.includes(color)) throw new Error('Unknown colour.')
  home.prepare('UPDATE orgs SET color = ? WHERE id = ?').run(color, id)
}

export function createOrg(name: string, color: OrgColor = 'teal'): Organization {
  const clean = name.trim().slice(0, 60)
  if (!clean) throw new Error('Give the organization a name.')
  const id = randomUUID()
  home.prepare('INSERT INTO orgs (id, name, color, created_at) VALUES (?, ?, ?, ?)').run(id, clean, ORG_COLOR_IDS.includes(color) ? color : 'teal', Date.now())
  const prev = db
  openOrgDb(id).close()
  db = prev
  return listOrgs().find((o) => o.id === id)!
}

export function renameOrg(id: string, name: string): void {
  const clean = name.trim().slice(0, 60)
  if (!clean) throw new Error('Give the organization a name.')
  home.prepare('UPDATE orgs SET name = ? WHERE id = ?').run(clean, id)
}

/** Makes another organization current. The caller makes sure nothing is running first. */
export function switchOrg(id: string): void {
  if (!home.prepare('SELECT 1 FROM orgs WHERE id = ?').get(id)) throw new Error('That organization no longer exists.')
  if (db !== home) db.close()
  if (id === DEFAULT_ORG) db = home
  else openOrgDb(id)
  setSetting('org:current', id)
}

function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '', shape TEXT NOT NULL, tone TEXT NOT NULL,
      provider TEXT NOT NULL, model TEXT NOT NULL, skills TEXT NOT NULL DEFAULT '[]',
      schedule TEXT NOT NULL DEFAULT 'manual', is_mascot INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, folder TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL, title TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL, body TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pending_changes (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, tool_call_id TEXT NOT NULL,
      file_path TEXT NOT NULL, original TEXT, proposed TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pending_changes_session ON pending_changes(session_id, created_at);
  `)
  addColumn('agents', 'write_mode', "TEXT NOT NULL DEFAULT 'ask'")
  addColumn('agents', 'engine', "TEXT NOT NULL DEFAULT 'builtin'")
  addColumn('agents', 'kind', "TEXT NOT NULL DEFAULT 'agent'")
  // Agent pages and org chart (v0.5): one project per agent, a lead, pin/pause, file access, channels, last result.
  addColumn('agents', 'project_id', 'TEXT')
  addColumn('agents', 'lead_id', 'TEXT')
  addColumn('agents', 'pinned', 'INTEGER NOT NULL DEFAULT 0')
  addColumn('agents', 'paused', 'INTEGER NOT NULL DEFAULT 0')
  addColumn('agents', 'tools', `TEXT NOT NULL DEFAULT '{"read":true,"write":true}'`)
  addColumn('agents', 'channels', "TEXT NOT NULL DEFAULT '{}'")
  addColumn('agents', 'last_run_at', 'INTEGER')
  addColumn('agents', 'last_error', "TEXT NOT NULL DEFAULT ''")
  addColumn('agents', 'head', 'TEXT')
  addColumn('agents', 'team', "TEXT NOT NULL DEFAULT ''")
  // Agencies (6 Nov 2026): a Lead and its workers around one project, a board, a channel and a budget.
  addColumn('agents', 'agency', 'TEXT')
  db.exec(`CREATE TABLE IF NOT EXISTS agencies (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', goal TEXT NOT NULL DEFAULT '',
    prompt TEXT NOT NULL DEFAULT '', plan TEXT NOT NULL DEFAULT '[]', template_id TEXT NOT NULL DEFAULT '',
    lead_id TEXT, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    adapter TEXT NOT NULL DEFAULT '', board_path TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL DEFAULT '{}', notify TEXT NOT NULL DEFAULT 'questions',
    budget REAL, spent REAL NOT NULL DEFAULT 0, auto_run INTEGER NOT NULL DEFAULT 0,
    paused INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  )`)
  // Chat attachments: what the user sees (JSON list) and the text the model sees.
  addColumn('skills', 'source_url', "TEXT NOT NULL DEFAULT ''")
  // Skill packs installed from GitHub (skillPacks.ts): which commit, and which skills came from it.
  addColumn('skills', 'pack_id', "TEXT NOT NULL DEFAULT ''")
  db.exec('CREATE TABLE IF NOT EXISTS skill_packs (id TEXT PRIMARY KEY, commit_sha TEXT NOT NULL, installed_at INTEGER NOT NULL)')
  // Dev builds briefly shipped humanizer as a built-in; treat that copy as an install of the pack.
  const adopted = db.prepare("UPDATE skills SET pack_id = 'humanizer' WHERE name = 'humanizer' AND pack_id = '' AND source_url LIKE 'https://github.com/blader/humanizer%'").run()
  if (adopted.changes) db.prepare("INSERT OR IGNORE INTO skill_packs (id, commit_sha, installed_at) VALUES ('humanizer', '', ?)").run(Date.now())
  // Packs found through the GitHub agent-skills topic aren't in skillPacks.ts, so their card details are kept here.
  addColumn('skill_packs', 'repo', "TEXT NOT NULL DEFAULT ''")
  addColumn('skill_packs', 'meta', "TEXT NOT NULL DEFAULT ''")
  addColumn('messages', 'attachments', "TEXT NOT NULL DEFAULT '[]'")
  addColumn('messages', 'context', "TEXT NOT NULL DEFAULT ''")
  // Scheduled tasks (Tasks screen); run by scheduler.ts while the app is open.
  // Google Drive sync state per project: the last synced copy of each file (md5, size, mtime, Drive id).
  db.exec(`CREATE TABLE IF NOT EXISTS gsync_files (
    project_id TEXT NOT NULL, path TEXT NOT NULL, md5 TEXT NOT NULL, size INTEGER NOT NULL, mtime REAL NOT NULL, remote_id TEXT NOT NULL,
    PRIMARY KEY (project_id, path))`)
  db.exec(`CREATE TABLE IF NOT EXISTS gsync_projects (
    project_id TEXT PRIMARY KEY, folder_id TEXT, last_sync INTEGER, last_error TEXT NOT NULL DEFAULT '', files INTEGER NOT NULL DEFAULT 0)`)
  db.exec(`CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, prompt TEXT NOT NULL,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    schedule TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
    next_run_at INTEGER, last_run_at INTEGER, last_status TEXT, last_error TEXT NOT NULL DEFAULT '',
    last_session_id TEXT, created_at INTEGER NOT NULL
  )`)
}

/** CREATE TABLE IF NOT EXISTS never alters an existing table, so new columns go through here. */
function addColumn(table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

/** Every database gets Builder (the mascot) once. Agencies bring their own agents; there are no other built-ins. */
function seed(): void {
  if (db.prepare('SELECT 1 FROM agents WHERE is_mascot = 1').get()) return
  const builder = BUILT_IN_AGENTS.find((a) => a.isMascot)
  if (builder) saveAgent(builder)
}

/** Adds built-in skills new since this install last seeded; skills already present (by name) are left as they are. */
function seedSkills(): void {
  if (Number(getSetting('seed:skillsVersion') ?? 0) >= SKILL_LIBRARY_VERSION) return
  const ins = db.prepare('INSERT OR IGNORE INTO skills (id, name, description, body, source_url) VALUES (?, ?, ?, ?, ?)')
  db.transaction(() => {
    for (const s of BUILT_IN_SKILLS) ins.run(randomUUID(), s.name, s.description, s.body, s.sourceUrl ?? '')
    setSetting('seed:skillsVersion', String(SKILL_LIBRARY_VERSION))
  })()
}

type AgentRow = {
  id: string; name: string; description: string; instructions: string; shape: string; tone: string
  provider: string; model: string; skills: string; schedule: string; write_mode: string; engine: string; kind: string; is_mascot: number
  project_id: string | null; lead_id: string | null; pinned: number; paused: number; tools: string; channels: string
  last_run_at: number | null; last_error: string; head: string | null; team: string; agency: string | null
  created_at: number; updated_at: number
}

const parseJson = <T>(s: string, fallback: T): T => { try { return { ...fallback, ...JSON.parse(s) } } catch { return fallback } }

const toAgent = (r: AgentRow): Agent => ({
  id: r.id, kind: r.kind === 'assistant' ? 'assistant' : 'agent', name: r.name, description: r.description, instructions: r.instructions,
  shape: r.shape as Agent['shape'], tone: r.tone as Agent['tone'], provider: r.provider as Agent['provider'],
  model: r.model, skills: JSON.parse(r.skills), schedule: r.schedule,
  engine: (r.engine || 'builtin') as Agent['engine'],
  writeMode: r.write_mode === 'direct' ? 'direct' : 'ask', isMascot: !!r.is_mascot,
  projectId: r.project_id, leadId: r.lead_id, pinned: !!r.pinned, paused: !!r.paused,
  tools: parseJson(r.tools, { read: true, write: true }), channels: parseJson(r.channels, { telegram: false }),
  head: r.head && HEAD_IDS.includes(r.head) ? r.head : null,
  team: r.team ?? '',
  agency: r.agency ?? null,
  createdAt: r.created_at, updatedAt: r.updated_at
})

export function listAgents(): Agent[] {
  return (db.prepare('SELECT * FROM agents ORDER BY is_mascot DESC, created_at').all() as AgentRow[]).map(toAgent)
}

export function getAgent(id: string): Agent | null {
  const r = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as AgentRow | undefined
  return r ? toAgent(r) : null
}

export function saveAgent(raw: AgentInput & { id?: string }): Agent {
  const now = Date.now()
  const existing = raw.id ? getAgent(raw.id) : null
  // The kind is fixed once created. Assistants always run on Tyslin's own models, never on a schedule.
  const kind = existing?.kind ?? (raw.kind === 'assistant' ? 'assistant' : 'agent')
  const input = kind === 'assistant'
    ? { ...raw, engine: 'builtin' as const, schedule: 'manual', writeMode: 'ask' as const, isMascot: false }
    : raw
  // Extras: keep what's stored when not given. Builder (the mascot) never joins a project. An assistant's
  // project is only its workspace (where it shows up); it never works in the folder and has no lead.
  const mascot = existing?.isMascot ?? input.isMascot
  const inProject = kind === 'agent' && !mascot
  const projectId = mascot ? null : input.projectId !== undefined ? input.projectId : existing?.projectId ?? null
  if (projectId && !getProject(projectId)) throw new Error('That project no longer exists.')
  let leadId = !inProject ? null : input.leadId !== undefined ? input.leadId : existing?.leadId ?? null
  // A lead must be another agent in the same project, and not one of this agent's own team (no loops).
  if (leadId) {
    const lead = getAgent(leadId)
    if (!lead || !projectId || lead.projectId !== projectId || lead.id === existing?.id) leadId = null
    else if (existing) {
      for (let a: Agent | null = lead, hops = 0; a && hops < 50; a = a.leadId ? getAgent(a.leadId) : null, hops++) {
        if (a.id === existing.id) throw new Error(`${lead.name} reports to ${existing.name}, so it can't be ${existing.name}'s lead.`)
      }
    }
  }
  const pinned = input.pinned ?? existing?.pinned ?? false
  const paused = input.paused ?? existing?.paused ?? false
  const tools = input.tools ?? existing?.tools ?? { read: true, write: true }
  const channels = input.channels ?? existing?.channels ?? { telegram: false }
  const head = input.head !== undefined ? (input.head && HEAD_IDS.includes(input.head) ? input.head : null) : existing?.head ?? null
  const agency = input.agency !== undefined ? input.agency : existing?.agency ?? null
  if (existing) {
    // Moving to another project: its team stays behind and reports to you.
    if (existing.projectId !== projectId) db.prepare('UPDATE agents SET lead_id = NULL WHERE lead_id = ?').run(existing.id)
    db.prepare(`UPDATE agents SET name=?, description=?, instructions=?, shape=?, tone=?, provider=?, model=?,
      skills=?, schedule=?, engine=?, write_mode=?, is_mascot=?, project_id=?, lead_id=?, pinned=?, paused=?, tools=?, channels=?,
      head=?, agency=?, updated_at=? WHERE id=?`).run(
      input.name, input.description, input.instructions, input.shape, input.tone, input.provider, input.model,
      JSON.stringify(input.skills), input.schedule, input.engine, input.writeMode, input.isMascot ? 1 : 0,
      projectId, leadId, pinned ? 1 : 0, paused ? 1 : 0, JSON.stringify(tools), JSON.stringify(channels), head, agency, now, existing.id)
    return getAgent(existing.id)!
  }
  const id = randomUUID()
  db.prepare(`INSERT INTO agents (id, kind, name, description, instructions, shape, tone, provider, model, skills,
    schedule, engine, write_mode, is_mascot, project_id, lead_id, pinned, paused, tools, channels, head, agency, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, kind, input.name, input.description, input.instructions, input.shape, input.tone, input.provider, input.model,
    JSON.stringify(input.skills), input.schedule, input.engine, input.writeMode, input.isMascot ? 1 : 0,
    projectId, leadId, pinned ? 1 : 0, paused ? 1 : 0, JSON.stringify(tools), JSON.stringify(channels), head, agency, now, now)
  return getAgent(id)!
}

/** Marks an agent as part of a department team. */
export function setAgentTeam(id: string, team: string): void {
  db.prepare('UPDATE agents SET team = ? WHERE id = ?').run(team, id)
}

/** Teams that exist: the template id, its lead's project. */
export function teamsInUse(): { team: string; projectId: string | null }[] {
  return db.prepare("SELECT team, MIN(project_id) AS projectId FROM agents WHERE team != '' GROUP BY team, project_id").all() as { team: string; projectId: string | null }[]
}

/** Records how an agent's latest run ended, for its status ("Last run failed"). */
export function setAgentRunResult(id: string, error: string): void {
  db.prepare('UPDATE agents SET last_run_at = ?, last_error = ? WHERE id = ?').run(Date.now(), error.slice(0, 300), id)
}

/** Last error, last chat activity and scheduled-task count per agent. */
export function agentStats(): Map<string, { lastError: string; lastActive: number | null; tasks: number }> {
  const out = new Map<string, { lastError: string; lastActive: number | null; tasks: number }>()
  for (const r of db.prepare(`SELECT a.id, a.last_error AS lastError,
      (SELECT MAX(updated_at) FROM sessions s WHERE s.agent_id = a.id) AS lastActive,
      (SELECT COUNT(*) FROM tasks t WHERE t.agent_id = a.id) AS tasks FROM agents a`).all() as { id: string; lastError: string; lastActive: number | null; tasks: number }[]) {
    out.set(r.id, { lastError: r.lastError, lastActive: r.lastActive, tasks: r.tasks })
  }
  return out
}

export function removeAgent(id: string): void {
  db.prepare('UPDATE agents SET lead_id = NULL WHERE lead_id = ?').run(id)
  db.prepare('DELETE FROM agents WHERE id = ? AND is_mascot = 0').run(id)
}

export function renameProjectChecked(id: string, name: string): void {
  if (!getProject(id)) throw new Error('That project no longer exists.')
  renameProject(id, name)
}

/**
 * Deletes a project and everything that works in it: its agents and assistants (with their chats and tasks).
 * Files in its folder stay on disk. The Default project can't be deleted.
 */
export function removeProject(id: string, defaultId: string | null): { agents: number } {
  if (id === defaultId) throw new Error("The Default project can't be deleted.")
  if (!getProject(id)) throw new Error('That project no longer exists.')
  const members = (db.prepare('SELECT id FROM agents WHERE project_id = ? AND is_mascot = 0').all(id) as { id: string }[]).map((r) => r.id)
  db.transaction(() => {
    for (const a of members) removeAgent(a)
    db.prepare('DELETE FROM gsync_files WHERE project_id = ?').run(id)
    db.prepare('DELETE FROM gsync_projects WHERE project_id = ?').run(id)
    db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  })()
  return { agents: members.length }
}

export function listProjects(): Project[] {
  return (db.prepare('SELECT id, name, folder, created_at AS createdAt FROM projects ORDER BY created_at DESC').all() as Project[])
}

export function getProject(id: string): Project | null {
  return (db.prepare('SELECT id, name, folder, created_at AS createdAt FROM projects WHERE id = ?').get(id) as Project | undefined) ?? null
}

export function renameProject(id: string, name: string): void {
  const clean = name.trim().slice(0, 80)
  if (!clean) throw new Error('Give the project a name.')
  db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(clean, id)
}

/** Points an agent at another provider and model (used to keep the Studio assistant on the default model). */
export function setAgentModel(id: string, provider: ProviderId, model: string): void {
  db.prepare('UPDATE agents SET provider = ?, model = ?, updated_at = ? WHERE id = ?').run(provider, model, Date.now(), id)
}

export function createProject(name: string, folder: string | null): Project {
  const p: Project = { id: randomUUID(), name, folder, createdAt: Date.now() }
  db.prepare('INSERT INTO projects (id, name, folder, created_at) VALUES (?, ?, ?, ?)').run(p.id, p.name, p.folder, p.createdAt)
  return p
}

const SESSION_COLS = 'id, agent_id AS agentId, project_id AS projectId, title, created_at AS createdAt, updated_at AS updatedAt'

export function listSessions(agentId?: string): Session[] {
  return agentId
    ? (db.prepare(`SELECT ${SESSION_COLS} FROM sessions WHERE agent_id = ? ORDER BY updated_at DESC`).all(agentId) as Session[])
    : (db.prepare(`SELECT ${SESSION_COLS} FROM sessions ORDER BY updated_at DESC LIMIT 50`).all() as Session[])
}

export function getSession(id: string): Session | null {
  return (db.prepare(`SELECT ${SESSION_COLS} FROM sessions WHERE id = ?`).get(id) as Session | undefined) ?? null
}

export function createSession(agentId: string, projectId: string | null): Session {
  // Assistants don't work in folders.
  if (projectId && getAgent(agentId)?.kind === 'assistant') projectId = null
  const now = Date.now()
  const s: Session = { id: randomUUID(), agentId, projectId, title: 'New chat', createdAt: now, updatedAt: now }
  db.prepare('INSERT INTO sessions (id, agent_id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(s.id, s.agentId, s.projectId, s.title, now, now)
  return s
}

/** A message as the runtimes see it: with the attachment text and image copies. */
export interface ModelMessage extends Message {
  attachments: StoredAttachment[]
  context: string
}

type MessageRow = Omit<ModelMessage, 'attachments'> & { attachments: string }

function messageRows(sessionId: string): MessageRow[] {
  return db.prepare('SELECT id, session_id AS sessionId, role, content, attachments, context, created_at AS createdAt FROM messages WHERE session_id = ? ORDER BY created_at')
    .all(sessionId) as MessageRow[]
}

const parseAttachments = (json: string): StoredAttachment[] => {
  try { return JSON.parse(json) } catch { return [] }
}

/** For the UI: attachments without the model-only text. */
export function listMessages(sessionId: string): Message[] {
  return messageRows(sessionId).map(({ context: _context, attachments, ...m }) => {
    const list = parseAttachments(attachments).map(({ copy: _copy, mime: _mime, ...a }) => a)
    return list.length ? { ...m, attachments: list } : m
  })
}

export function listModelMessages(sessionId: string): ModelMessage[] {
  return messageRows(sessionId).map((m) => ({ ...m, attachments: parseAttachments(m.attachments) }))
}

export function addMessage(
  sessionId: string, role: Message['role'], content: string,
  extra: { attachments?: StoredAttachment[]; context?: string } = {}
): Message {
  const m: Message = { id: randomUUID(), sessionId, role, content, createdAt: Date.now() }
  db.prepare('INSERT INTO messages (id, session_id, role, content, attachments, context, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(m.id, m.sessionId, m.role, m.content, JSON.stringify(extra.attachments ?? []), extra.context ?? '', m.createdAt)
  const s = getSession(sessionId)
  const label = content.trim() || (extra.attachments ?? []).map((a) => a.name).join(', ')
  const title = s && s.title === 'New chat' && role === 'user' ? label.slice(0, 60) : s?.title ?? 'Chat'
  db.prepare('UPDATE sessions SET updated_at = ?, title = ? WHERE id = ?').run(m.createdAt, title, sessionId)
  return m
}

type SkillRow = Omit<Skill, 'sourceUrl' | 'packId'> & { sourceUrl: string; packId: string }
const SKILL_COLS = 'id, name, description, body, source_url AS sourceUrl, pack_id AS packId'
const toSkill = ({ sourceUrl, packId, ...s }: SkillRow): Skill => ({ ...s, ...(sourceUrl && { sourceUrl }), ...(packId && { packId }) })

export function listSkills(): Skill[] {
  return (db.prepare(`SELECT ${SKILL_COLS} FROM skills ORDER BY name`).all() as SkillRow[]).map(toSkill)
}

export function getSkill(id: string): Skill | null {
  const r = db.prepare(`SELECT ${SKILL_COLS} FROM skills WHERE id = ?`).get(id) as SkillRow | undefined
  return r ? toSkill(r) : null
}

export function skillNameTaken(name: string, exceptId?: string): boolean {
  return !!db.prepare('SELECT 1 FROM skills WHERE name = ? AND id != ?').get(name, exceptId ?? '')
}

/** Agents reference skills by name, so renames and deletes rewrite each agent's list. */
function renameSkillOnAgents(from: string, to: string | null): void {
  for (const a of listAgents()) {
    if (!a.skills.includes(from)) continue
    const next = to ? a.skills.map((n) => (n === from ? to : n)) : a.skills.filter((n) => n !== from)
    db.prepare('UPDATE agents SET skills = ? WHERE id = ?').run(JSON.stringify([...new Set(next)]), a.id)
  }
}

export function saveSkill(input: SkillInput): Skill {
  const prev = input.id ? getSkill(input.id) : null
  return db.transaction(() => {
    if (prev) {
      db.prepare('UPDATE skills SET name = ?, description = ?, body = ? WHERE id = ?').run(input.name, input.description, input.body, prev.id)
      if (prev.name !== input.name) {
        renameSkillOnAgents(prev.name, input.name)
        // A renamed pack skill becomes the user's own, so pack updates leave it alone.
        db.prepare("UPDATE skills SET pack_id = '' WHERE id = ?").run(prev.id)
      }
      return getSkill(prev.id)!
    }
    const id = randomUUID()
    db.prepare('INSERT INTO skills (id, name, description, body) VALUES (?, ?, ?, ?)').run(id, input.name, input.description, input.body)
    return getSkill(id)!
  })()
}

export function removeSkill(id: string): void {
  const s = getSkill(id)
  if (!s) return
  db.transaction(() => {
    db.prepare('DELETE FROM skills WHERE id = ?').run(id)
    renameSkillOnAgents(s.name, null)
  })()
}

export interface PackRow {
  id: string
  commitSha: string
  installedAt: number
  skillCount: number
  /** owner/name, for packs installed from the GitHub topic. */
  repo: string
  /** JSON card details (name, author, description, license, stars) for those packs. */
  meta: string
}

const PACK_COLS = 'id, commit_sha AS commitSha, installed_at AS installedAt, repo, meta, (SELECT COUNT(*) FROM skills WHERE pack_id = skill_packs.id) AS skillCount'

export function getPackRow(id: string): PackRow | null {
  return (db.prepare(`SELECT ${PACK_COLS} FROM skill_packs WHERE id = ?`).get(id) as PackRow | undefined) ?? null
}

/** Installed packs that came from the GitHub topic rather than skillPacks.ts. */
export function listRepoPackRows(): PackRow[] {
  return db.prepare(`SELECT ${PACK_COLS} FROM skill_packs WHERE repo != '' ORDER BY installed_at`).all() as PackRow[]
}

export interface PackSkill { name: string; description: string; body: string; sourceUrl: string }

/**
 * Installs or updates a pack's skills in one transaction: adds new ones, replaces the text of
 * ones it installed before, deletes ones the pack no longer has (detaching them from agents),
 * and skips names already used by another skill.
 */
export function applyPack(packId: string, commitSha: string, incoming: PackSkill[], source = { repo: '', meta: '' }): { added: number; updated: number; removed: number; skipped: string[] } {
  const res = { added: 0, updated: 0, removed: 0, skipped: [] as string[] }
  db.transaction(() => {
    const mine = new Map((db.prepare('SELECT id, name FROM skills WHERE pack_id = ?').all(packId) as { id: string; name: string }[]).map((r) => [r.name, r.id]))
    const keep = new Set<string>()
    for (const s of incoming) {
      const id = mine.get(s.name)
      if (id) {
        db.prepare('UPDATE skills SET description = ?, body = ?, source_url = ? WHERE id = ?').run(s.description, s.body, s.sourceUrl, id)
        keep.add(s.name)
        res.updated++
      } else if (skillNameTaken(s.name)) {
        res.skipped.push(`${s.name}: you already have a skill with this name`)
      } else {
        db.prepare('INSERT INTO skills (id, name, description, body, source_url, pack_id) VALUES (?, ?, ?, ?, ?, ?)')
          .run(randomUUID(), s.name, s.description, s.body, s.sourceUrl, packId)
        res.added++
      }
    }
    for (const [name, id] of mine) {
      if (keep.has(name)) continue
      db.prepare('DELETE FROM skills WHERE id = ?').run(id)
      renameSkillOnAgents(name, null)
      res.removed++
    }
    db.prepare(`INSERT INTO skill_packs (id, commit_sha, installed_at, repo, meta) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET commit_sha = excluded.commit_sha, installed_at = excluded.installed_at, repo = excluded.repo, meta = excluded.meta`)
      .run(packId, commitSha, Date.now(), source.repo, source.meta)
  })()
  return res
}

/** Deletes every skill from the pack (detaching them from agents) and forgets the install. */
export function removePack(packId: string): void {
  db.transaction(() => {
    for (const r of db.prepare('SELECT name FROM skills WHERE pack_id = ?').all(packId) as { name: string }[]) renameSkillOnAgents(r.name, null)
    db.prepare('DELETE FROM skills WHERE pack_id = ?').run(packId)
    db.prepare('DELETE FROM skill_packs WHERE id = ?').run(packId)
  })()
}

export function getSetting(key: string): string | null {
  const r = (GLOBAL_SETTING(key) ? home : db).prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return r?.value ?? null
}

export function setSetting(key: string, value: string): void {
  ;(GLOBAL_SETTING(key) ? home : db).prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

const CHANGE_COLS = `id, run_id AS runId, session_id AS sessionId, tool_call_id AS toolCallId, file_path AS filePath,
  original, proposed, status, note, created_at AS createdAt`

export function createChange(c: Omit<PendingChange, 'id' | 'status' | 'note' | 'createdAt'>): PendingChange {
  const change: PendingChange = { ...c, id: randomUUID(), status: 'pending', note: '', createdAt: Date.now() }
  db.prepare(`INSERT INTO pending_changes (id, run_id, session_id, tool_call_id, file_path, original, proposed, status, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(change.id, change.runId, change.sessionId, change.toolCallId, change.filePath,
    change.original, change.proposed, change.status, change.note, change.createdAt)
  return change
}

export function getChange(id: string): PendingChange | null {
  return (db.prepare(`SELECT ${CHANGE_COLS} FROM pending_changes WHERE id = ?`).get(id) as PendingChange | undefined) ?? null
}

export function listChanges(sessionId: string): PendingChange[] {
  return db.prepare(`SELECT ${CHANGE_COLS} FROM pending_changes WHERE session_id = ? ORDER BY created_at`).all(sessionId) as PendingChange[]
}

export function setChangeStatus(id: string, status: ChangeStatus, note = ''): void {
  db.prepare('UPDATE pending_changes SET status = ?, note = ? WHERE id = ?').run(status, note, id)
}

/** Runs don't survive a restart, so changes still waiting from a previous launch can no longer be answered. */
export function expireStaleChanges(): void {
  db.prepare("UPDATE pending_changes SET status = 'expired' WHERE status = 'pending'").run()
}

const PROVIDERS: ProviderId[] = ['anthropic', 'openai', 'gemini', 'ollama']

export function getPrefs(): Preferences {
  return {
    defaultWriteMode: getSetting('pref:defaultWriteMode') === 'direct' ? 'direct' : 'ask',
    sharedInstructions: getSetting('pref:sharedInstructions') ?? '',
    theme: (['light', 'dark'] as const).find((t) => t === getSetting('pref:theme')) ?? 'system',
    zoom: clampZoom(Number(getSetting('pref:zoom') ?? 1)),
    iconStyle: getSetting('pref:iconStyle') === 'bold' ? 'bold' : 'outline',
    railLabels: getSetting('pref:railLabels') === '1',
    accent: (['forest', 'mono', 'org'] as const).find((a) => a === getSetting('pref:accent')) ?? 'lime',
    defaultProvider: PROVIDERS.find((x) => x === getSetting('pref:defaultProvider')) ?? null,
    defaultModel: getSetting('pref:defaultModel') ?? ''
  }
}

export function setPrefs(p: Partial<Preferences>): Preferences {
  if (p.defaultWriteMode) setSetting('pref:defaultWriteMode', p.defaultWriteMode)
  if (p.sharedInstructions !== undefined) setSetting('pref:sharedInstructions', p.sharedInstructions.trim())
  if (p.theme && ['system', 'light', 'dark'].includes(p.theme)) setSetting('pref:theme', p.theme)
  if (typeof p.zoom === 'number') setSetting('pref:zoom', String(clampZoom(p.zoom)))
  if (p.iconStyle === 'outline' || p.iconStyle === 'bold') setSetting('pref:iconStyle', p.iconStyle)
  if (typeof p.railLabels === 'boolean') setSetting('pref:railLabels', p.railLabels ? '1' : '0')
  if (p.accent && ['lime', 'forest', 'mono', 'org'].includes(p.accent)) setSetting('pref:accent', p.accent)
  if (p.defaultProvider && PROVIDERS.includes(p.defaultProvider)) {
    const model = (p.defaultModel ?? '').trim().slice(0, 120)
    if (!model) throw new Error('Pick a model.')
    setSetting('pref:defaultProvider', p.defaultProvider)
    setSetting('pref:defaultModel', model)
  }
  return getPrefs()
}

const DAY = 24 * 60 * 60 * 1000
const localDay = (t: number): string => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Counts for the Dashboard. Only the user's own messages count as activity. */
export function dashboardStats(now = Date.now()): DashboardStats {
  const weekAgo = now - 7 * DAY
  const count = (sql: string, ...args: unknown[]): number => (db.prepare(sql).get(...args) as { n: number }).n
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const since = today.getTime() - 13 * DAY
  const daily = Array.from({ length: 14 }, (_, i) => ({ day: localDay(since + i * DAY + DAY / 2), count: 0 }))
  const byDay = new Map(daily.map((d) => [d.day, d]))
  for (const r of db.prepare("SELECT created_at AS t FROM messages WHERE role = 'user' AND created_at >= ?").all(since) as { t: number }[]) {
    const d = byDay.get(localDay(r.t))
    if (d) d.count++
  }
  return {
    chats: count('SELECT COUNT(*) AS n FROM sessions'),
    messages: count("SELECT COUNT(*) AS n FROM messages WHERE role = 'user'"),
    chatsThisWeek: count('SELECT COUNT(*) AS n FROM sessions WHERE created_at >= ?', weekAgo),
    messagesThisWeek: count("SELECT COUNT(*) AS n FROM messages WHERE role = 'user' AND created_at >= ?", weekAgo),
    pendingChanges: count("SELECT COUNT(*) AS n FROM pending_changes WHERE status = 'pending'"),
    daily,
    topAgents: db.prepare(`SELECT s.agent_id AS agentId, COUNT(*) AS messages FROM messages m JOIN sessions s ON s.id = m.session_id
      WHERE m.role = 'user' AND m.created_at >= ? GROUP BY s.agent_id ORDER BY messages DESC LIMIT 5`).all(now - 30 * DAY) as DashboardStats['topAgents'],
    reviews: db.prepare(`SELECT s.id AS sessionId, s.agent_id AS agentId, s.project_id AS projectId, s.title, COUNT(*) AS count
      FROM pending_changes c JOIN sessions s ON s.id = c.session_id WHERE c.status = 'pending'
      GROUP BY s.id ORDER BY MAX(c.created_at) DESC LIMIT 6`).all() as DashboardStats['reviews']
  }
}

type TaskRow = {
  id: string; name: string; prompt: string; agent_id: string; project_id: string | null; schedule: string; enabled: number
  next_run_at: number | null; last_run_at: number | null; last_status: string | null; last_error: string; last_session_id: string | null; created_at: number
}
const toTask = (r: TaskRow): ScheduledTask => ({
  id: r.id, name: r.name, prompt: r.prompt, agentId: r.agent_id, projectId: r.project_id, schedule: JSON.parse(r.schedule),
  enabled: !!r.enabled, nextRunAt: r.next_run_at, lastRunAt: r.last_run_at,
  lastStatus: (['running', 'ok', 'error'] as const).find((x) => x === r.last_status) ?? null,
  lastError: r.last_error, lastSessionId: r.last_session_id, createdAt: r.created_at
})

export function listTasks(): ScheduledTask[] {
  return (db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all() as TaskRow[]).map(toTask)
}

export function getTask(id: string): ScheduledTask | null {
  const r = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined
  return r ? toTask(r) : null
}

/** Saves a task; `nextRunAt` is worked out by the caller from the schedule. */
export function saveTask(input: TaskInput, nextRunAt: number | null): ScheduledTask {
  const name = input.name.trim().slice(0, 80)
  const prompt = input.prompt.trim()
  if (!name) throw new Error('Give the task a name.')
  if (!prompt) throw new Error('Write what the agent should do.')
  const agent = getAgent(input.agentId)
  if (!agent) throw new Error('Pick an agent or assistant.')
  const projectId = agent.kind === 'agent' ? input.projectId : null
  const schedule = JSON.stringify(input.schedule)
  if (input.id && getTask(input.id)) {
    db.prepare('UPDATE tasks SET name=?, prompt=?, agent_id=?, project_id=?, schedule=?, enabled=?, next_run_at=? WHERE id=?')
      .run(name, prompt, agent.id, projectId, schedule, input.enabled ? 1 : 0, nextRunAt, input.id)
    return getTask(input.id)!
  }
  const id = randomUUID()
  db.prepare(`INSERT INTO tasks (id, name, prompt, agent_id, project_id, schedule, enabled, next_run_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, name, prompt, agent.id, projectId, schedule, input.enabled ? 1 : 0, nextRunAt, Date.now())
  return getTask(id)!
}

export function removeTask(id: string): void {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
}

/** Enabled tasks whose next run time has passed. */
export function dueTasks(now: number): ScheduledTask[] {
  return (db.prepare('SELECT * FROM tasks WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?').all(now) as TaskRow[]).map(toTask)
}

export function markTaskRun(id: string, fields: { lastRunAt?: number; lastStatus: ScheduledTask['lastStatus']; lastError?: string; lastSessionId?: string; nextRunAt?: number | null }): void {
  const t = getTask(id)
  if (!t) return
  db.prepare('UPDATE tasks SET last_run_at=?, last_status=?, last_error=?, last_session_id=?, next_run_at=? WHERE id=?').run(
    fields.lastRunAt ?? t.lastRunAt, fields.lastStatus, fields.lastError ?? '', fields.lastSessionId ?? t.lastSessionId,
    fields.nextRunAt === undefined ? t.nextRunAt : fields.nextRunAt, id)
}

export function setSessionTitle(id: string, title: string): void {
  db.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title.slice(0, 80), id)
}

// ---------- Google Drive sync state ----------
export interface SyncedFile { path: string; md5: string; size: number; mtime: number; remoteId: string }

export function gsyncFiles(projectId: string): Map<string, SyncedFile> {
  const rows = db.prepare('SELECT path, md5, size, mtime, remote_id AS remoteId FROM gsync_files WHERE project_id = ?').all(projectId) as SyncedFile[]
  return new Map(rows.map((r) => [r.path, r]))
}

export function gsyncSetFile(projectId: string, f: SyncedFile | { path: string; remove: true }): void {
  if ('remove' in f) db.prepare('DELETE FROM gsync_files WHERE project_id = ? AND path = ?').run(projectId, f.path)
  else db.prepare(`INSERT INTO gsync_files (project_id, path, md5, size, mtime, remote_id) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, path) DO UPDATE SET md5 = excluded.md5, size = excluded.size, mtime = excluded.mtime, remote_id = excluded.remote_id`)
    .run(projectId, f.path, f.md5, f.size, f.mtime, f.remoteId)
}

export interface SyncedProject { projectId: string; folderId: string | null; lastSync: number | null; lastError: string; files: number }

export function gsyncProject(projectId: string): SyncedProject {
  const r = db.prepare('SELECT project_id AS projectId, folder_id AS folderId, last_sync AS lastSync, last_error AS lastError, files FROM gsync_projects WHERE project_id = ?').get(projectId) as SyncedProject | undefined
  return r ?? { projectId, folderId: null, lastSync: null, lastError: '', files: 0 }
}

export function gsyncSetProject(p: SyncedProject): void {
  db.prepare(`INSERT INTO gsync_projects (project_id, folder_id, last_sync, last_error, files) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET folder_id = excluded.folder_id, last_sync = excluded.last_sync, last_error = excluded.last_error, files = excluded.files`)
    .run(p.projectId, p.folderId, p.lastSync, p.lastError, p.files)
}

/** Forgets all sync state (after disconnecting Google Drive), so a new connection starts clean. */
export function gsyncReset(): void {
  db.exec('DELETE FROM gsync_files; DELETE FROM gsync_projects')
}

// ---------- Reset ----------
/** Every project folder in every organization (for the full reset). */
export function allProjectFolders(): string[] {
  const out: string[] = []
  for (const o of home.prepare('SELECT id FROM orgs').all() as { id: string }[]) {
    try {
      const d = o.id === DEFAULT_ORG ? home : new Database(orgFile(o.id), { readonly: true, fileMustExist: true })
      for (const r of d.prepare('SELECT folder FROM projects WHERE folder IS NOT NULL').all() as { folder: string }[]) out.push(r.folder)
      if (d !== home) d.close()
    } catch { /* an unreadable organization: its files are removed with the data folder */ }
  }
  return [...new Set(out)]
}

/** Closes every open database (before the data files are removed). */
export function closeAll(): void {
  if (db && db !== home) db.close()
  home?.close()
}

// ---- Agencies -------------------------------------------------------------------------------------------

type AgencyRow = {
  id: string; name: string; description: string; goal: string; prompt: string; plan: string; template_id: string
  lead_id: string | null; project_id: string; adapter: string; board_path: string; channel: string; notify: string
  budget: number | null; spent: number; auto_run: number; paused: number; created_at: number; updated_at: number
}

const toAgency = (r: AgencyRow): Agency => ({
  id: r.id, name: r.name, description: r.description, goal: r.goal, prompt: r.prompt,
  plan: (() => { try { const p = JSON.parse(r.plan); return Array.isArray(p) ? p.map(String) : [] } catch { return [] } })(),
  templateId: r.template_id, leadId: r.lead_id, projectId: r.project_id, adapter: r.adapter || 'template', boardPath: r.board_path,
  channel: parseJson(r.channel, { kind: 'none' as const }), notify: (['all', 'questions', 'digest'].includes(r.notify) ? r.notify : 'questions') as Agency['notify'],
  budget: r.budget, spent: r.spent ?? 0, autoRun: !!r.auto_run, paused: !!r.paused, createdAt: r.created_at, updatedAt: r.updated_at
})

export function listAgencies(): Agency[] {
  return (db.prepare('SELECT * FROM agencies ORDER BY created_at').all() as AgencyRow[]).map(toAgency)
}

export function getAgency(id: string): Agency | null {
  const r = db.prepare('SELECT * FROM agencies WHERE id = ?').get(id) as AgencyRow | undefined
  return r ? toAgency(r) : null
}

export function agencyForProject(projectId: string): Agency | null {
  const r = db.prepare('SELECT * FROM agencies WHERE project_id = ?').get(projectId) as AgencyRow | undefined
  return r ? toAgency(r) : null
}

export function insertAgency(a: Omit<Agency, 'createdAt' | 'updatedAt' | 'spent'>): Agency {
  const now = Date.now()
  db.prepare(`INSERT INTO agencies (id, name, description, goal, prompt, plan, template_id, lead_id, project_id, adapter, board_path,
    channel, notify, budget, spent, auto_run, paused, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`).run(
    a.id, a.name, a.description, a.goal, a.prompt, JSON.stringify(a.plan), a.templateId, a.leadId, a.projectId, a.adapter, a.boardPath,
    JSON.stringify(a.channel), a.notify, a.budget, a.autoRun ? 1 : 0, a.paused ? 1 : 0, now, now)
  return getAgency(a.id)!
}

export function updateAgency(id: string, input: AgencyUpdateInput): Agency {
  const cur = getAgency(id)
  if (!cur) throw new Error('That agency no longer exists.')
  const next = { ...cur, ...input }
  const name = String(next.name ?? '').trim().slice(0, 80)
  if (!name) throw new Error('Give the agency a name.')
  db.prepare(`UPDATE agencies SET name=?, description=?, goal=?, prompt=?, plan=?, adapter=?, channel=?, notify=?, budget=?, auto_run=?, paused=?, updated_at=? WHERE id=?`)
    .run(name, next.description, next.goal, next.prompt, JSON.stringify(next.plan), next.adapter, JSON.stringify(next.channel), next.notify,
      next.budget === null || next.budget === undefined || Number.isNaN(Number(next.budget)) ? null : Number(next.budget),
      next.autoRun ? 1 : 0, next.paused ? 1 : 0, Date.now(), id)
  if (name !== cur.name) db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, cur.projectId)
  return getAgency(id)!
}

export function setAgencyLead(id: string, leadId: string | null): void {
  db.prepare('UPDATE agencies SET lead_id = ?, updated_at = ? WHERE id = ?').run(leadId, Date.now(), id)
}

export function addAgencySpend(id: string, amount: number): void {
  if (amount > 0) db.prepare('UPDATE agencies SET spent = spent + ? WHERE id = ?').run(amount, id)
}

/** Deletes the agency row, its agents (with their chats and tasks) and its project row; the folder stays. */
export function removeAgency(id: string): void {
  const a = getAgency(id)
  if (!a) return
  const members = (db.prepare('SELECT id FROM agents WHERE agency = ? OR (project_id = ? AND is_mascot = 0)').all(id, a.projectId) as { id: string }[]).map((r) => r.id)
  db.transaction(() => {
    for (const m of members) removeAgent(m)
    db.prepare('DELETE FROM agencies WHERE id = ?').run(id)
    db.prepare('DELETE FROM gsync_files WHERE project_id = ?').run(a.projectId)
    db.prepare('DELETE FROM gsync_projects WHERE project_id = ?').run(a.projectId)
    db.prepare('DELETE FROM projects WHERE id = ?').run(a.projectId)
  })()
}
