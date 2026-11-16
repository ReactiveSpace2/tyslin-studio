// Installed adapters whose saved Node was removed get a Node again, even when no update is due.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { checkAdapters, installAdapter, managedNode, managedProgram } from '../src/main/adapterManager'
import { which } from '../src/main/engines'

const base = mkdtempSync(join(tmpdir(), 'tyslin-adapters-'))
process.env.TYSLIN_TEST_USERDATA = base
const managed = join(base, 'adapters', 'managed')
const realFetch = globalThis.fetch
test.after(() => { globalThis.fetch = realFetch; rmSync(base, { recursive: true, force: true }) })

/** The registry answers with these versions; anything else (nodejs.org) fails, so nothing is downloaded. */
function fakeRegistry(versions: Record<string, string> | null): void {
  globalThis.fetch = (async (url: string | URL) => {
    const pkg = decodeURIComponent(String(url).replace('https://registry.npmjs.org/', '').replace(/\/latest$/, ''))
    if (versions && versions[pkg]) return new Response(JSON.stringify({ version: versions[pkg] }))
    throw new Error('offline')
  }) as typeof fetch
}

const PKGS = { 'claude-code': '@agentclientprotocol/claude-agent-acp', codex: '@agentclientprotocol/codex-acp', 'gemini-cli': '@google/gemini-cli' }

function installed(nodePath: string): void {
  rmSync(managed, { recursive: true, force: true })
  const adapters: Record<string, unknown> = {}
  for (const id of Object.keys(PKGS)) {
    const dir = join(managed, id, '1.0.0')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'bin.js'), '')
    adapters[id] = { version: '1.0.0', dir, script: join(dir, 'bin.js') }
  }
  writeFileSync(join(managed, 'state.json'), JSON.stringify({ node: nodePath, adapters }))
}

const sysNode = which('node')
const sysOk = !!sysNode && Number(/^v(\d+)/.exec(spawnSync(sysNode, ['-v'], { encoding: 'utf8' }).stdout ?? '')?.[1] ?? 0) >= 22

test('a removed saved Node is replaced when every adapter is current (16 Nov 2026 QA)', { skip: !sysOk && 'needs Node 22+ on PATH' }, async () => {
  installed(join(base, 'gone', 'bin', 'node'))
  fakeRegistry(Object.fromEntries(Object.values(PKGS).map((p) => [p, '1.0.0'])))
  assert.equal(managedProgram('codex'), null)
  await checkAdapters()
  assert.ok(managedNode(), 'a Node is saved again')
  assert.ok(existsSync(JSON.parse(readFileSync(join(managed, 'state.json'), 'utf8')).node))
  assert.ok(managedProgram('codex'))
  assert.deepEqual(await installAdapter('codex'), { ok: true })
})

test('also when npm cannot be reached', { skip: !sysOk && 'needs Node 22+ on PATH' }, async () => {
  installed(join(base, 'gone', 'bin', 'node'))
  fakeRegistry(null)
  await checkAdapters()
  assert.ok(managedProgram('gemini-cli'))
})

test('Install never fails without saying why', async () => {
  rmSync(managed, { recursive: true, force: true })
  fakeRegistry(null)
  const r = await installAdapter('codex')
  assert.equal(r.ok, false)
  assert.ok(r.error && r.error.length > 0, 'has an explanation')
})
