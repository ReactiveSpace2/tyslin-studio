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
