// The card workflow fixes from the 16 Nov 2026 live QA: outcome lines, the Done gate, plan-ready briefs, digests that
// list open work, sent-back cards first, schedule times, edit paths and prices.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Agency, Agent, KanbanDoc } from '@shared/types'
import { OPEN_ON_BOARD, parseOutcome } from '../src/shared/cardOutcome'
import { isValidTime } from '../src/shared/schedule'
import { estimateCost } from '../src/shared/pricing'
import { boardHooks, moveCard, runBoardTool } from '../src/main/boardTools'
import { agentWritePath } from '../src/main/tools'
import { store } from './stubs/db'

test('outcome: the last Outcome line decides', () => {
  assert.deepEqual(parseOutcome('Wrote site/index.html.\n\nOutcome: done'), { kind: 'done' })
  assert.deepEqual(parseOutcome('…\n**Outcome: blocked:** I need the product facts from Jade'), { kind: 'blocked', why: 'I need the product facts from Jade' })
  assert.deepEqual(parseOutcome('Outcome: done with open issues: favicon 404; FAQ link 30 px wide'), { kind: 'issues', issues: 'favicon 404; FAQ link 30 px wide' })
  assert.deepEqual(parseOutcome('Use "Outcome: done" when…\nreport\nOutcome: blocked: no brief'), { kind: 'blocked', why: 'no brief' })
  assert.equal(parseOutcome('No status line here.'), null)
})

test('schedule: a task needs a real time', () => {
  for (const t of ['09:00', '9:30', '23:59', '00:00']) assert.equal(isValidTime(t), true, t)
  for (const t of ['', ' ', '24:00', '9', '12:60', 'nine']) assert.equal(isValidTime(t), false, t)
})

test('pricing: newer OpenAI models have list prices, unknown ones stay unknown', () => {
  const u = { inputTokens: 1_000_000, outputTokens: 1_000_000 }
  assert.equal(estimateCost('openai', 'gpt-5.4-mini', u), 5.25)
  assert.equal(estimateCost('openai', 'gpt-5.4', u), 17.5)
  assert.equal(estimateCost('openai', 'gpt-5.5', u), 35)
  assert.equal(estimateCost('openai', 'gpt-5.5-pro', u), 210)
  assert.equal(estimateCost('openai', 'gpt-5-mini', u), 2.25)
  assert.equal(estimateCost('openai', 'gpt-7-unknown', u), null)
})

// A team with a board file on disk, for the Lead's board tools.
function team(cards: KanbanDoc['columns']): { agency: Agency; lead: Agent; dir: string; read: () => KanbanDoc } {
  const dir = mkdtempSync(join(tmpdir(), 'tyslin-board-'))
  mkdirSync(join(dir, 'boards'))
  writeFileSync(join(dir, 'boards', 'T.board.json'), JSON.stringify({ columns: cards }))
  store.projects = [{ id: 'p1', name: 'T', folder: dir }]
  const lead = { id: 'lead', name: 'Jade (Lead)', agency: 'a1', engine: 'builtin', model: 'm', skills: [], description: '' } as unknown as Agent
  const finn = { id: 'finn', name: 'Finn (Front-end)', agency: 'a1', engine: 'codex', model: '', skills: [], description: '' } as unknown as Agent
  store.agents = [lead, finn]
  const agency = { id: 'a1', name: 'T', projectId: 'p1', boardPath: 'boards/T.board.json', leadId: 'lead', autoRun: false, goal: '', budget: null, spent: 0 } as unknown as Agency
  return { agency, lead, dir, read: () => JSON.parse(readFileSync(join(dir, 'boards', 'T.board.json'), 'utf8')) as KanbanDoc }
}
const card = (id: string, extra: Record<string, unknown> = {}): KanbanDoc['columns'][number]['cards'][number] => ({ id, title: id, notes: '', labels: [], createdAt: 1, ...extra })
const cols = (planned: unknown[], review: unknown[], done: unknown[] = []): KanbanDoc['columns'] =>
  [{ title: 'Inbox', cards: [] }, { title: 'Planned', cards: planned }, { title: 'In progress', cards: [] }, { title: 'Review', cards: review }, { title: 'Done', cards: done }] as KanbanDoc['columns']

test('board: Done refuses running, failed and open-issue cards unless the boss accepted the issues', async () => {
  const t = team(cols([], [card('qa', { status: 'done', openIssues: 'skip link hidden' }), card('build', { status: 'failed', log: [{ at: 1, text: 'Finn failed: blocked: no copy' }] })]))
  try {
    const move = (id: string, extra = {}): Promise<{ isError?: boolean; content: string }> => runBoardTool({ id: 'x', name: 'board_move_card', input: { card_id: id, column: 'Done', ...extra } }, t.lead, t.agency)
    const r1 = await move('qa')
    assert.equal(r1.isError, true); assert.match(r1.content, /open issues: skip link hidden/)
    const r2 = await move('build')
    assert.equal(r2.isError, true); assert.match(r2.content, /no copy/)
    const r3 = await move('qa', { accept_open_issues: true })
    assert.equal(r3.isError, false)
    const done = t.read().columns.find((c) => c.title === 'Done')!.cards
    assert.deepEqual(done.map((c) => c.id), ['qa'])
    assert.equal(done[0].openIssues, undefined)
  } finally { rmSync(t.dir, { recursive: true, force: true }) }
})

test('board: a "plan is ready" brief needs planned cards; a digest lists what is still open', async () => {
  const t = team(cols([], [card('qa', { status: 'done', openIssues: 'favicon 404' })]))
  const sent: string[] = []
  boardHooks.messageBoss = async (_a, _f, kind, text) => { sent.push(`${kind}:${text}`); return 'Sent.' }
  try {
    const brief = await runBoardTool({ id: 'x', name: 'message_boss', input: { kind: 'brief', text: 'The plan is ready.' } }, t.lead, t.agency)
    assert.equal(brief.isError, true)
    assert.equal(sent.length, 0)
    await runBoardTool({ id: 'y', name: 'message_boss', input: { kind: 'digest', text: 'All done.' } }, t.lead, t.agency)
    assert.equal(sent.length, 1)
    assert.ok(sent[0].includes(OPEN_ON_BOARD))
    assert.match(sent[0], /"qa" has open issues: favicon 404/)
  } finally { rmSync(t.dir, { recursive: true, force: true }) }
})

test('board: a sent-back card goes to the front of Planned and runs again', () => {
  const doc = { columns: cols([card('next')], [card('copy', { status: 'failed' })]) } as KanbanDoc
  assert.equal(moveCard(doc, 'copy', 'Planned'), true)
  const planned = doc.columns.find((c) => c.title === 'Planned')!.cards
  assert.deepEqual(planned.map((c) => c.id), ['copy', 'next'])
  assert.equal(planned[0].status, undefined)
})

test('edits: adapters may write inside the folder only, never the board', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tyslin-edit-'))
  try {
    assert.equal(agentWritePath(dir, join(dir, 'site', 'index.html')), join('site', 'index.html'))
    assert.throws(() => agentWritePath(dir, join(dir, 'boards', 'T.board.json')), /board/)
    assert.throws(() => agentWritePath(dir, '/etc/passwd'), /outside/)
    assert.throws(() => agentWritePath(dir, join(dir, '.git', 'config')), /\.git/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

import { isTaskChat } from '../src/shared/taskChat'
// 17 Nov 2026: a Lead's own card run split its task, hiding questions, reviews and the Plan card.
test('only tasks the boss started end a task window', () => {
  assert.equal(isTaskChat({ title: 'Redesign the Reves.ai home page' }), true)
  assert.equal(isTaskChat({ title: 'Card: Start card: Page brief' }), false)
  assert.equal(isTaskChat({ title: 'Your answers' }), false)
})
