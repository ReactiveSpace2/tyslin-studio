import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { BUILT_IN_SKILLS, SKILL_LIBRARY_VERSION } from './seedSkills'
import { AGENT_LIBRARY_VERSION, ASSISTANT_LIBRARY_VERSION, BUILT_IN_AGENTS, BUILT_IN_ASSISTANTS, RETIRED_AGENTS } from './seedAgents'
import type { StoredAttachment } from './attachments'
import type { Agent, AgentInput, ChangeStatus, Message, PendingChange, Preferences, Project, Session, Skill, SkillInput } from '@shared/types'

let db: Database.Database

export function openDb(): Database.Database {
  const file = join(app.getPath('userData'), 'tyslin.db')
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate()
  seed()
  seedAssistants()
  seedSkills()
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
  addColumn('agents', 'engine', "TEXT NOT NULL DEFAULT 'builtin'")
  addColumn('agents', 'kind', "TEXT NOT NULL DEFAULT 'agent'")
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
}

/** CREATE TABLE IF NOT EXISTS never alters an existing table, so new columns go through here. */
function addColumn(table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

/**
 * Adds built-in agents (seedAgents.ts) new since this install last seeded, matched by name, so an
 * agent the user renamed or deleted isn't recreated until the library version is bumped again.
 * Version 1 also retires the old sample agents, but only ones without chats.
 */
function seed(): void {
  const version = Number(getSetting('seed:agentsVersion') ?? 0)
  if (version >= AGENT_LIBRARY_VERSION) return
  db.transaction(() => {
    if (version < 1) {
      const retire = db.prepare(`DELETE FROM agents WHERE name = ? AND is_mascot = 0
        AND NOT EXISTS (SELECT 1 FROM sessions WHERE sessions.agent_id = agents.id)`)
      for (const name of RETIRED_AGENTS) retire.run(name)
    }
    const names = new Set((db.prepare('SELECT name FROM agents').all() as { name: string }[]).map((r) => r.name))
    const hasMascot = !!db.prepare('SELECT 1 FROM agents WHERE is_mascot = 1').get()
    for (const a of BUILT_IN_AGENTS) {
      if (names.has(a.name) || (a.isMascot && hasMascot)) continue
      saveAgent(a)
    }
    setSetting('seed:agentsVersion', String(AGENT_LIBRARY_VERSION))
  })()
}

/** Same as seed(), for the starter assistants, with its own version so either list can grow alone. */
function seedAssistants(): void {
  if (Number(getSetting('seed:assistantsVersion') ?? 0) >= ASSISTANT_LIBRARY_VERSION) return
  db.transaction(() => {
    const names = new Set((db.prepare('SELECT name FROM agents').all() as { name: string }[]).map((r) => r.name))
    for (const a of BUILT_IN_ASSISTANTS) if (!names.has(a.name)) saveAgent(a)
    setSetting('seed:assistantsVersion', String(ASSISTANT_LIBRARY_VERSION))
  })()
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
  created_at: number; updated_at: number
}

const toAgent = (r: AgentRow): Agent => ({
  id: r.id, kind: r.kind === 'assistant' ? 'assistant' : 'agent', name: r.name, description: r.description, instructions: r.instructions,
  shape: r.shape as Agent['shape'], tone: r.tone as Agent['tone'], provider: r.provider as Agent['provider'],
  model: r.model, skills: JSON.parse(r.skills), schedule: r.schedule,
  engine: (r.engine || 'builtin') as Agent['engine'],
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

export function saveAgent(raw: AgentInput & { id?: string }): Agent {
  const now = Date.now()
  const existing = raw.id ? getAgent(raw.id) : null
  // The kind is fixed once created. Assistants always run on Tyslin's own models, never on a schedule.
  const kind = existing?.kind ?? (raw.kind === 'assistant' ? 'assistant' : 'agent')
  const input = kind === 'assistant'
    ? { ...raw, engine: 'builtin' as const, schedule: 'manual', writeMode: 'ask' as const, isMascot: false }
    : raw
  if (existing) {
    db.prepare(`UPDATE agents SET name=?, description=?, instructions=?, shape=?, tone=?, provider=?, model=?,
      skills=?, schedule=?, engine=?, write_mode=?, is_mascot=?, updated_at=? WHERE id=?`).run(
      input.name, input.description, input.instructions, input.shape, input.tone, input.provider, input.model,
      JSON.stringify(input.skills), input.schedule, input.engine, input.writeMode, input.isMascot ? 1 : 0, now, existing.id)
    return getAgent(existing.id)!
  }
  const id = randomUUID()
  db.prepare(`INSERT INTO agents (id, kind, name, description, instructions, shape, tone, provider, model, skills,
    schedule, engine, write_mode, is_mascot, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, kind, input.name, input.description, input.instructions, input.shape, input.tone, input.provider, input.model,
    JSON.stringify(input.skills), input.schedule, input.engine, input.writeMode, input.isMascot ? 1 : 0, now, now)
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

export function getPrefs(): Preferences {
  return {
    defaultWriteMode: getSetting('pref:defaultWriteMode') === 'direct' ? 'direct' : 'ask',
    sharedInstructions: getSetting('pref:sharedInstructions') ?? ''
  }
}

export function setPrefs(p: Partial<Preferences>): Preferences {
  if (p.defaultWriteMode) setSetting('pref:defaultWriteMode', p.defaultWriteMode)
  if (p.sharedInstructions !== undefined) setSetting('pref:sharedInstructions', p.sharedInstructions.trim())
  return getPrefs()
}
