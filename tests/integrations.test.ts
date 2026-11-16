import { test } from 'node:test'
import assert from 'node:assert/strict'
import { saveIntegration } from '../src/main/integrations'

// 17 Nov 2026: the chat's "Connect Playwright" card turns on a connector another team already added. It sends the
// saved id and new agents but no command line; the saved command must stay.
test('saving a stdio connector without a command line keeps its command', () => {
  const first = saveIntegration({ name: 'playwright', preset: '', transport: 'stdio', commandLine: 'npx -y @playwright/mcp@latest', env: '', agentIds: ['a1'] })
  const again = saveIntegration({ id: first.id, name: 'playwright', preset: '', transport: 'stdio', agentIds: ['a1', 'b2'] })
  assert.equal(again.command, 'npx')
  assert.deepEqual(again.args, ['-y', '@playwright/mcp@latest'])
  assert.deepEqual(again.agentIds, ['a1', 'b2'])
})

test('a new stdio connector still needs a command', () => {
  assert.throws(() => saveIntegration({ name: 'other', preset: '', transport: 'stdio', agentIds: [] }), /Enter the command/)
})

import { ensureBasicConnectors } from '../src/main/integrations'
import * as dbStub from './stubs/db'
// 17 Nov 2026 (owner): the browser is added for every worker without asking, once per worker.
test('basic connectors: every adapter worker gets Playwright once; a worker switched off stays off', () => {
  const store = dbStub.store as unknown as { agents: Record<string, unknown>[] }
  const before = store.agents.length
  store.agents.push(
    { id: 'w1', kind: 'agent', engine: 'claude-code', agency: 'ag', isMascot: false },
    { id: 'lead', kind: 'agent', engine: 'builtin', agency: 'ag', isMascot: false },
    { id: 'w2', kind: 'agent', engine: 'codex', agency: 'ag', isMascot: false }
  )
  try {
    ensureBasicConnectors()
    const pw = () => dbStub.listMcpServers().find((s: { name: string }) => s.name === 'playwright')
    assert.ok(pw().agentIds.includes('w1') && pw().agentIds.includes('w2') && !pw().agentIds.includes('lead'))
    dbStub.setMcpAgents(pw().id, pw().agentIds.filter((id: string) => id !== 'w2'))
    assert.deepEqual(ensureBasicConnectors(), [])
    assert.ok(!pw().agentIds.includes('w2'))
    store.agents.push({ id: 'w3', kind: 'agent', engine: 'gemini-cli', agency: 'ag', isMascot: false })
    ensureBasicConnectors()
    assert.ok(pw().agentIds.includes('w3') && !pw().agentIds.includes('w2'))
  } finally { store.agents.splice(before) }
})
