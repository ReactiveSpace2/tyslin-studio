import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Agency, Agent, KanbanCard, KanbanDoc } from '@shared/types'
import type { ToolCall, ToolDef, ToolResult } from './tools'
import * as db from './db'

/**
 * The Lead's board tools: list, add, move, assign and comment on cards of its agency's board, run a card,
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
  if (!file) throw new Error('This agency has no board file.')
  writeFileSync(file, JSON.stringify(doc, null, 2), 'utf8')
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
  target.cards.push(hit.card)
  log(hit.card, `Moved to ${target.title}`)
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
export function boardSummary(agency: Agency): string {
  const team = roster(agency)
  const doc = readBoard(agency)
  const lines = [
    `Agency "${agency.name}". Goal: ${agency.goal || '(none set)'}.`,
    agency.budget !== null ? `Budget: ${agency.spent.toFixed(2)} spent of ${agency.budget} this month.` : 'Budget: none set.',
    `Cards ${agency.autoRun ? 'in Planned with an assignee start on their own after you plan' : 'are started by the boss, or by you with board_run_card'}.`,
    '',
    'Roster (name: job):',
    ...team.map((a) => `- ${a.name}${a.id === agency.leadId ? ' (you, the Lead)' : ''}: ${a.description || 'agent'}; runs on ${a.engine === 'builtin' ? a.model : a.engine}`),
    ''
  ]
  if (!doc) { lines.push('Board: (missing)'); return lines.join('\n') }
  lines.push(`Board columns: ${doc.columns.map((c) => c.title).join(' → ')}.`)
  for (const col of doc.columns) {
    lines.push(`\n${col.title} (${col.cards.length}):`)
    for (const c of col.cards) {
      const who = c.assignee ? team.find((a) => a.id === c.assignee)?.name ?? 'unknown' : 'unassigned'
      lines.push(`- [${c.id}] ${c.title} — ${who}${c.status === 'running' ? ' — running' : c.result ? ' — has a result' : ''}${c.notes.trim() ? `\n  ${c.notes.trim().slice(0, 300).replace(/\n/g, ' ')}` : ''}`)
    }
  }
  return lines.join('\n')
}

export const BOARD_TOOLS: ToolDef[] = [
  { name: 'board_list_cards', description: 'The agency board: every column and card with its id, assignee and state.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  {
    name: 'board_add_card',
    description: 'Add a card to the board. Put the brief it came from, what "done" looks like and an estimate in the notes.',
    parameters: { type: 'object', properties: {
      title: { type: 'string' }, notes: { type: 'string', description: 'What to do, what done looks like, estimate' },
      column: { type: 'string', description: 'Inbox, Planned, In progress, Review or Done (default Planned)' },
      assignee: { type: 'string', description: 'A roster member by name, e.g. "Sam (Backend)"' },
      parent_card: { type: 'string', description: 'The card id this one was split from, if any' }
    }, required: ['title'] }
  },
  { name: 'board_move_card', description: 'Move a card to another column.', parameters: { type: 'object', properties: { card_id: { type: 'string' }, column: { type: 'string' } }, required: ['card_id', 'column'] } },
  { name: 'board_assign_card', description: 'Give a card to a roster member.', parameters: { type: 'object', properties: { card_id: { type: 'string' }, assignee: { type: 'string' } }, required: ['card_id', 'assignee'] } },
  { name: 'board_comment', description: 'Add a note to a card\'s log (a review verdict, a question, a decision).', parameters: { type: 'object', properties: { card_id: { type: 'string' }, text: { type: 'string' } }, required: ['card_id', 'text'] } },
  { name: 'board_run_card', description: 'Start a card: its assignee works on it now in its own chat. The result lands on the card and it moves to Review.', parameters: { type: 'object', properties: { card_id: { type: 'string' } }, required: ['card_id'] } },
  {
    name: 'message_boss',
    description: 'Send the boss one message. kind: brief (a brief was received and planned), question (put two to four short answers in options), review (work is ready to review) or digest (what moved, what is next, what you need). Name the card it is about in card_id. The boss answers in the Inbox and the answer comes back to you. Only you, the Lead, can do this.',
    parameters: { type: 'object', properties: { kind: { type: 'string', enum: ['brief', 'question', 'review', 'digest'] }, text: { type: 'string' }, options: { type: 'array', items: { type: 'string' }, description: 'For a question: two to four short answers the boss can tap.' }, card_id: { type: 'string', description: 'The card this is about, if any.' } }, required: ['kind', 'text'] }
  },
  { name: 'agency_log', description: 'Append a line to agency-log.md (date, card, decision, cost).', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }
]

export const BOARD_TOOL_NAMES = new Set(BOARD_TOOLS.map((t) => t.name))

/** Set by cards.ts (runs a card) and channels.ts (messages the boss), to avoid import cycles. */
export const boardHooks: {
  runCard: (agency: Agency, cardId: string) => Promise<string>
  messageBoss: (agency: Agency, from: Agent, kind: 'brief' | 'question' | 'review' | 'digest', text: string, extras: { options?: string[]; cardId?: string | null }) => Promise<string>
} = {
  runCard: async () => { throw new Error('Card runs are not available.') },
  messageBoss: async () => { throw new Error('No channel is set up.') }
}

export async function runBoardTool(call: ToolCall, agent: Agent, agency: Agency): Promise<ToolResult> {
  const ok = (content: string): ToolResult => ({ id: call.id, content, isError: false })
  const input = call.input
  if (call.name === 'board_list_cards') return ok(boardSummary(agency))
  if (call.name === 'message_boss') {
    const kind = String(input.kind ?? 'digest') as 'brief' | 'question' | 'review' | 'digest'
    const options = Array.isArray(input.options) ? input.options.map(String) : []
    return ok(await boardHooks.messageBoss(agency, agent, ['brief', 'question', 'review', 'digest'].includes(kind) ? kind : 'digest', String(input.text ?? ''), { options, cardId: input.card_id ? String(input.card_id) : null }))
  }
  if (call.name === 'agency_log') {
    const project = db.getProject(agency.projectId)
    if (!project?.folder) throw new Error('No agency folder.')
    const file = join(project.folder, 'agency-log.md')
    const line = `- ${new Date().toISOString().slice(0, 16).replace('T', ' ')} ${String(input.text ?? '').trim()}\n`
    writeFileSync(file, (existsSync(file) ? readFileSync(file, 'utf8') : `# ${agency.name} log\n\n`) + line, 'utf8')
    return ok('Logged.')
  }
  if (call.name === 'board_run_card') return ok(await boardHooks.runCard(agency, String(input.card_id ?? '')))

  const doc = readBoard(agency)
  if (!doc) throw new Error('The board file is missing.')
  if (call.name === 'board_add_card') {
    const title = String(input.title ?? '').trim()
    if (!title) throw new Error('A card needs a title.')
    const colName = String(input.column ?? 'Planned')
    const column = doc.columns.find((c) => c.title.toLowerCase() === colName.toLowerCase()) ?? doc.columns[1] ?? doc.columns[0]
    const who = input.assignee ? findMember(agency, input.assignee) : null
    if (input.assignee && !who) throw new Error(`No one called "${String(input.assignee)}" is on the roster.`)
    const card: KanbanCard = { id: uid(), title, notes: String(input.notes ?? ''), labels: [], agency: agency.id, createdAt: Date.now(), log: [] }
    if (who) { card.assignee = who.id; card.agentId = who.id }
    if (input.parent_card) card.parentCard = String(input.parent_card)
    log(card, `Added by ${agent.name}${who ? `, assigned to ${who.name}` : ''}`)
    column.cards.push(card)
    writeBoard(agency, doc)
    return ok(`Added [${card.id}] "${title}" to ${column.title}${who ? ` for ${who.name}` : ''}.`)
  }
  const hit = findCard(doc, String(input.card_id ?? ''))
  if (!hit) throw new Error(`No card with id ${String(input.card_id)}.`)
  if (call.name === 'board_move_card') {
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
