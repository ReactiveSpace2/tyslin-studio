import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Agency, AgencyCreateInput, AgencyUpdateInput, AgentInput, EngineId, KanbanDoc } from '@shared/types'
import { AGENCY_COLUMNS, AGENCY_TEMPLATES, agentName, memberInstructions, type AgencyMember, type AgencyTemplate } from '@shared/agencies'
import { nextRunAfter } from '@shared/schedule'
import * as db from './db'
import { defaultModel } from './defaultModel'
import { newProjectFolderPath } from './studio'
import { installPack } from './skillPacks'
import { deleteHermesProfile } from './engines'

/**
 * Agencies: a template becomes a project folder, a Lead and its workers, a board file and the Lead's
 * scheduled task, recorded in the agencies table. Everything an agency owns lives in its project folder
 * (agents work there, the board is boards/<name>.board.json) so Drive and Kanban need nothing special.
 */

const uid = (): string => Math.random().toString(36).slice(2, 10)

/** The shared shape for an agent made from a template member. */
function memberAgent(t: AgencyTemplate, m: AgencyMember, agencyPrompt: string, engine: EngineId, projectId: string, leadId: string | null, agencyId: string): AgentInput {
  const d = defaultModel()
  return {
    kind: 'agent',
    name: agentName(m),
    description: m.lead ? `Lead of ${t.name}: plans the work, hands out cards and reports to you.` : `${m.job} in ${t.name}.`,
    instructions: memberInstructions(t, m, agencyPrompt),
    shape: 'round', tone: 'lime', head: m.head,
    provider: d.provider, model: d.model,
    skills: t.skills,
    schedule: 'manual',
    engine,
    writeMode: 'ask',
    isMascot: false,
    projectId, leadId,
    tools: { read: true, write: true },
    channels: { telegram: false },
    agency: agencyId
  }
}

/** A worker's engine: the template's own, or the agency-wide override. */
const engineFor = (m: AgencyMember, adapter: string): EngineId =>
  m.lead ? 'builtin' : adapter && adapter !== 'template' ? (adapter as EngineId) : (m.engine as EngineId)

function boardDoc(t: AgencyTemplate | null, agencyId: string): KanbanDoc {
  const now = Date.now()
  const cards = (t?.starterCards ?? []).map((title) => ({ id: uid(), title, notes: '', labels: [], agency: agencyId, createdAt: now, log: [{ at: now, text: 'Added from the template' }] }))
  return {
    version: 1,
    columns: AGENCY_COLUMNS.map((title, i) => ({ id: uid(), title, cards: i === 0 ? cards : [] })),
    labels: []
  }
}

const safeFile = (name: string): string => name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Board'

/**
 * Creates the agency in order: project folder (with the template's folders), the Lead, the workers,
 * the board with the starter cards, the agencies row, then the Lead's task. Skill packs install
 * afterwards in the background; a failed install never fails the agency.
 */
export function createAgency(input: AgencyCreateInput): Agency {
  const name = String(input.name ?? '').trim().slice(0, 80)
  if (!name) throw new Error('Give the agency a name.')
  const t = input.templateId ? AGENCY_TEMPLATES.find((x) => x.id === input.templateId) ?? null : null
  const prompt = String(input.prompt ?? '').trim()

  // 1. Folder and project.
  const folder = newProjectFolderPath(name)
  mkdirSync(folder, { recursive: true })
  for (const sub of t?.folders ?? []) mkdirSync(join(folder, sub), { recursive: true })
  const project = db.createProject(name, folder)
  const agencyId = randomUUID()

  // 2. Lead, then workers reporting to it.
  let leadId: string | null = null
  if (t) {
    const lead = t.roster.find((m) => m.lead)
    if (lead) leadId = db.saveAgent(memberAgent(t, lead, prompt, 'builtin', project.id, null, agencyId)).id
    for (const m of t.roster.filter((x) => !x.lead)) db.saveAgent(memberAgent(t, m, prompt, engineFor(m, input.adapter), project.id, leadId, agencyId))
  }

  // 3. The board, with the starter cards in Inbox.
  const boardPath = join('boards', `${safeFile(name)}.board.json`).split('\\').join('/')
  mkdirSync(join(folder, 'boards'), { recursive: true })
  writeFileSync(join(folder, boardPath), JSON.stringify(boardDoc(t, agencyId), null, 2), 'utf8')

  // 4. The agency row.
  const agency = db.insertAgency({
    id: agencyId, name, description: String(input.description ?? '').trim() || t?.tagline || '', goal: String(input.goal ?? '').trim() || t?.goal || '',
    prompt, plan: t?.plan ?? [], templateId: t?.id ?? '', leadId, projectId: project.id, adapter: input.adapter || 'template', boardPath,
    channel: { kind: input.channel ?? 'none' }, notify: input.notify ?? 'questions', budget: input.budget ?? null, autoRun: !!input.autoRun, paused: false
  })

  // 5. The Lead's scheduled task.
  if (t && leadId) {
    db.saveTask({
      name: `${name}: ${t.leadTask.prompt.split('.')[0]}`.slice(0, 80),
      prompt: t.leadTask.prompt, agentId: leadId, projectId: project.id, schedule: t.leadTask.schedule, enabled: true
    }, nextRunAfter(t.leadTask.schedule, Date.now()))
  }

  // 6. Skill packs, in the background.
  for (const id of input.packs ?? []) void installPack(id).catch(() => { /* shown on the Skills page */ })

  return agency
}

export function updateAgency(id: string, input: AgencyUpdateInput): Agency {
  return db.updateAgency(id, input)
}

/** Removes the agency, its agents, task and board file. The folder and the files in it stay. */
export function removeAgency(id: string): void {
  const a = db.getAgency(id)
  if (!a) return
  // Hermes agents own a profile each; it goes with them.
  for (const agent of db.listAgents()) if (agent.agency === id && agent.engine === 'hermes') deleteHermesProfile(agent)
  const project = db.getProject(a.projectId)
  if (project?.folder && a.boardPath) {
    const board = join(project.folder, a.boardPath)
    if (existsSync(board)) rmSync(board, { force: true })
  }
  db.removeAgency(id)
}
