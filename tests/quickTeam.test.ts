// Quick teams (Design, 18 Nov 2026): the boss's message goes straight to the worker as a card, old planned cards
// don't run, and a blocked card doesn't start a Lead review loop.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Agency, Agent, KanbanDoc } from '@shared/types'
import { quickWorkerOf } from '../src/shared/agencies'
import { handToWorker, initCards, QUICK_LOG } from '../src/main/cards'
import { store } from './stubs/db'

const extra = store as unknown as { agencies: unknown[]; sessions: unknown[]; messages: { sessionId: string; role: string; content: string; createdAt: number }[] }

function setup(): { agency: Agency; dir: string; read: () => KanbanDoc; runs: { sessionId: string; text: string; finish: (reply: string) => void }[] } {
  const dir = mkdtempSync(join(tmpdir(), 'tyslin-quick-'))
  mkdirSync(join(dir, 'boards'))
  const old = { id: 'old', title: 'Old card', notes: 'from an older plan', labels: [], createdAt: 1, assignee: 'remy', log: [] }
  writeFileSync(join(dir, 'boards', 'D.board.json'), JSON.stringify({ columns: [{ title: 'Inbox', cards: [] }, { title: 'Planned', cards: [old] }, { title: 'In progress', cards: [] }, { title: 'Review', cards: [] }, { title: 'Done', cards: [] }] }))
  store.projects = [{ id: 'p1', name: 'D', folder: dir }]
  store.agents = [
    { id: 'iris', name: 'Iris (Lead)', agency: 'd1', kind: 'agent', engine: 'builtin', createdAt: 1 },
    { id: 'remy', name: 'Remy (Designer)', agency: 'd1', kind: 'agent', engine: 'claude-code', createdAt: 2 }
  ] as unknown as Agent[]
  const agency = { id: 'd1', name: 'D', projectId: 'p1', boardPath: 'boards/D.board.json', leadId: 'iris', templateId: 'design', autoRun: true, paused: false, goal: '', budget: null, spent: 0 } as unknown as Agency
  extra.agencies = [agency]; extra.sessions = []; extra.messages = []
  const runs: { sessionId: string; text: string; finish: (reply: string) => void }[] = []
  initCards({
    startRun: (sessionId, text) => {
      let done!: (r: { ok: boolean }) => void
      const p = new Promise<{ ok: boolean }>((r) => { done = r })
      runs.push({ sessionId, text, finish: (reply) => { extra.messages.push({ sessionId, role: 'assistant', content: reply, createdAt: Date.now() }); done({ ok: true }) } })
      return { runId: `r${runs.length}`, done: p }
    },
    runTask: () => '',
    checkReady: () => undefined
  })
  return { agency, dir, runs, read: () => JSON.parse(readFileSync(join(dir, 'boards', 'D.board.json'), 'utf8')) as KanbanDoc }
}
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 20))
const cardsIn = (doc: KanbanDoc, col: string): string[] => doc.columns.find((c) => c.title === col)!.cards.map((c) => c.title)

test('quickWorkerOf: the first non-Lead member of a quick team only', () => {
  const agents = [{ id: 'iris', agency: 'd1', createdAt: 1 }, { id: 'remy', agency: 'd1', createdAt: 2 }, { id: 'x', agency: 'other', createdAt: 0 }]
  assert.equal(quickWorkerOf({ id: 'd1', leadId: 'iris', templateId: 'design' }, agents)?.id, 'remy')
  assert.equal(quickWorkerOf({ id: 'd1', leadId: 'iris', templateId: 'web-design' }, agents), null)
})

test('a message becomes the worker\'s card and runs at once; old cards and the Lead stay out', async () => {
  const t = setup()
  try {
    assert.equal(await handToWorker(t.agency, 'A square post\nwith a photo'), 'Remy (Designer)')
    assert.equal(t.runs.length, 1)
    assert.match(t.runs[0].text, /## A square post/)
    const card = t.read().columns.flatMap((c) => c.cards).find((c) => c.title === 'A square post')!
    assert.ok(card.log!.some((l) => l.text === QUICK_LOG))
    assert.deepEqual(cardsIn(t.read(), 'In progress'), ['A square post'])

    // A second message while Remy works waits, then runs; the old card never does.
    await handToWorker(t.agency, 'Make the headline bigger')
    assert.equal(t.runs.length, 1)
    t.runs[0].finish('Made design/post.html (1080 x 1080).\nOutcome: done')
    await tick()
    assert.equal(t.runs.length, 2)
    assert.match(t.runs[1].text, /Make the headline bigger/)
    t.runs[1].finish('I need the photo.\nOutcome: blocked: no photo')
    await tick()
    assert.equal(t.runs.length, 2, 'no Lead review and no old card after a blocked card')
    assert.deepEqual(cardsIn(t.read(), 'Done'), ['A square post'])
    assert.ok(cardsIn(t.read(), 'Planned').includes('Old card'))
  } finally { rmSync(t.dir, { recursive: true, force: true }) }
})
