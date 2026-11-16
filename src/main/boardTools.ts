import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Agency, Agent, KanbanCard, KanbanDoc } from '@shared/types'
import type { ToolCall, ToolDef, ToolResult } from './tools'
import * as db from './db'
import { needLabel, resolveTool, serverIsTool, TOOL_CATALOG } from '@shared/toolCatalog'
import type { CardNeed } from '@shared/types'
import { OPEN_ON_BOARD } from '@shared/cardOutcome'

/**
 * The Lead's board tools: list, add, edit, move, assign and comment on cards of its agency's board, run a card,
 * message the boss and keep the agency log. Everything stays inside the agency's folder; only the Lead
 * (agencies.lead_id) gets these tools. Workers never message the boss (channels.ts enforces it too).
 */

const uid = (): string => Math.random().toString(36).slice(2, 10)

/** Called after a board file changes on disk, so open Kanban screens reload. Set by index.ts. */
export let onBoardChanged: (projectId: string, path: string) => void = () => {}
export function setBoardChangedHook(fn: typeof onBoardChanged): void { onBoardChanged = fn }

export function boardFile(agency: Agency): string | null {
  const project = db.getProject(agency.projectId)
  if (!project?.folder || !agency.boardPath) return null
  return join(project.folder, agency.boardPath)
}

export function readBoard(agency: Agency): KanbanDoc | null {
  const file = boardFile(agency)
  if (!file || !existsSync(file)) return null
  try {
    const d = JSON.parse(readFileSync(file, 'utf8')) as KanbanDoc
    return d && Array.isArray(d.columns) ? d : null
  } catch { return null }
}

export function writeBoard(agency: Agency, doc: KanbanDoc): void {
  const file = boardFile(agency)
  if (!file) throw new Error('This team has no board file.')
  // Write to a temporary file and rename, so a crash mid-write never leaves a half-written (unreadable) board.
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(doc, null, 2), 'utf8')
  renameSync(tmp, file)
  onBoardChanged(agency.projectId, agency.boardPath)
}

export function findCard(doc: KanbanDoc, id: string): { card: KanbanCard; column: KanbanDoc['columns'][number] } | null {
  for (const column of doc.columns) { const card = column.cards.find((c) => c.id === id); if (card) return { card, column } }
  return null
}

/** Changes one card in place and saves the board. Returns false when the card is gone. */
export function patchCard(agency: Agency, cardId: string, patch: (card: KanbanCard, doc: KanbanDoc) => void): boolean {
  const doc = readBoard(agency)
  if (!doc) return false
  const hit = findCard(doc, cardId)
  if (!hit) return false
  patch(hit.card, doc)
  writeBoard(agency, doc)
  return true
}

export function moveCard(doc: KanbanDoc, cardId: string, columnTitle: string): boolean {
  const target = doc.columns.find((c) => c.title.toLowerCase() === columnTitle.trim().toLowerCase())
  const hit = findCard(doc, cardId)
  if (!target || !hit) return false
  hit.column.cards = hit.column.cards.filter((c) => c.id !== cardId)
  // Back to Planned means "do it again": without clearing the old status auto-run (which starts only cards with
  // no status) never picked a sent-back card up (10 Nov 2026). The previous result stays until the rerun replaces it.
  const sentBack = /^planned$/i.test(target.title) && !!hit.card.status && hit.card.status !== 'running'
  // A sent-back card goes to the front, so it runs before the cards that build on it (QA 16 Nov 2026).
  if (sentBack) target.cards.unshift(hit.card)
  else target.cards.push(hit.card)
  log(hit.card, `Moved to ${target.title}`)
  if (sentBack) {
    delete hit.card.status
    log(hit.card, 'Sent back to run again')
  }
  return true
}

export function log(card: KanbanCard, text: string): void {
  card.log = [...(card.log ?? []), { at: Date.now(), text }].slice(-40)
}

/** The agency's agents by name, for assignments ("Sam (Backend)" or just "Sam"). */
function roster(agency: Agency): Agent[] {
  return db.listAgents().filter((a) => a.agency === agency.id)
}
function findMember(agency: Agency, who: unknown): Agent | null {
  const q = String(who ?? '').trim().toLowerCase()
  if (!q) return null
  const team = roster(agency)
  return team.find((a) => a.id === q) ?? team.find((a) => a.name.toLowerCase() === q) ?? team.find((a) => a.name.toLowerCase().startsWith(q)) ?? null
}

/** What the Lead sees in its system prompt: the roster with ids and every card by column. */
/** How the Lead's plan waits for the boss: the line in its prompt and the refusal board_run_card gives. */
const APPROVAL_LINE = 'Cards wait in Planned with an assignee until the boss approves the plan in the task ("Approve and run the plan"); you cannot start them yourself. After planning, send the boss one "brief" message saying the plan is ready; do not send a question asking for approval, the task already shows an Approve button. Cards then run one at a time in board order.'

/** A card's state for the Lead: running, failed (with the reason from its log), or done with a result. */
function cardState(c: KanbanCard): string {
  if (c.status === 'running') return ' — status: running'
  if (c.status === 'failed') {
    const why = [...(c.log ?? [])].reverse().find((l) => / failed: |^Could not start: /.test(l.text))?.text
    return ` — status: failed${why ? ` (${why.replace(/^.*? failed: |^Could not start: /, '').slice(0, 160)})` : ''}`
  }
  const issues = c.openIssues ? `; open issues: ${c.openIssues.slice(0, 200)}` : ''
  if (c.status === 'done') return ` — status: done, has a result${issues}`
  return c.result ? ` — has a result${issues}` : ''
}

const isDone = (title: string): boolean => /^done$/i.test(title.trim())

/** What is still open on the board, one line each: failed or blocked cards, open issues, cards waiting in Review. */
export function openItems(doc: KanbanDoc): string[] {
  const out: string[] = []
  for (const col of doc.columns) {
    for (const c of col.cards) {
      if (c.status === 'failed' && !isDone(col.title)) out.push(`"${c.title}" failed${cardState(c).replace(/^ — status: failed/, '')}`)
      else if (c.openIssues) out.push(`"${c.title}" has open issues: ${c.openIssues.slice(0, 200)}`)
      else if (/^review$/i.test(col.title.trim()) && c.status !== 'running') out.push(`"${c.title}" is waiting in Review`)
    }
  }
  return out
}

/** What the Lead sees in its system prompt: the roster with ids and every card by column. */
/** "Team tools: GitHub (Zoe, Ryan); Playwright (Nora)" from the connectors switched on for the roster. */
function teamTools(team: Agent[]): string {
  const ids = new Set(team.map((a) => a.id))
  const list = db.listMcpServers().filter((s) => s.agentIds.some((id) => ids.has(id))).map((s) => `${resolveTool(s.preset || s.name)?.title ?? s.title ?? s.name} (${team.filter((a) => s.agentIds.includes(a.id)).map((a) => a.name.split(' ')[0]).join(', ')})`)
  return `Team tools: ${list.length ? list.join('; ') : 'none yet'}.`
}

/** Needs on a card the assignee still lacks (a tool not connected for them, a skill not attached). */
export function missingNeeds(card: KanbanCard, agent: Agent): CardNeed[] {
  const servers = db.mcpServersForAgent(agent.id)
  return (card.needs ?? []).filter((n) => (n.kind === 'skill' ? !agent.skills.includes(n.name) : !servers.some((s) => serverIsTool(s, n.name))))
}
export { needLabel }

export function boardSummary(agency: Agency): string {
  const team = roster(agency)
  const doc = readBoard(agency)
  const lines = [
    `Team "${agency.name}". Goal: ${agency.goal || '(none set)'}.`,
    agency.budget !== null ? `Budget: ${agency.spent.toFixed(2)} spent of ${agency.budget} this month.` : 'Budget: none set.',
    boardHooks.runsOnItsOwn(agency)
      ? `Cards in Planned with an assignee start on their own after you plan${agency.autoRun ? '' : ' (the boss approved the plan)'}; board_run_card starts one right away.`
      : APPROVAL_LINE,
    '',
    'Roster (name: job):',
    ...team.map((a) => `- ${a.name}${a.id === agency.leadId ? ' (you, the Lead)' : ''}: ${a.description || 'agent'}; runs on ${a.engine === 'builtin' ? a.model : a.engine}${a.skills.length ? `; skills: ${a.skills.join(', ')}` : ''}`),
    teamTools(team),
    `Tools the boss can add from the chat: ${TOOL_CATALOG.map((t) => (t.id === 'playwright' ? 'Playwright (a browser)' : t.title)).join(', ')}. Skills in the library: ${db.listSkills().map((s) => s.name).join(', ') || 'none'}.`,
    ''
  ]
  if (!doc) { lines.push('Board: (missing)'); return lines.join('\n') }
  lines.push(`Board columns: ${doc.columns.map((c) => c.title).join(' → ')}.`)
  for (const col of doc.columns) {
    lines.push(`\n${col.title} (${col.cards.length}):`)
    for (const c of col.cards) {
      const who = c.assignee ? team.find((a) => a.id === c.assignee)?.name ?? 'unknown' : 'unassigned'
      lines.push(`- [${c.id}] ${c.title} — ${who}${cardState(c)}${c.notes.trim() ? `\n  ${c.notes.trim().slice(0, 300).replace(/\n/g, ' ')}` : ''}`)
    }
  }
  return lines.join('\n')
}

/** The Lead's `needs` on a card, checked against the tool catalogue and the skill library so a typo can't ask for nothing. */
function parseNeeds(raw: unknown): CardNeed[] {
  if (!Array.isArray(raw)) return []
  const skills = new Set(db.listSkills().map((s) => s.name))
  const out: CardNeed[] = []
  for (const n of raw as { kind?: unknown; name?: unknown; why?: unknown }[]) {
    const kind = n?.kind === 'skill' ? 'skill' : n?.kind === 'tool' ? 'tool' : null
    const name = String(n?.name ?? '').trim()
    if (!kind || !name) continue
    if (kind === 'tool') {
      const t = resolveTool(name)
      if (!t) throw new Error(`No tool called "${name}". Tools: ${TOOL_CATALOG.map((x) => x.title).join(', ')}.`)
      out.push({ kind, name: t.id, ...(n.why ? { why: String(n.why).slice(0, 200) } : {}) })
    } else {
      if (!skills.has(name)) throw new Error(`No skill called "${name}" in the library. Use a name from the roster's skills or the library list.`)
      out.push({ kind, name, ...(n.why ? { why: String(n.why).slice(0, 200) } : {}) })
    }
  }
  return out.slice(0, 6)
}

export const BOARD_TOOLS: ToolDef[] = [
  { name: 'board_list_cards', description: 'The team board: every column and card with its id, assignee and state.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  {
    name: 'board_add_card',
    description: 'Add a card to the board. Put the brief it came from, what "done" looks like and an estimate in the notes.',
    parameters: { type: 'object', properties: {
      title: { type: 'string' }, notes: { type: 'string', description: 'What to do, what done looks like, estimate' },
      column: { type: 'string', description: 'Inbox, Planned, In progress, Review or Done (default Planned)' },
      assignee: { type: 'string', description: 'A roster member by name, e.g. "Sam (Backend)"' },
      parent_card: { type: 'string', description: 'The card id this one was split from, if any' },
      needs: { type: 'array', description: 'What the card needs that the team may not have: a tool (Playwright = a browser, GitHub, Linear, Stripe) or a skill from the library, by name, with why', items: { type: 'object', properties: { kind: { type: 'string', enum: ['tool', 'skill'] }, name: { type: 'string' }, why: { type: 'string' } }, required: ['kind', 'name'] } }
    }, required: ['title'] }
  },
  {
    name: 'board_edit_card',
    description: 'Change a card\'s title and/or notes, for example a starter card from the template that should carry this brief\'s work. The worker reads only the title and notes, so the notes must hold the full instructions: what to do, which files, what "done" looks like.',
    parameters: { type: 'object', properties: {
      card_id: { type: 'string' },
      title: { type: 'string', description: 'New title (left as is when omitted)' },
      notes: { type: 'string', description: 'New notes, replacing the old ones (left as is when omitted)' },
      needs: { type: 'array', description: 'What the card needs that the team may not have: a tool (Playwright = a browser, GitHub, Linear, Stripe) or a skill from the library, by name, with why', items: { type: 'object', properties: { kind: { type: 'string', enum: ['tool', 'skill'] }, name: { type: 'string' }, why: { type: 'string' } }, required: ['kind', 'name'] } }
    }, required: ['card_id'] }
  },
  {
    name: 'board_move_card',
    description: 'Move a card to another column. Done means checked and finished: a running or failed card can\'t go there, and a card with open issues only when they are fixed and checked, or the boss accepted them (then set accept_open_issues and say so in the digest).',
    parameters: { type: 'object', properties: { card_id: { type: 'string' }, column: { type: 'string' }, accept_open_issues: { type: 'boolean', description: 'Only when the boss accepted the card\'s open issues as they are.' } }, required: ['card_id', 'column'] }
  },
  { name: 'board_assign_card', description: 'Give a card to a roster member.', parameters: { type: 'object', properties: { card_id: { type: 'string' }, assignee: { type: 'string' } }, required: ['card_id', 'assignee'] } },
  { name: 'board_comment', description: 'Add a note to a card\'s log (a review verdict, a question, a decision).', parameters: { type: 'object', properties: { card_id: { type: 'string' }, text: { type: 'string' } }, required: ['card_id', 'text'] } },
  { name: 'board_run_card', description: 'Start a card: its assignee works on it now in its own chat. The result lands on the card and it moves to Review.', parameters: { type: 'object', properties: { card_id: { type: 'string' } }, required: ['card_id'] } },
  {
    name: 'message_boss',
    description: 'Send the boss one message. kind: brief (a brief was received and planned), question (put two to four short answers in options), review (work is ready to review), digest (what moved, what is next, what you need) or needs (the plan needs a tool or skill the team lacks: say which and why in text, and put "Add <name>" for each in options plus "Plan without them"; the boss adds them in the app). Name the card it is about in card_id. The boss answers in the Inbox and the answer comes back to you. Only you, the Lead, can do this.',
    parameters: { type: 'object', properties: { kind: { type: 'string', enum: ['brief', 'question', 'review', 'digest', 'needs'] }, text: { type: 'string' }, options: { type: 'array', items: { type: 'string' }, description: 'For a question: two to four short answers the boss can tap.' }, card_id: { type: 'string', description: 'The card this is about, if any.' } }, required: ['kind', 'text'] }
  },
  { name: 'agency_log', description: 'Append a line to agency-log.md (date, card, decision, cost).', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }
]

export const BOARD_TOOL_NAMES = new Set(BOARD_TOOLS.map((t) => t.name))

/** Set by cards.ts (runs a card) and channels.ts (messages the boss), to avoid import cycles. */
export const boardHooks: {
  runCard: (agency: Agency, cardId: string) => Promise<string>
  /** True when Planned cards start without the boss: auto-run, or the boss approved the plan (cards.ts). */
  runsOnItsOwn: (agency: Agency) => boolean
  /** The agency's card that is running right now, if any (cards.ts); board_run_card refuses a second one. */
  runningCard: (agency: Agency) => { id: string; title: string } | null
  messageBoss: (agency: Agency, from: Agent, kind: 'brief' | 'question' | 'review' | 'digest' | 'needs', text: string, extras: { options?: string[]; cardId?: string | null }) => Promise<string>
} = {
  runCard: async () => { throw new Error('Card runs are not available.') },
  runsOnItsOwn: (agency) => agency.autoRun,
  runningCard: () => null,
  messageBoss: async () => { throw new Error('No channel is set up.') }
}

export async function runBoardTool(call: ToolCall, agent: Agent, agency: Agency): Promise<ToolResult> {
  const ok = (content: string): ToolResult => ({ id: call.id, content, isError: false })
  const input = call.input
  if (call.name === 'board_list_cards') return ok(boardSummary(agency))
  if (call.name === 'message_boss') {
    const raw = String(input.kind ?? 'digest')
    const kind = (['brief', 'question', 'review', 'digest', 'needs'].includes(raw) ? raw : 'digest') as 'brief' | 'question' | 'review' | 'digest' | 'needs'
    const options = Array.isArray(input.options) ? input.options.map(String) : []
    let text = String(input.text ?? '')
    const doc = readBoard(agency)
    // A "plan is ready" brief with nothing planned sent the boss to an Approve button that wasn't there (QA 16 Nov 2026).
    if (kind === 'brief' && doc) {
      const planned = doc.columns.filter((c) => /^(planned|in progress)$/i.test(c.title.trim())).flatMap((c) => c.cards).filter((k) => k.assignee || k.agentId)
      if (!planned.length) return { id: call.id, content: 'Not sent: there are no cards in Planned with an assignee, so there is no plan to approve. Add the cards first (board_add_card with column Planned and an assignee, or board_assign_card and board_move_card on the starter cards), check them with board_list_cards, then send the brief.', isError: true }
    }
    // A digest always says what is still open, whatever the Lead wrote (QA 16 Nov 2026: "Nothing else for this brief"
    // with QA failures unresolved).
    if (kind === 'digest' && doc) {
      const open = openItems(doc)
      if (open.length) text = `${text.trim()}\n\n${OPEN_ON_BOARD}\n${open.map((l) => `- ${l}`).join('\n')}`
    }
    return ok(await boardHooks.messageBoss(agency, agent, kind, text, { options, cardId: input.card_id ? String(input.card_id) : null }))
  }
  if (call.name === 'agency_log') {
    const project = db.getProject(agency.projectId)
    if (!project?.folder) throw new Error('No team folder.')
    // Agencies can share one folder, so the log names the agency on each line and Leads' own dates are dropped.
    const file = join(project.folder, 'agency-log.md')
    const text = String(input.text ?? '').trim().replace(/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?Z?)?\s*[—–-]?\s*/, '')
    const line = `- ${new Date().toISOString().slice(0, 16).replace('T', ' ')} [${agency.name}] ${text}\n`
    writeFileSync(file, (existsSync(file) ? readFileSync(file, 'utf8') : '# Team log\n\n') + line, 'utf8')
    return ok('Logged.')
  }
  if (call.name === 'board_run_card') {
    // Without auto-run (or the boss's approval) the Lead plans; only the boss starts the work.
    if (!boardHooks.runsOnItsOwn(agency)) return { id: call.id, content: `Not started. ${APPROVAL_LINE} Leave the card in Planned with an assignee.`, isError: true }
    // One card at a time: the next Planned card starts on its own when the running one finishes (10 Nov 2026).
    const running = boardHooks.runningCard(agency)
    if (running && running.id !== String(input.card_id ?? '')) return { id: call.id, content: `Not started: "${running.title}" is still running. Cards run one at a time; the next card in Planned starts on its own when it finishes. Leave this card in Planned with its assignee.`, isError: true }
    return ok(await boardHooks.runCard(agency, String(input.card_id ?? '')))
  }

  const doc = readBoard(agency)
  if (!doc) throw new Error('The board file is missing.')
  if (call.name === 'board_add_card') {
    const title = String(input.title ?? '').trim()
    if (!title) throw new Error('A card needs a title.')
    let colName = String(input.column ?? 'Planned')
    // A new card can't skip the boss's approval by landing in "In progress".
    if (/progress/i.test(colName) && !boardHooks.runsOnItsOwn(agency)) colName = 'Planned'
    const column = doc.columns.find((c) => c.title.toLowerCase() === colName.toLowerCase()) ?? doc.columns[1] ?? doc.columns[0]
    const who = input.assignee ? findMember(agency, input.assignee) : null
    if (input.assignee && !who) throw new Error(`No one called "${String(input.assignee)}" is on the roster.`)
    const card: KanbanCard = { id: uid(), title, notes: String(input.notes ?? ''), labels: [], agency: agency.id, createdAt: Date.now(), log: [] }
    if (who) { card.assignee = who.id; card.agentId = who.id }
    if (input.parent_card) card.parentCard = String(input.parent_card)
    const needs = parseNeeds(input.needs)
    if (needs.length) card.needs = needs
    log(card, `Added by ${agent.name}${who ? `, assigned to ${who.name}` : ''}`)
    column.cards.push(card)
    writeBoard(agency, doc)
    return ok(`Added [${card.id}] "${title}" to ${column.title}${who ? ` for ${who.name}` : ''}.`)
  }
  const hit = findCard(doc, String(input.card_id ?? ''))
  if (!hit) throw new Error(`No card with id ${String(input.card_id)}.`)
  if (call.name === 'board_edit_card') {
    const title = typeof input.title === 'string' ? input.title.trim().slice(0, 120) : ''
    const notes = typeof input.notes === 'string' ? input.notes : null
    if (!title && notes === null && input.needs === undefined) throw new Error('Give a new title, new notes, needs, or all three.')
    if (hit.card.status === 'running') throw new Error('That card is running; wait for it to finish.')
    const changed: string[] = []
    if (title && title !== hit.card.title) { hit.card.title = title; changed.push('title') }
    if (notes !== null && notes !== hit.card.notes) { hit.card.notes = notes; changed.push('notes') }
    if (input.needs !== undefined) { const needs = parseNeeds(input.needs); if (JSON.stringify(needs) !== JSON.stringify(hit.card.needs ?? [])) { if (needs.length) hit.card.needs = needs; else delete hit.card.needs; changed.push('needs') } }
    if (changed.length) {
      log(hit.card, `Edited by ${agent.name} (${changed.join(' and ')})`)
      writeBoard(agency, doc)
    }
    return ok(changed.length ? `Updated the ${changed.join(' and ')} of [${hit.card.id}] "${hit.card.title}".` : 'Nothing changed.')
  }
  if (call.name === 'board_move_card') {
    if (isDone(String(input.column ?? ''))) {
      const c = hit.card
      if (c.status === 'running') return { id: call.id, content: `Not moved: "${c.title}" is still running. Review it when its run ends.`, isError: true }
      if (c.status === 'failed') return { id: call.id, content: `Not moved: "${c.title}" failed or is blocked${cardState(c).replace(/^ — status: failed/, '')}. Answer it and send it back to Planned, or remove it.`, isError: true }
      if (c.openIssues && input.accept_open_issues !== true) return { id: call.id, content: `Not moved: "${c.title}" reported open issues: ${c.openIssues}. Send it back to Planned with notes (or add a fix card) and check the fix. Only if the boss accepted these issues as they are, call again with accept_open_issues: true and name them in the digest.`, isError: true }
      if (c.openIssues) { log(c, `Open issues accepted by ${agent.name}: ${c.openIssues.slice(0, 200)}`); delete c.openIssues }
    }
    if (!moveCard(doc, hit.card.id, String(input.column ?? ''))) throw new Error(`No column called "${String(input.column)}".`)
    writeBoard(agency, doc)
    return ok(`Moved "${hit.card.title}" to ${String(input.column)}.`)
  }
  if (call.name === 'board_assign_card') {
    const who = findMember(agency, input.assignee)
    if (!who) throw new Error(`No one called "${String(input.assignee)}" is on the roster.`)
    hit.card.assignee = who.id
    hit.card.agentId = who.id
    log(hit.card, `Assigned to ${who.name} by ${agent.name}`)
    writeBoard(agency, doc)
    return ok(`"${hit.card.title}" is now ${who.name}'s.`)
  }
  if (call.name === 'board_comment') {
    log(hit.card, `${agent.name}: ${String(input.text ?? '').trim()}`)
    writeBoard(agency, doc)
    return ok('Noted on the card.')
  }
  throw new Error(`Unknown tool ${call.name}`)
}
