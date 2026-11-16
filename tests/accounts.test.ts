// An explicit browser sign-in runs in account mode even when the cached status says "not signed in".
// Authentication is mocked (tests/stubs/acp.ts): no adapter process, no browser, no real login.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { signInAccount } from '../src/main/accounts'
import { engineLaunch, launchEnv, signedIn } from '../src/main/engines'
import { secrets } from './stubs/secrets'
import { settings } from './stubs/db'
import type { AcpLaunch } from './stubs/acp'

const base = mkdtempSync(join(tmpdir(), 'tyslin-accounts-'))
const userData = join(base, 'userData')
const codexHome = join(base, 'home', '.codex')
process.env.TYSLIN_TEST_USERDATA = userData
process.env.CODEX_HOME = codexHome
for (const v of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']) delete process.env[v]

// A managed Codex "install": state.json pointing at this Node and a placeholder script.
const managed = join(userData, 'adapters', 'managed')
mkdirSync(join(managed, 'codex', '1.0.0'), { recursive: true })
const script = join(managed, 'codex', '1.0.0', 'codex-acp.js')
writeFileSync(script, '')
writeFileSync(join(managed, 'state.json'), JSON.stringify({ node: process.execPath, adapters: { codex: { version: '1.0.0', dir: join(managed, 'codex', '1.0.0'), script } } }))

const g = globalThis as unknown as { __tyslinAuthenticate?: (l: AcpLaunch, m: string) => void }
const fakeLogin = (home: string): void => {
  const claims = Buffer.from(JSON.stringify({ email: 'person@example.com' })).toString('base64url')
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { id_token: `x.${claims}.y` } }))
}

test.after(() => rmSync(base, { recursive: true, force: true }))

test('with a cached "not signed in" and a saved key, normal runs use the key', () => {
  secrets.set('openai', 'sk-test')
  signedIn.set('codex', false)
  const env = launchEnv('codex')
  assert.equal(env.OPENAI_API_KEY, 'sk-test')
  assert.notEqual(env.CODEX_HOME, codexHome)
  assert.equal(engineLaunch('codex', base).authMethodId, 'api-key')
})

test('an account launch has no key variables, no key authenticate and the inherited CODEX_HOME', () => {
  signedIn.set('codex', false)
  const launch = engineLaunch('codex', base, undefined, 'account')
  assert.equal(launch.env?.OPENAI_API_KEY, undefined)
  assert.equal(launch.env?.CODEX_API_KEY, undefined)
  assert.equal(launch.env?.CODEX_HOME, codexHome)
  assert.equal(launch.authMethodId, undefined)
  secrets.set('anthropic', 'sk-ant-test')
  signedIn.set('claude-code', false)
  assert.equal(launchEnv('claude-code', 'account').ANTHROPIC_API_KEY, undefined)
})

test('Codex sign-in overrides the cached status and lands where the status check looks (16 Nov 2026 QA)', async () => {
  secrets.set('openai', 'sk-test')
  signedIn.set('codex', false)
  settings.delete('engine:codex:auth')
  let seen: { launch: AcpLaunch; method: string } | null = null
  g.__tyslinAuthenticate = (launch, method) => {
    seen = { launch, method }
    // The adapter would write its login into the CODEX_HOME it was given.
    fakeLogin(launch.env?.CODEX_HOME ?? '')
  }
  const status = await signInAccount('codex', 'test', () => undefined)
  assert.ok(seen)
  const { launch, method } = seen as { launch: AcpLaunch; method: string }
  assert.equal(method, 'chat-gpt')
  assert.equal(launch.env?.OPENAI_API_KEY, undefined)
  assert.equal(launch.env?.CODEX_HOME, codexHome)
  assert.equal(launch.authMethodId, undefined)
  assert.equal(status.signedIn, true)
  assert.equal(signedIn.get('codex'), true)
})
