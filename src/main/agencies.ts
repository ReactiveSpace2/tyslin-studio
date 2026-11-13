import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { dirname, isAbsolute, join } from 'path'
import type { Agency, AgencyCreateInput, AgencyUpdateInput, AgentInput, EngineId, KanbanDoc, LeadModel } from '@shared/types'
import { AGENCY_ADAPTERS, AGENCY_COLUMNS, AGENCY_TEMPLATES, agentName, memberInstructions, type AgencyMember, type AgencyTemplate } from '@shared/agencies'
import { PROVIDER_NAME } from '@shared/models'
import { canUseOpenRouter, slugFits } from '@shared/openrouter'
import { nextRunAfter } from '@shared/schedule'
import * as db from './db'
import { defaultModel } from './defaultModel'
import { newProjectFolderPath } from './studio'
import { installPack } from './skillPacks'
import { deleteHermesProfile } from './engines'
import { ensureMemory } from './memory'

/**
 * Agencies: a template becomes a project folder, a Lead and its workers, a board file and the Lead's
 * scheduled task, recorded in the agencies table. Everything an agency owns lives in its project folder
 * (agents work there, the board is boards/<name>.board.json) so Drive and Kanban need nothing special.
 */

const uid = (): string => Math.random().toString(36).slice(2, 10)

/** The shared shape for an agent made from a template member. */
function memberAgent(t: AgencyTemplate, m: AgencyMember, agencyPrompt: string, engine: EngineId, projectId: string, leadId: string | null, agencyId: string, agencyName: string): AgentInput {
  const d = defaultModel()
  return {
    kind: 'agent',
    name: agentName(m),
    description: m.lead ? `Lead of ${agencyName}: plans the work, hands out cards and reports to you.` : `${m.job} in ${agencyName}.`,
    instructions: memberInstructions(t, m, agencyPrompt),
    shape: 'round', tone: 'lime', head: m.head,
    // Workers on an adapter use their own key or account; OpenRouter is chosen per worker in the editor, never
    // inherited from a default model that happens to be on OpenRouter.
    ...(engine !== 'builtin' && d.provider === 'openrouter'
      ? { provider: engine === 'codex' ? 'openai' as const : engine === 'gemini-cli' ? 'gemini' as const : 'anthropic' as const, model: '' }
      : { provider: d.provider, model: d.model }),
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

/** The adapter's own provider, for a worker that can't stay on OpenRouter. */
const nativeProvider = (engine: EngineId): 'anthropic' | 'openai' | 'gemini' =>
  engine === 'codex' ? 'openai' : engine === 'gemini-cli' ? 'gemini' : 'anthropic'

/** 'template' or one of the three agency adapters; anything else is refused. */
function checkAdapter(adapter: string): void {
  if (adapter !== 'template' && !AGENCY_ADAPTERS.some((a) => a.id === adapter)) throw new Error('Pick Claude Code, Codex or Gemini CLI for the workers.')
}

/** A Lead's model picked for one agency: a known provider and a model name. */
function checkLeadModel(v: LeadModel): LeadModel {
  const provider = v?.provider
  const model = String(v?.model ?? '').trim()
  if (!provider || !(provider in PROVIDER_NAME)) throw new Error('Pick a provider for the Lead\'s model.')
  if (!model) throw new Error('Pick a model for the Lead.')
  return { provider, model }
}

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
  assertFreeName(name, null)
  const t = input.templateId ? AGENCY_TEMPLATES.find((x) => x.id === input.templateId) ?? null : null
  if (t?.comingSoon) throw new Error(`${t.name} is coming soon. Pick another template or describe the work.`)
  const prompt = String(input.prompt ?? '').trim()
  checkAdapter(input.adapter || 'template')
  const leadModel = input.leadModel ? checkLeadModel(input.leadModel) : null

  // 1. Folder and project: the folder the user picked (made when missing, as long as its parent exists, so
  // several agencies can be pointed at one folder), else a new one under Documents/Tyslin Studio.
  const picked = String(input.folder ?? '').trim()
  let folder: string
  if (picked) {
    if (!isAbsolute(picked)) throw new Error(`The folder must be a full path (got "${picked}").`)
    if (existsSync(picked)) {
      if (!statSync(picked).isDirectory()) throw new Error(`${picked} is a file, not a folder.`)
    } else if (!existsSync(dirname(picked))) {
      throw new Error(`The folder ${picked} doesn't exist, and neither does the folder above it. Create it first or pick another.`)
    }
    folder = picked
  } else {
    folder = newProjectFolderPath(name)
  }
  mkdirSync(folder, { recursive: true })
  for (const sub of t?.folders ?? []) mkdirSync(join(folder, sub), { recursive: true })
  const project = db.createProject(name, folder)
  const agencyId = randomUUID()
  let inserted = false
  try {
    // 2. Lead, then workers reporting to it.
    let leadId: string | null = null
    if (t) {
      const lead = t.roster.find((m) => m.lead)
      if (lead) leadId = db.saveAgent({ ...memberAgent(t, lead, prompt, 'builtin', project.id, null, agencyId, name), ...(leadModel ?? {}) }).id
      for (const m of t.roster.filter((x) => !x.lead)) db.saveAgent(memberAgent(t, m, prompt, engineFor(m, input.adapter), project.id, leadId, agencyId, name))
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
    inserted = true

    // Memory files for the agency and each agent (memory/), filled in later on the Memory screen.
    try { ensureMemory(agency) } catch { /* the Memory screen creates them on first open */ }

    // 5. The Lead's scheduled task.
    if (t && leadId) {
      db.saveTask({
        name: clip(`${name}: ${t.leadTask.prompt.split('.')[0]}`, 80),
        prompt: t.leadTask.prompt, agentId: leadId, projectId: project.id, schedule: t.leadTask.schedule, enabled: true
      }, nextRunAfter(t.leadTask.schedule, Date.now()))
    }

    // 6. Skill packs, in the background.
    for (const id of input.packs ?? []) void installPack(id).catch(() => { /* shown on the Skills page */ })

    return agency
  } catch (err) {
    // A half-made agency (some agents, no row or no board) would linger with no way to remove it: undo the
    // database side. Files already written stay in the new folder.
    try { if (inserted) db.removeAgency(agencyId); else db.removeProject(project.id, null) } catch { /* best effort */ }
    throw err
  }
}

/** Two agencies with one name look identical in the pills and selects (QA, 10 Nov 2026), so names are unique. */
function assertFreeName(name: string, id: string | null): void {
  const key = name.trim().toLowerCase()
  if (db.listAgencies().some((a) => a.id !== id && a.name.trim().toLowerCase() === key)) throw new Error(`An agency named ${name.trim()} already exists. Pick another name.`)
}

/** Cuts a generated name at a word and marks the cut, instead of ending in the middle of one ("…send a di"). */
const clip = (text: string, max: number): string => {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '') + '…'
}

export function updateAgency(id: string, input: AgencyUpdateInput): Agency {
  if (typeof input.name === 'string') assertFreeName(input.name, id)
  const { leadModel, ...rest } = input
  if (typeof rest.adapter === 'string') checkAdapter(rest.adapter)
  const lm = leadModel ? checkLeadModel(leadModel) : null
  const agency = db.updateAgency(id, rest)
  if (typeof rest.adapter === 'string') setWorkersAdapter(agency, rest.adapter)
  if (lm && agency.leadId) {
    const lead = db.getAgent(agency.leadId)
    if (lead) db.saveAgent({ ...lead, provider: lm.provider, model: lm.model })
  }
  return agency
}

/**
 * Edit agency → "Workers run on": every worker moves to the picked adapter, or back to the one its
 * template names ('template'; a worker the template doesn't know keeps its own). The Lead stays on the
 * built-in model. A worker on OpenRouter keeps it only when the new adapter can run that model.
 */
function setWorkersAdapter(agency: Agency, adapter: string): void {
  const t = AGENCY_TEMPLATES.find((x) => x.id === agency.templateId)
  for (const a of db.listAgents()) {
    if (a.agency !== agency.id || a.id === agency.leadId || a.kind !== 'agent') continue
    const engine = adapter === 'template'
      ? (t?.roster.find((m) => !m.lead && agentName(m) === a.name)?.engine as EngineId | undefined) ?? a.engine
      : adapter as EngineId
    if (engine === a.engine) continue
    if (a.engine === 'hermes') deleteHermesProfile(a)
    const keepOr = a.provider === 'openrouter' && canUseOpenRouter(engine) && slugFits(engine, a.model)
    db.saveAgent({ ...a, engine, ...(a.provider === 'openrouter' && !keepOr ? { provider: nativeProvider(engine), model: '' } : {}) })
  }
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
