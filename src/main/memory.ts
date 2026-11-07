import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import * as db from './db'
import type { Agency, Agent, MemoryFile } from '@shared/types'

/**
 * Agency memory: plain Markdown files in the agency's folder, so they show in Drive, sync with Google Drive and
 * survive a reinstall.
 *
 *   <agency folder>/memory/agency.md      shared by every agent in the agency
 *   <agency folder>/memory/<agent>.md     one per agent, found by the id in its first comment (renames keep it)
 *
 * Every run adds the agency file and the agent's own file to its instructions (`memoryPrompt`, capped). Step 1: the
 * user writes the notes on the Memory screen; agents get remember/recall tools in step 2.
 */
export const MEMORY_DIR = 'memory'
/** Characters of memory added to one run's instructions (agency + agent file together). */
const PROMPT_CAP = 8_000
const FILE_CAP = 200_000

const idTag = (id: string): string => `<!-- tyslin-agent: ${id} -->`
const fileSlug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'agent'

function folderOf(agency: Agency): string | null {
  return db.getProject(agency.projectId)?.folder ?? null
}

const agencyTemplate = (agency: Agency): string => `# ${agency.name}: agency memory

<!--
Facts every agent in this agency should always know: the business, its customers, your preferences, decisions made.
One note per line, starting with "- ". Newest at the bottom. Tyslin adds this file to every agent's instructions in
the agency, so keep it short and true. Comments like this one are left out.
-->

`

const agentTemplate = (agent: Agent): string => `${idTag(agent.id)}
# ${agent.name}: memory

<!--
What ${agent.name} should remember: what worked, what to avoid, how you like this kind of work done.
One note per line, starting with "- ". Newest at the bottom. Only ${agent.name} sees this file.
-->

`

const members = (agency: Agency): Agent[] => db.listAgents().filter((a) => a.agency === agency.id && a.kind === 'agent')

/** The agent's memory file name: the one carrying its id, or a new one named after it. */
function agentFileName(dir: string, agent: Agent): string {
  const tag = idTag(agent.id)
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.md') || f === 'agency.md') continue
      try { if (readFileSync(join(dir, f), 'utf8').slice(0, 200).includes(tag)) return f } catch { /* unreadable */ }
    }
  }
  let name = `${fileSlug(agent.name)}.md`
  for (let i = 2; name === 'agency.md' || existsSync(join(dir, name)); i++) name = `${fileSlug(agent.name)}-${i}.md`
  return name
}

/** Creates the memory folder and any missing files. Never overwrites what's there. */
export function ensureMemory(agency: Agency): string | null {
  const folder = folderOf(agency)
  if (!folder || !existsSync(folder)) return null
  const dir = join(folder, MEMORY_DIR)
  mkdirSync(dir, { recursive: true })
  const shared = join(dir, 'agency.md')
  if (!existsSync(shared)) writeFileSync(shared, agencyTemplate(agency), 'utf8')
  for (const a of members(agency)) {
    const file = join(dir, agentFileName(dir, a))
    if (!existsSync(file)) writeFileSync(file, agentTemplate(a), 'utf8')
  }
  return dir
}

function info(dir: string, file: string, key: string, title: string, agent: Agent | null): MemoryFile {
  const path = join(dir, file)
  let size = 0, modifiedAt = 0, notes = 0
  try {
    const st = statSync(path)
    size = st.size
    modifiedAt = st.mtimeMs
    notes = noteLines(readFileSync(path, 'utf8')).length
  } catch { /* missing */ }
  return { key, title, file: `${MEMORY_DIR}/${file}`, agentId: agent?.id ?? null, size, modifiedAt, notes }
}

/** The agency file first, then the Lead, then the other agents. */
export function listMemory(agencyId: string): MemoryFile[] {
  const agency = db.getAgency(agencyId)
  if (!agency) throw new Error('That agency no longer exists.')
  const dir = ensureMemory(agency)
  if (!dir) throw new Error("The agency's folder is missing, so its memory can't be shown.")
  const people = members(agency).sort((a, b) => Number(b.id === agency.leadId) - Number(a.id === agency.leadId))
  return [info(dir, 'agency.md', 'agency', agency.name, null), ...people.map((a) => info(dir, agentFileName(dir, a), a.id, a.name, a))]
}

function resolve(agencyId: string, key: string): { path: string; agency: Agency } {
  const agency = db.getAgency(agencyId)
  if (!agency) throw new Error('That agency no longer exists.')
  const dir = ensureMemory(agency)
  if (!dir) throw new Error("The agency's folder is missing.")
  if (key === 'agency') return { path: join(dir, 'agency.md'), agency }
  const agent = members(agency).find((a) => a.id === key)
  if (!agent) throw new Error('That agent is not in this agency.')
  return { path: join(dir, agentFileName(dir, agent)), agency }
}

export function readMemory(agencyId: string, key: string): string {
  try { return readFileSync(resolve(agencyId, key).path, 'utf8') } catch { return '' }
}

export function writeMemory(agencyId: string, key: string, text: string): MemoryFile {
  if (text.length > FILE_CAP) throw new Error(`Memory files are limited to ${FILE_CAP.toLocaleString()} characters.`)
  const { path } = resolve(agencyId, key)
  // Keep the id tag on an agent's file so a rename still finds it.
  const tag = key === 'agency' ? '' : idTag(key)
  const body = tag && !text.includes(tag) ? `${tag}\n${text}` : text
  writeFileSync(path, body.endsWith('\n') ? body : body + '\n', 'utf8')
  return listMemory(agencyId).find((f) => f.key === key)!
}

/** The text that matters: comments and the id tag removed, blank runs collapsed. */
function clean(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, '').replace(/\n{3,}/g, '\n\n').trim()
}
const noteLines = (text: string): string[] => clean(text).split('\n').filter((l) => /^\s*[-*]\s+\S/.test(l))

/** Keeps the newest part (the end) of a long file, cut at a line. */
function tail(text: string, cap: number, file: string): string {
  if (text.length <= cap) return text
  const cut = text.slice(text.length - cap)
  return `(Older notes left out; the full file is ${file}.)\n` + cut.slice(cut.indexOf('\n') + 1)
}

/** "## Memory" for an agent's instructions, or '' when it isn't in an agency or nothing is written yet. */
export function memoryPrompt(agent: Agent): string {
  const agency = agent.agency ? db.getAgency(agent.agency) : null
  if (!agency) return ''
  const folder = folderOf(agency)
  if (!folder) return ''
  const dir = join(folder, MEMORY_DIR)
  if (!existsSync(dir)) ensureMemory(agency)
  const read = (f: string): string => { try { return readFileSync(join(dir, f), 'utf8') } catch { return '' } }
  // Drop the heading line each file starts with; the section titles below say whose notes they are.
  const body = (f: string): string => clean(read(f)).replace(/^#[^\n]*\n?/, '').trim()
  const shared = body('agency.md')
  const ownFile = agentFileName(dir, agent)
  const own = existsSync(join(dir, ownFile)) ? body(ownFile) : ''
  if (!shared && !own) return ''
  // The agent's own notes get at least half the room.
  const ownCap = own ? Math.max(PROMPT_CAP / 2, PROMPT_CAP - shared.length) : 0
  const sharedCap = PROMPT_CAP - Math.min(own.length, ownCap)
  const parts = ['## Memory\nNotes kept for you in this agency. Treat them as true unless the user says otherwise.']
  if (shared) parts.push(`### Agency notes (${MEMORY_DIR}/agency.md)\n` + tail(shared, sharedCap, `${MEMORY_DIR}/agency.md`))
  if (own) parts.push(`### Your notes (${MEMORY_DIR}/${ownFile})\n` + tail(own, ownCap, `${MEMORY_DIR}/${ownFile}`))
  return parts.join('\n\n')
}
