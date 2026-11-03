import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { Agent, AgentInput, ChangeStatus, Message, PendingChange, Project, Session, Skill } from '@shared/types'

let db: Database.Database

export function openDb(): Database.Database {
  const file = join(app.getPath('userData'), 'tyslin.db')
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate()
  seed()
  return db
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
}

/** CREATE TABLE IF NOT EXISTS never alters an existing table, so new columns go through here. */
function addColumn(table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

function seed(): void {
  const count = (db.prepare('SELECT COUNT(*) AS n FROM agents').get() as { n: number }).n
  if (count > 0) return
  const defaults: AgentInput[] = [
    { name: 'Builder', description: 'Designs new agents with you, then keeps improving them.', instructions: 'You are Builder, the Tyslin agent that helps users design other agents. Ask what job the agent should do, then propose a name, short description, step-by-step instructions, and which skills and tools it needs.', shape: 'round', tone: 'paper', provider: 'anthropic', model: 'claude-sonnet-5-5', skills: ['agent-design'], schedule: 'manual', writeMode: 'ask', isMascot: true },
    { name: 'Researcher', description: 'Searches your files and sources and returns sourced briefs.', instructions: 'You are a careful researcher. Give concise briefs with clear sections and always say where each fact comes from. Flag anything you are unsure about.', shape: 'round', tone: 'ink', provider: 'anthropic', model: 'claude-sonnet-5-5', skills: ['cite-sources'], schedule: 'manual', writeMode: 'ask', isMascot: false },
    { name: 'Writer', description: 'Drafts posts, emails and docs that sound like you.', instructions: 'You write clear, warm, direct prose. Match the user\'s voice and keep drafts short unless asked otherwise.', shape: 'hex', tone: 'lime', provider: 'anthropic', model: 'claude-sonnet-5-5', skills: [], schedule: 'manual', writeMode: 'ask', isMascot: false },
    { name: 'Critic', description: 'Reviews any draft and tells you exactly what to fix.', instructions: 'You are a constructive but honest reviewer. List the most important problems first, explain why each matters, and suggest a concrete fix.', shape: 'pill', tone: 'paper', provider: 'anthropic', model: 'claude-sonnet-5-5', skills: [], schedule: 'manual', writeMode: 'ask', isMascot: false },
    { name: 'Analyst', description: 'Turns numbers into plain answers.', instructions: 'You analyse data the user pastes or describes. Show your working briefly and give the answer in plain language first.', shape: 'block', tone: 'lime', provider: 'anthropic', model: 'claude-sonnet-5-5', skills: [], schedule: 'manual', writeMode: 'ask', isMascot: false }
  ]
  const tx = db.transaction(() => {
    for (const a of defaults) saveAgent(a)
    const skills: Omit<Skill, 'id'>[] = [
      { name: 'agent-design', description: 'Structure for designing a new agent.', body: 'When designing an agent, produce: name, one-line description, instructions, skills, tools, schedule.' },
      { name: 'cite-sources', description: 'Always attribute facts to their source.', body: 'For every factual claim, name the source. If there is no source, say so.' },
      { name: 'plain-language', description: 'Write for a busy non-expert reader.', body: 'Short sentences. No jargon without a definition. Lead with the answer.' }
    ]
    const ins = db.prepare('INSERT INTO skills (id, name, description, body) VALUES (?, ?, ?, ?)')
    for (const s of skills) ins.run(randomUUID(), s.name, s.description, s.body)
  })
  tx()
}

type AgentRow = {
  id: string; name: string; description: string; instructions: string; shape: string; tone: string
  provider: string; model: string; skills: string; schedule: string; write_mode: string; is_mascot: number
  created_at: number; updated_at: number
}

const toAgent = (r: AgentRow): Agent => ({
  id: r.id, name: r.name, description: r.description, instructions: r.instructions,
  shape: r.shape as Agent['shape'], tone: r.tone as Agent['tone'], provider: r.provider as Agent['provider'],
  model: r.model, skills: JSON.parse(r.skills), schedule: r.schedule,
  writeMode: r.write_mode === 'direct' ? 'direct' : 'ask', isMascot: !!r.is_mascot,
  createdAt: r.created_at, updatedAt: r.updated_at
})

export function listAgents(): Agent[] {
  return (db.prepare('SELECT * FROM agents ORDER BY is_mascot DESC, created_at').all() as AgentRow[]).map(toAgent)
}

export function getAgent(id: string): Agent | null {
  const r = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as AgentRow | undefined
  return r ? toAgent(r) : null
}

export function saveAgent(input: AgentInput & { id?: string }): Agent {
  const now = Date.now()
  if (input.id && getAgent(input.id)) {
    db.prepare(`UPDATE agents SET name=?, description=?, instructions=?, shape=?, tone=?, provider=?, model=?,
      skills=?, schedule=?, write_mode=?, is_mascot=?, updated_at=? WHERE id=?`).run(
      input.name, input.description, input.instructions, input.shape, input.tone, input.provider, input.model,
      JSON.stringify(input.skills), input.schedule, input.writeMode, input.isMascot ? 1 : 0, now, input.id)
    return getAgent(input.id)!
  }
  const id = randomUUID()
  db.prepare(`INSERT INTO agents (id, name, description, instructions, shape, tone, provider, model, skills,
    schedule, write_mode, is_mascot, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, input.name, input.description, input.instructions, input.shape, input.tone, input.provider, input.model,
    JSON.stringify(input.skills), input.schedule, input.writeMode, input.isMascot ? 1 : 0, now, now)
  return getAgent(id)!
}

export function removeAgent(id: string): void {
  db.prepare('DELETE FROM agents WHERE id = ? AND is_mascot = 0').run(id)
}

export function listProjects(): Project[] {
  return (db.prepare('SELECT id, name, folder, created_at AS createdAt FROM projects ORDER BY created_at DESC').all() as Project[])
}

export function getProject(id: string): Project | null {
  return (db.prepare('SELECT id, name, folder, created_at AS createdAt FROM projects WHERE id = ?').get(id) as Project | undefined) ?? null
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
  const now = Date.now()
  const s: Session = { id: randomUUID(), agentId, projectId, title: 'New chat', createdAt: now, updatedAt: now }
  db.prepare('INSERT INTO sessions (id, agent_id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(s.id, s.agentId, s.projectId, s.title, now, now)
  return s
}

export function listMessages(sessionId: string): Message[] {
  return db.prepare('SELECT id, session_id AS sessionId, role, content, created_at AS createdAt FROM messages WHERE session_id = ? ORDER BY created_at')
    .all(sessionId) as Message[]
}

export function addMessage(sessionId: string, role: Message['role'], content: string): Message {
  const m: Message = { id: randomUUID(), sessionId, role, content, createdAt: Date.now() }
  db.prepare('INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(m.id, m.sessionId, m.role, m.content, m.createdAt)
  const s = getSession(sessionId)
  const title = s && s.title === 'New chat' && role === 'user' ? content.slice(0, 60) : s?.title ?? 'Chat'
  db.prepare('UPDATE sessions SET updated_at = ?, title = ? WHERE id = ?').run(m.createdAt, title, sessionId)
  return m
}

export function listSkills(): Skill[] {
  return db.prepare('SELECT id, name, description, body FROM skills ORDER BY name').all() as Skill[]
}

export function getSetting(key: string): string | null {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return r?.value ?? null
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
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
