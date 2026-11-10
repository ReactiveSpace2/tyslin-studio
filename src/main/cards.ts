import { randomUUID } from 'crypto'
import type { Agency, Agent, KanbanCard, PendingChange, RunEvent, ScheduledTask } from '@shared/types'
import { AGENCY_TEMPLATES, BRIEF_LOG } from '@shared/agencies'
import { estimateCost, type Usage } from '@shared/pricing'
import * as db from './db'
import { boardHooks, findCard, log, moveCard, patchCard, readBoard, writeBoard } from './boardTools'

/**
 * Cards are the unit of work. Running one starts a chat with its assignee (or the Lead) through the same
 * startRun path as every other message; when the run ends, the reply, chat id and estimated cost land on
 * the card and it moves to Review. Accepting the run's file changes moves it to Done. With auto-run on,
 * the Lead's planned cards start one after another until the budget is reached.
 */

interface Deps {
  startRun: (sessionId: string, text: string) => { runId: string; done: Promise<{ ok: boolean; error?: string }> }
  runTask: (t: ScheduledTask, scheduled: boolean) => string
  /** Throws why this agent can't run now (paused, no model key), before any chat is created. */
  checkReady: (agent: Agent) => void
}
let deps: Deps | null = null
export function initCards(d: Deps): void {
  deps = d
  boardHooks.runCard = async (agency, cardId) => {
    const sessionId = await runCard(agency.id, cardId)
    return `Started; the result will land on the card (chat ${sessionId}).`
  }
}

interface LiveRun { agencyId: string; cardId: string; usage: Usage }
/** Runs started from cards, by run id. Finished ones stay until the next launch so reviews can find their card. */
const runs = new Map<string, LiveRun>()
const active = new Set<string>()
/** Agencies whose plan the boss approved (cards:runPlan): their Planned cards run one after another like auto-run, until none is left. */
const approved = new Set<string>()
const runsOnItsOwn = (agency: Agency): boolean => agency.autoRun || approved.has(agency.id)

export const runningCards = (): string[] => [...active]

/** "Approve and run the plan": starts the Planned cards one at a time, whatever the auto-run setting. Returns how many are planned. */
export async function runPlan(agencyId: string): Promise<number> {
  const agency = db.getAgency(agencyId)
  if (!agency) throw new Error('That agency no longer exists.')
  if (!agency.leadId) throw new Error('This agency has no Lead yet.')
  if (agency.paused) throw new Error(`${agency.name} is paused. Resume it on its page first.`)
  const doc = readBoard(agency)
  if (!doc) throw new Error('The board file is missing.')
  const planned = doc.columns.find((c) => c.title.toLowerCase() === 'planned')?.cards.filter((k) => (k.assignee || k.agentId) && !k.status) ?? []
  if (!planned.length) throw new Error('Nothing is planned. Ask the Lead to plan first.')
  approved.add(agency.id)
  await runNext(agency)
  return planned.length
}

export type CardPatch = Partial<Pick<KanbanCard, 'title' | 'notes' | 'assignee'>>

/** Edits a planned card (title, notes, who does it) and saves the board. */
export function updateCard(agencyId: string, cardId: string, patch: CardPatch): void {
  const agency = db.getAgency(agencyId)
  if (!agency) throw new Error('That agency no longer exists.')
  if (active.has(cardId)) throw new Error('That card is running; wait for it to finish.')
  const ok = patchCard(agency, cardId, (card) => {
    if (typeof patch.title === 'string' && patch.title.trim()) card.title = patch.title.trim().slice(0, 120)
    if (typeof patch.notes === 'string') card.notes = patch.notes
    if (typeof patch.assignee === 'string' && patch.assignee !== card.assignee) {
      const who = db.getAgent(patch.assignee)
      if (!who || who.agency !== agency.id) throw new Error('Pick someone on this agency\'s roster.')
      card.assignee = who.id
      card.agentId = who.id
      log(card, `Reassigned to ${who.name}`)
    }
  })
  if (!ok) throw new Error('That card is gone.')
}

/** Removes a card from the board (not a running one). */
export function removeCard(agencyId: string, cardId: string): void {
  const agency = db.getAgency(agencyId)
  if (!agency) throw new Error('That agency no longer exists.')
  if (active.has(cardId)) throw new Error('That card is running; stop it first.')
  const doc = readBoard(agency)
  if (!doc) throw new Error('The board file is missing.')
  if (!findCard(doc, cardId)) throw new Error('That card is gone.')
  for (const col of doc.columns) col.cards = col.cards.filter((c) => c.id !== cardId)
  writeBoard(agency, doc)
}

const cardPrompt = (agency: Agency, title: string, notes: string, column: string, parent?: string): string => [
  `Work on this card from the "${agency.name}" board (column: ${column}).`,
  '',
  `## ${title}`,
  notes.trim() ? `\n${notes.trim()}` : '',
  parent ? `\n(Split from card ${parent}.)` : '',
  '',
  agency.goal ? `The agency's goal: ${agency.goal}` : '',
  'Reply with the finished work for this card: what you did, where it is, what you could not do and why. If the card is unclear or you need something you do not have, write the question and stop.'
].filter((l) => l !== '').join('\n')

/** Starts the card's assignee (or the Lead) on it. Returns the chat id. */
export async function runCard(agencyId: string, cardId: string): Promise<string> {
  if (!deps) throw new Error('Card runs are not ready yet.')
  const agency = db.getAgency(agencyId)
  if (!agency) throw new Error('That agency no longer exists.')
  if (agency.paused) throw new Error(`${agency.name} is paused. Resume it on its page first.`)
  if (agency.budget !== null && agency.spent >= agency.budget) throw new Error(`${agency.name} has reached its budget (${agency.spent.toFixed(2)} of ${agency.budget}). Raise it on the Edit page to keep going.`)
  const doc = readBoard(agency)
  if (!doc) throw new Error('The board file is missing.')
  const hit = findCard(doc, cardId)
  if (!hit) throw new Error('That card is gone.')
  if (active.has(cardId)) throw new Error('That card is already running.')
  const agentId = hit.card.assignee || hit.card.agentId || agency.leadId
  const agent = agentId ? db.getAgent(agentId) : null
  if (!agent) throw new Error('Give the card to someone on the roster first.')
  deps.checkReady(agent)

  const session = db.createSession(agent.id, agency.projectId)
  const { runId, done } = deps.startRun(session.id, cardPrompt(agency, hit.card.title, hit.card.notes, hit.column.title, hit.card.parentCard))
  db.setSessionTitle(session.id, `Card: ${hit.card.title}`.slice(0, 80))
  runs.set(runId, { agencyId, cardId, usage: { inputTokens: 0, outputTokens: 0 } })
  active.add(cardId)

  hit.card.runId = runId
  hit.card.sessionId = session.id
  hit.card.agentId = agent.id
  hit.card.assignee = hit.card.assignee || agent.id
  hit.card.status = 'running'
  log(hit.card, `Started with ${agent.name}`)
  const inProgress = doc.columns.find((c) => c.title.toLowerCase() === 'in progress')
  if (inProgress && hit.column !== inProgress && !/review|done/i.test(hit.column.title)) moveCard(doc, cardId, inProgress.title)
  writeBoard(agency, doc)

  void done.then((r) => finish(runId, agent, r))
  return session.id
}

function finish(runId: string, agent: Agent, r: { ok: boolean; error?: string }): void {
  const run = runs.get(runId)
  if (!run) return
  active.delete(run.cardId)
  const agency = db.getAgency(run.agencyId)
  if (!agency) return
  const cost = agent.engine === 'builtin' ? estimateCost(agent.provider, agent.model, run.usage) : null
  if (cost) db.addAgencySpend(agency.id, cost)
  const doc = readBoard(agency)
  if (!doc) return
  const hit = findCard(doc, run.cardId)
  if (!hit) return
  const sessionId = hit.card.sessionId
  const text = sessionId ? db.listMessages(sessionId).filter((m) => m.role === 'assistant').pop()?.content.trim() ?? '' : ''
  if (r.ok) {
    hit.card.result = text
    hit.card.status = 'done'
    if (cost !== null) hit.card.cost = (hit.card.cost ?? 0) + cost
    log(hit.card, `${agent.name} finished${cost !== null ? ` · ${cost.toFixed(4)} est.` : ''}`)
    const pending = sessionId ? db.listChanges(sessionId).some((c) => c.runId === runId && c.status === 'pending') : false
    if (!/done/i.test(hit.column.title)) moveCard(doc, run.cardId, 'Review')
    if (pending) log(hit.card, 'File changes are waiting for review')
  } else {
    hit.card.status = 'failed'
    log(hit.card, `${agent.name} failed: ${(r.error ?? 'unknown error').slice(0, 200)}`)
  }
  writeBoard(agency, doc)
  if (runsOnItsOwn(agency) && r.ok) void runNext(db.getAgency(agency.id)!)
}

/** Auto-run (or an approved plan): the next planned card with an assignee that has never run, one at a time. */
export async function runNext(agency: Agency): Promise<void> {
  if (!runsOnItsOwn(agency) || agency.paused) return
  if (agency.budget !== null && agency.spent >= agency.budget) return
  const doc = readBoard(agency)
  if (!doc) return
  const busy = doc.columns.some((c) => c.cards.some((k) => active.has(k.id)))
  if (busy) return
  const planned = doc.columns.find((c) => c.title.toLowerCase() === 'planned')
  const next = planned?.cards.find((k) => (k.assignee || k.agentId) && !k.status)
  if (!next) { approved.delete(agency.id); return }
  try { await runCard(agency.id, next.id) } catch (err) {
    // Mark it so auto-run moves on to the next card instead of retrying this one forever.
    const msg = err instanceof Error ? err.message : String(err)
    patchCard(agency, next.id, (card) => { card.status = 'failed'; log(card, `Could not start: ${msg.slice(0, 200)}`) })
  }
}

/** Run events: token counts for card runs, and the Lead finishing (which starts auto-run). */
export function cardsOnRunEvent(e: RunEvent): void {
  const run = runs.get(e.runId)
  if (run && e.type === 'usage') { run.usage.inputTokens += e.inputTokens; run.usage.outputTokens += e.outputTokens }
  if (e.type === 'run_finished' && !run) {
    const session = db.getSession(e.sessionId)
    const agent = session ? db.getAgent(session.agentId) : null
    const agency = agent?.agency ? db.getAgency(agent.agency) : null
    if (agency && agency.leadId === agent!.id && runsOnItsOwn(agency)) void runNext(agency)
  }
}

/** A reviewed change: when none of the run's changes are pending any more, its card moves to Done. */
export function onChangeResolved(change: PendingChange): void {
  const run = runs.get(change.runId)
  const agencies = run ? [db.getAgency(run.agencyId)] : db.listAgencies()
  for (const agency of agencies) {
    if (!agency) continue
    const doc = readBoard(agency)
    const hit = doc ? doc.columns.flatMap((c) => c.cards).find((k) => k.runId === change.runId) : null
    if (!doc || !hit) continue
    const stillPending = db.listChanges(change.sessionId).some((c) => c.runId === change.runId && c.status === 'pending')
    if (stillPending) return
    const accepted = db.listChanges(change.sessionId).filter((c) => c.runId === change.runId).some((c) => c.status === 'accepted' || c.status === 'partial')
    patchCard(agency, hit.id, (card, d) => {
      log(card, accepted ? 'Changes reviewed and accepted' : 'Changes reviewed; none accepted')
      if (accepted) moveCard(d, card.id, 'Done')
    })
    return
  }
}

/** Runs the Lead's "plan the Inbox" prompt now. Returns the chat id. */
export function planNow(agencyId: string): string {
  if (!deps) throw new Error('Not ready yet.')
  const agency = db.getAgency(agencyId)
  if (!agency) throw new Error('That agency no longer exists.')
  if (!agency.leadId) throw new Error('This agency has no Lead yet.')
  if (agency.paused) throw new Error(`${agency.name} is paused.`)
  const task = db.listTasks().find((t) => t.agentId === agency.leadId)
  if (task) return deps.runTask(task, false)
  const prompt = AGENCY_TEMPLATES.find((t) => t.id === agency.templateId)?.leadTask.prompt
    ?? 'Read the Inbox and Review columns. Plan new briefs into cards with assignees in Planned, review finished cards, and send the boss a digest.'
  const lead = db.getAgent(agency.leadId)
  if (!lead) throw new Error('This agency has no Lead yet.')
  deps.checkReady(lead)
  const session = db.createSession(agency.leadId, agency.projectId)
  deps.startRun(session.id, prompt)
  db.setSessionTitle(session.id, `${agency.name}: plan the Inbox`)
  return session.id
}

/**
 * A brief from the boss, typed in the agency's Inbox: a card in the board's Inbox column (logged as
 * the boss's brief, which is how the chat finds it again), then the Lead's planning run, unless the agency is paused.
 */
export function briefLead(agencyId: string, text: string): { cardId: string; planned: boolean } {
  const body = text.trim()
  if (!body) throw new Error('Write the brief.')
  const agency = db.getAgency(agencyId)
  if (!agency) throw new Error('That agency no longer exists.')
  const doc = readBoard(agency)
  if (!doc || !doc.columns.length) throw new Error(`${agency.name} has no board yet.`)
  const inbox = doc.columns.find((c) => c.title.trim().toLowerCase() === 'inbox') ?? doc.columns[0]
  const first = body.split('\n')[0].trim()
  const title = first.length > 80 ? `${first.slice(0, 79)}…` : first
  const card: KanbanCard = { id: randomUUID().slice(0, 8), title, notes: body, labels: [], agency: agency.id, createdAt: Date.now(), log: [] }
  log(card, BRIEF_LOG)
  inbox.cards.push(card)
  writeBoard(agency, doc)
  let planned = false
  if (agency.leadId && !agency.paused) {
    try { planNow(agencyId); planned = true } catch { /* the card waits in Inbox for the next planning run */ }
  }
  return { cardId: card.id, planned }
}
