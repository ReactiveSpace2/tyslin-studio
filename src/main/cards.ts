import { missingNeeds, needLabel } from './boardTools'
import { isTaskChat } from '@shared/taskChat'
import { randomUUID } from 'crypto'
import type { Agency, Agent, KanbanCard, PendingChange, RunEvent, ScheduledTask } from '@shared/types'
import { AGENCY_TEMPLATES, BRIEF_LOG, isQuick } from '@shared/agencies'
import { estimateCost, type Usage } from '@shared/pricing'
import { OUTCOME_INSTRUCTION, parseOutcome } from '@shared/cardOutcome'
import * as db from './db'
import { atCap, capMessage } from './budget'
import { boardHooks, findCard, log, moveCard, patchCard, readBoard, writeBoard } from './boardTools'

/**
 * Cards are the unit of work. Running one starts a chat with its assignee (or the Lead) through the same
 * startRun path as every other message; when the run ends, the reply, chat id and estimated cost land on
 * the card and it moves to Review (or fails when the worker says it is blocked). Only the Lead's review (or the boss)
 * moves a card to Done: accepting its file changes doesn't (QA 16 Nov 2026). With auto-run on, the Lead's planned
 * cards start one after another until the budget is reached.
 */

interface Deps {
  startRun: (sessionId: string, text: string) => { runId: string; done: Promise<{ ok: boolean; error?: string }> }
  runTask: (t: ScheduledTask, scheduled: boolean) => string
  /** Throws why this agent can't run now (paused, no model key), before any chat is created. */
  checkReady: (agent: Agent) => void
}
let deps: Deps | null = null
/** Saves a Design board team's artboards as pictures (designExport.ts, set from index.ts; kept out so tests need no Electron). */
let designExporter: ((agency: Agency) => Promise<number>) | null = null
export const setDesignExporter = (fn: (agency: Agency) => Promise<number>): void => { designExporter = fn }
export function initCards(d: Deps): void {
  deps = d
  boardHooks.runCard = async (agency, cardId) => {
    const sessionId = await runCard(agency.id, cardId)
    return `Started; the result will land on the card (chat ${sessionId}).`
  }
  boardHooks.runsOnItsOwn = runsOnItsOwn
  boardHooks.runningCard = (agency) => {
    const doc = readBoard(agency)
    const hit = doc?.columns.flatMap((c) => c.cards).find((k) => active.has(k.id))
    return hit ? { id: hit.id, title: hit.title } : null
  }
  sweepStaleRuns()
}

/**
 * At launch nothing is running, so a card still marked `running` was cut off when the app closed mid-run. It is
 * marked failed with the reason, so the task stops showing "Working" and Run again is offered (10 Nov 2026).
 */
function sweepStaleRuns(): void {
  for (const agency of db.listAgencies()) {
    const doc = readBoard(agency)
    if (!doc) continue
    let changed = false
    for (const card of doc.columns.flatMap((c) => c.cards)) {
      if (card.status !== 'running' || active.has(card.id)) continue
      card.status = 'failed'
      log(card, 'Stopped when the app closed; run it again')
      changed = true
    }
    if (changed) writeBoard(agency, doc)
  }
}

/**
 * The card's result is the worker's last reply without the running commentary adapters stream between tool
 * calls ("I will create…", "Now I'll write…"): those paragraphs are dropped from the front until a real one.
 */
export function cardResult(text: string): string {
  const paras = text.trim().split(/\n{2,}/)
  while (paras.length > 1 && /^(I will|I'll|I am going to|I'm going to|Let me|Now I|Now,? let me|First,? I|Next,? I|Then I|I need to|I should|Okay,? I|OK,? I)\b/i.test(paras[0].trim())) paras.shift()
  return paras.join('\n\n').trim()
}

interface LiveRun { agencyId: string; cardId: string; usage: Usage }
/** Runs started from cards, by run id. Finished ones stay until the next launch so reviews can find their card. */
const runs = new Map<string, LiveRun>()
const active = new Set<string>()
/** Agencies whose plan the boss approved (cards:runPlan): their Planned cards run one after another like auto-run, until none is left. */
const approved = new Set<string>()
const runsOnItsOwn = (agency: Agency): boolean => agency.autoRun || isQuick(agency.templateId) || approved.has(agency.id)
/** Agencies with cards that finished since the Lead last reviewed; the Lead gets one review run when the plan runs out. */
const toReview = new Set<string>()
/** Teams whose Lead review couldn't start because the Lead was busy; it starts when the Lead's run ends. */
const pendingReview = new Set<string>()
/** Whether a card in this team is running. */
const teamBusy = (agency: Agency): boolean => { const doc = readBoard(agency); return !!doc && doc.columns.some((c) => c.cards.some((k) => active.has(k.id))) }
/** Review runs per agency today, so a Lead that keeps sending cards back can't loop for ever. */
const reviewRounds = new Map<string, { day: string; n: number }>()
const MAX_REVIEWS_PER_DAY = 6

export const REVIEW_PROMPT = [
  'Review the board now: the planned cards have run, or a worker is blocked.',
  '- For each card in Review: read its notes and result, and check the files it names exist and match what the notes asked for (use your file tools). Move it to Done only when it meets its notes. Otherwise send it back to Planned with board_edit_card notes that say exactly what is missing (it runs again on its own).',
  '- Read every QA or test report the cards produced. A failed check is open work: send the card that owns the fix back to Planned (or add a fix card), even if that card already said it was done. A card that reported open issues can only go to Done when they are fixed and checked, or the boss accepted them.',
  '- For each failed or blocked card: if the brief, the files or the other cards answer it, put the answer in its notes and send it back to Planned; if only the boss can answer, ask one message_boss question.',
  'Do not add new cards for work that is already Done, and do not ask the boss to approve anything unless a card went back.',
  'Then send the boss one digest: what is done, what went back and why, what is still open (every failed check and blocked card, by name), what is next. Never say the work is finished while anything is still open.'
].join('\n')

/** The Lead's review: in its newest chat in this agency (the task the boss briefed it from), so it shows in that thread. */
function startLeadReview(agency: Agency): void {
  if (!deps || !agency.leadId || agency.paused) return
  const day = new Date().toISOString().slice(0, 10)
  const r = reviewRounds.get(agency.id)
  const n = r?.day === day ? r.n : 0
  if (n >= MAX_REVIEWS_PER_DAY) { console.warn(`[cards] ${agency.name}: review limit reached for today`); return }
  const lead = db.getAgent(agency.leadId)
  if (!lead) return
  try { deps.checkReady(lead) } catch { return }
  const session = db.listSessions(lead.id).filter((x) => x.projectId === agency.projectId && isTaskChat(x)).sort((a, b) => b.createdAt - a.createdAt)[0]
    ?? db.createSession(lead.id, agency.projectId)
  // The Lead may be busy answering the boss (17 Nov 2026: a blocked card's review was thrown away, unhandled, while
  // Jade was still on the boss's answers). Keep it owed; cardsOnRunEvent starts it when the Lead's run ends.
  try { deps.startRun(session.id, REVIEW_PROMPT) } catch (err) {
    if (err instanceof Error && /still working/.test(err.message)) { pendingReview.add(agency.id); return }
    console.warn(`[cards] ${agency.name}: review did not start:`, err)
    return
  }
  pendingReview.delete(agency.id)
  reviewRounds.set(agency.id, { day, n: n + 1 })
  toReview.delete(agency.id)
}

export const runningCards = (): string[] => [...active]

/** Agencies running a plan the boss approved (in memory: after a restart the plan asks again). The Plan card reads it. */
export const approvedPlans = (): string[] => [...approved]

/** The card a run works on (for the cost ledger), while cards.ts still knows the run. */
export const cardForRun = (runId: string): string | null => runs.get(runId)?.cardId ?? null

/**
 * Plans waiting for the boss's OK: agencies that don't auto-run (and aren't running an approved plan) with cards
 * in Planned that have an assignee and no status. Home and Recents count these as "needs you" (QA, 10 Nov 2026).
 */
export function waitingPlans(): { agencyId: string; count: number; at: number }[] {
  const out: { agencyId: string; count: number; at: number }[] = []
  for (const agency of db.listAgencies()) {
    if (agency.paused || runsOnItsOwn(agency)) continue
    let doc
    try { doc = readBoard(agency) } catch { continue }
    const planned = doc?.columns.find((c) => c.title.toLowerCase() === 'planned')?.cards.filter((k) => (k.assignee || k.agentId) && !k.status) ?? []
    if (planned.length) out.push({ agencyId: agency.id, count: planned.length, at: Math.max(...planned.map((k) => k.createdAt ?? 0)) })
  }
  return out
}

/** "Approve and run the plan": starts the Planned cards one at a time, whatever the auto-run setting. Returns how many are planned. */
export async function runPlan(agencyId: string): Promise<number> {
  const agency = db.getAgency(agencyId)
  if (!agency) throw new Error('That team no longer exists.')
  if (!agency.leadId) throw new Error('This team has no Lead yet.')
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
  if (!agency) throw new Error('That team no longer exists.')
  if (active.has(cardId)) throw new Error('That card is running; wait for it to finish.')
  const ok = patchCard(agency, cardId, (card) => {
    if (typeof patch.title === 'string' && patch.title.trim()) card.title = patch.title.trim().slice(0, 120)
    if (typeof patch.notes === 'string') card.notes = patch.notes
    if (typeof patch.assignee === 'string' && patch.assignee !== card.assignee) {
      const who = db.getAgent(patch.assignee)
      if (!who || who.agency !== agency.id) throw new Error('Pick someone on this team\'s roster.')
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
  if (!agency) throw new Error('That team no longer exists.')
  if (active.has(cardId)) throw new Error('That card is running; stop it first.')
  const doc = readBoard(agency)
  if (!doc) throw new Error('The board file is missing.')
  if (!findCard(doc, cardId)) throw new Error('That card is gone.')
  for (const col of doc.columns) col.cards = col.cards.filter((c) => c.id !== cardId)
  writeBoard(agency, doc)
}

/** Prompts Tyslin writes into the Lead's chat; not part of the boss's brief. */
const TYSLIN_PROMPTS = /^(Review the board now|Every planned card has run|Work on this card from|Read the Inbox and Review columns)/
const BRIEF_CAP = 6000

/**
 * The boss's own words behind a card: the messages in the Lead's task the card came from (the brief, the boss's
 * answers and what was attached), else a brief typed into the Inbox. Workers used to get only the card, so when the
 * Lead's notes left out the product facts a designer guessed the wrong product (QA 16 Nov 2026).
 */
export function bossBrief(agency: Agency, card: KanbanCard): string {
  // The card's last activity before this run says which task it belongs to (starter cards are older than the task).
  const at = Math.max(card.createdAt ?? 0, ...(card.log ?? []).map((l) => l.at))
  if (agency.leadId) {
    const session = db.listSessions(agency.leadId)
      .filter((x) => x.projectId === agency.projectId && !x.title.startsWith('Card:') && x.createdAt <= at)
      .sort((a, b) => b.createdAt - a.createdAt)[0]
    if (session) {
      const parts: string[] = []
      for (const m of db.listMessages(session.id)) {
        if (m.role !== 'user' || m.createdAt > Date.now() || TYSLIN_PROMPTS.test(m.content.trim())) continue
        const files = m.attachments?.length ? `\n(Attached: ${m.attachments.map((a) => a.name).join(', ')}; copies are in attachments/ in the team folder.)` : ''
        parts.push(m.content.trim() + files)
      }
      const text = parts.join('\n\n---\n\n')
      if (text) return text.length > BRIEF_CAP ? `${text.slice(0, BRIEF_CAP)}\n[…the rest is in the Lead's task]` : text
    }
  }
  const doc = readBoard(agency)
  const inbox = doc?.columns.flatMap((c) => c.cards).filter((k) => k.id !== card.id && k.log?.some((l) => l.text === BRIEF_LOG) && (k.createdAt ?? 0) <= at)
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0]
  return inbox ? inbox.notes.trim().slice(0, BRIEF_CAP) : ''
}

const cardPrompt = (agency: Agency, card: KanbanCard, column: string): string => {
  const brief = bossBrief(agency, card)
  return [
    `Work on this card from the "${agency.name}" board (column: ${column}).`,
    '',
    `## ${card.title}`,
    card.notes.trim() ? `\n${card.notes.trim()}` : '',
    card.parentCard ? `\n(Split from card ${card.parentCard}.)` : '',
    brief ? `\n## The boss's brief (background for this card)\nThe card above is your task. This is what the boss asked for; use its facts, and if the card and the brief disagree, follow the card and say so in your reply.\n\n${brief}` : '',
    '',
    agency.goal ? `The team's goal: ${agency.goal}` : '',
    ...(isQuick(agency.templateId)
      // Quick teams (Design): the boss watches the board and checks the result there, so no test reports (17 Nov 2026:
      // Remy listed unrun 200% zoom checks as open issues and the cards waited in Review).
      ? ['Start drawing now; the boss is watching the board. Make what the card and the brief ask for, filling small gaps with sensible choices. Don\'t run or report checks: the boss checks the board. Reply in a few lines: each artboard you made or changed, with its size.',
        OUTCOME_INSTRUCTION + ' "Open issues" here means only something asked for that you could not make.']
      : ['Reply with the finished work for this card: what you did, where it is, what you could not do and why. If the card is unclear or you need something you do not have, say what you need and stop.',
        'Report a check as passed only when you ran it and say how (the command, or what you measured in a browser and at which width). A check you only judged by reading the code is "not verified", never "pass".',
        OUTCOME_INSTRUCTION])
  ].filter((l) => l !== '').join('\n')
}

/** Starts the card's assignee (or the Lead) on it. Returns the chat id. */
export async function runCard(agencyId: string, cardId: string): Promise<string> {
  if (!deps) throw new Error('Card runs are not ready yet.')
  const agency = db.getAgency(agencyId)
  if (!agency) throw new Error('That team no longer exists.')
  if (agency.paused) throw new Error(`${agency.name} is paused. Resume it on its page first.`)
  if (atCap(agency)) throw new Error(capMessage(agency))
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
  const { runId, done } = deps.startRun(session.id, cardPrompt(agency, hit.card, hit.column.title))
  db.setSessionTitle(session.id, `Card: ${hit.card.title}`.slice(0, 80))
  runs.set(runId, { agencyId, cardId, usage: { inputTokens: 0, outputTokens: 0 } })
  active.add(cardId)

  hit.card.runId = runId
  hit.card.sessionId = session.id
  hit.card.agentId = agent.id
  hit.card.assignee = hit.card.assignee || agent.id
  hit.card.status = 'running'
  log(hit.card, `Started with ${agent.name}`)
  const missing = missingNeeds(hit.card, agent)
  if (missing.length) log(hit.card, `Started without ${missing.map(needLabel).join(' and ')}; add them from the plan or the Tools pill`)
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
  // The run's cost comes from the ledger row startRun wrote (actual, estimated, or null = not reported).
  const entry = db.costForRun(runId)
  const cost = entry?.cost ?? null
  const costNote = entry && cost !== null ? ` · $${cost.toFixed(4)}${entry.source === 'estimated' ? ' est.' : ''}` : ''
  const doc = readBoard(agency)
  if (!doc) return
  const hit = findCard(doc, run.cardId)
  if (!hit) return
  const sessionId = hit.card.sessionId
  const text = cardResult(sessionId ? db.listMessages(sessionId).filter((m) => m.role === 'assistant').pop()?.content ?? '' : '')
  const outcome = r.ok && text ? parseOutcome(text) : null
  let blocked = false
  if (r.ok && !text) {
    // The run ended cleanly but said nothing: not done. The card stays where it is for a retry (10 Nov 2026).
    hit.card.status = 'failed'
    log(hit.card, `${agent.name} finished without reporting a result`)
  } else if (r.ok && outcome?.kind === 'blocked') {
    // The worker couldn't do it (asked a question, missing input): not finished. The card fails with the reason and
    // the Lead reviews now, before the next card builds on nothing (QA 16 Nov 2026).
    hit.card.result = text
    hit.card.status = 'failed'
    delete hit.card.openIssues
    if (cost !== null) hit.card.cost = (hit.card.cost ?? 0) + cost
    log(hit.card, `${agent.name} failed: blocked: ${outcome.why.slice(0, 200)}${costNote}`)
    blocked = true
  } else if (r.ok) {
    hit.card.result = text
    hit.card.status = 'done'
    if (outcome?.kind === 'issues') hit.card.openIssues = outcome.issues.slice(0, 600)
    else delete hit.card.openIssues
    if (cost !== null) hit.card.cost = (hit.card.cost ?? 0) + cost
    log(hit.card, `${agent.name} finished${costNote}`)
    if (outcome?.kind === 'issues') log(hit.card, `Open issues: ${outcome.issues.slice(0, 300)}`)
    const pending = sessionId ? db.listChanges(sessionId).some((c) => c.runId === runId && c.status === 'pending') : false
    // Quick teams (Design): the boss checks the result on the board, so a clean finish is Done with no review round.
    const quick = isQuick(agency.templateId) && outcome?.kind !== 'issues' && !pending
    if (!/done/i.test(hit.column.title)) moveCard(doc, run.cardId, quick ? 'Done' : 'Review')
    if (quick) log(hit.card, 'Done: on the board for the boss to check')
    if (pending) log(hit.card, 'File changes are waiting for review')
    if (!quick) toReview.add(agency.id)
  } else {
    hit.card.status = 'failed'
    log(hit.card, `${agent.name} failed: ${(r.error ?? 'unknown error').slice(0, 200)}`)
  }
  writeBoard(agency, doc)
  // Artboards the card drew are saved as PNG and JPEG for other teams (Design board teams only).
  if (r.ok && designExporter) void designExporter(agency).catch((err) => console.warn(`[cards] ${agency.name}: design export failed:`, err))
  if (blocked) {
    // Stop the chain: the Lead unblocks the card (or asks the boss) first; the plan goes on after its review.
    toReview.add(agency.id)
    startLeadReview(db.getAgency(agency.id)!)
    return
  }
  if (runsOnItsOwn(agency) && r.ok) void runNext(db.getAgency(agency.id)!)
}

/** Auto-run (or an approved plan): the next planned card with an assignee that has never run, one at a time. */
export async function runNext(agency: Agency): Promise<void> {
  if (!runsOnItsOwn(agency) || agency.paused) return
  // At the cap new cards wait (the plan stays approved) until the boss raises it or the month ends (budget.ts).
  if (atCap(agency)) return
  const doc = readBoard(agency)
  if (!doc) return
  const busy = doc.columns.some((c) => c.cards.some((k) => active.has(k.id)))
  if (busy) return
  const planned = doc.columns.find((c) => c.title.toLowerCase() === 'planned')
  const next = planned?.cards.find((k) => (k.assignee || k.agentId) && !k.status)
  if (!next) {
    approved.delete(agency.id)
    // The plan ran out: the Lead reviews what finished (once per round), so nothing waits in Review unseen.
    if (toReview.has(agency.id)) startLeadReview(agency)
    return
  }
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
  // A Lead run that errored part-way may still have planned cards; they start as after a finished run, unless the
  // boss stopped it (10 Nov 2026).
  if ((e.type === 'run_finished' || (e.type === 'run_error' && e.error !== 'Stopped.')) && !run) {
    const session = db.getSession(e.sessionId)
    const agent = session ? db.getAgent(session.agentId) : null
    const agency = agent?.agency ? db.getAgency(agent.agency) : null
    if (agency && agency.leadId === agent!.id && runsOnItsOwn(agency)) void runNext(agency)
    // A review that was owed while the Lead was busy, once no card is running in the team.
    else if (agency && agency.leadId === agent!.id && pendingReview.has(agency.id) && !teamBusy(agency)) setTimeout(() => { const a = db.getAgency(agency.id); if (a && pendingReview.has(a.id)) startLeadReview(a) }, 1000)
  }
}

/**
 * A reviewed change is logged on its card. It never moves the card: accepting a file only lets it be written; whether
 * the card is finished is the Lead's review (or the boss's) after the run ends. Moving to Done here put cards in Done
 * while their worker was still running and skipped the review (QA 16 Nov 2026).
 */
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
    patchCard(agency, hit.id, (card) => {
      log(card, accepted ? 'Changes reviewed and accepted' : 'Changes reviewed; none accepted')
    })
    return
  }
}

/** Runs the Lead's "plan the Inbox" prompt now. Returns the chat id. */
export function planNow(agencyId: string): string {
  if (!deps) throw new Error('Not ready yet.')
  const agency = db.getAgency(agencyId)
  if (!agency) throw new Error('That team no longer exists.')
  if (!agency.leadId) throw new Error('This team has no Lead yet.')
  if (agency.paused) throw new Error(`${agency.name} is paused.`)
  const task = db.listTasks().find((t) => t.agentId === agency.leadId)
  if (task) return deps.runTask(task, false)
  const prompt = AGENCY_TEMPLATES.find((t) => t.id === agency.templateId)?.leadTask.prompt
    ?? 'Read the Inbox and Review columns. Plan new briefs into cards with assignees in Planned, review finished cards, and send the boss a digest.'
  const lead = db.getAgent(agency.leadId)
  if (!lead) throw new Error('This team has no Lead yet.')
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
  if (!agency) throw new Error('That team no longer exists.')
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
