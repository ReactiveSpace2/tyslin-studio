import { spawn, type ChildProcess } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { getSetting, setSetting } from './db'
import { authenticateAcp } from './acp'
import { engineLaunch, engineProgram, engineStatus, launchEnv, usesAccount } from './engines'
import type { AccountEngine, AccountStatus } from '@shared/types'

/**
 * Settings → Models → "Or sign in with your account". Anthropic, OpenAI and Google don't let other apps use a
 * subscription sign-in, so Tyslin never asks for it or stores it: each provider's own adapter signs in and keeps
 * its own login (Claude Code in ~/.claude, Codex in ~/.codex, Gemini CLI in ~/.gemini). Tyslin only starts the
 * adapter's sign-in, reads whether it's signed in, and, in account mode, launches the adapter without API keys.
 */
export const ACCOUNT_ENGINES: AccountEngine[] = ['claude-code', 'codex', 'gemini-cli']
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000

const running = new Map<AccountEngine, { cancel: () => void }>()

const readJson = (file: string): Record<string, unknown> | null => {
  try { return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown> } catch { return null }
}
const jwtClaims = (token: unknown): Record<string, unknown> => {
  try { return JSON.parse(Buffer.from(String(token).split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<string, unknown> } catch { return {} }
}

/** Claude Code reports its own login: `claude-agent-acp --cli auth status --json`. */
function claudeStatus(path: string, args: string[]): Promise<{ signedIn: boolean; email?: string; plan?: string }> {
  return new Promise((resolve) => {
    let out = ''
    const child = spawn(path, [...args, '--cli', 'auth', 'status', '--json'], { stdio: ['ignore', 'pipe', 'ignore'], env: launchEnv('claude-code'), windowsHide: true,
      shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(path) })
    const timer = setTimeout(() => child.kill(), 10_000)
    child.stdout.on('data', (b: Buffer) => { out += b.toString('utf8') })
    child.once('error', () => { clearTimeout(timer); resolve({ signedIn: false }) })
    child.once('exit', () => {
      clearTimeout(timer)
      try {
        const s = JSON.parse(out.slice(out.indexOf('{'))) as { loggedIn?: boolean; authMethod?: string; email?: string; subscriptionType?: string }
        // A key in the environment also counts as "logged in"; only a claude.ai login is the account.
        resolve({ signedIn: !!s.loggedIn && s.authMethod === 'claude.ai', email: s.email || undefined, plan: s.subscriptionType || undefined })
      } catch { resolve({ signedIn: false }) }
    })
  })
}

/** Codex keeps its login in $CODEX_HOME/auth.json; a ChatGPT login has auth_mode "chatgpt" and an ID token. */
function codexStatus(): { signedIn: boolean; email?: string; plan?: string } {
  const auth = readJson(join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'auth.json'))
  const tokens = auth?.tokens as { id_token?: string } | undefined
  if (!auth || !tokens?.id_token || (auth.auth_mode && auth.auth_mode !== 'chatgpt')) return { signedIn: false }
  const claims = jwtClaims(tokens.id_token)
  const plan = (claims['https://api.openai.com/auth'] as { chatgpt_plan_type?: string } | undefined)?.chatgpt_plan_type
  return { signedIn: true, email: typeof claims.email === 'string' ? claims.email : undefined, plan }
}

/** Gemini CLI keeps a Google login in ~/.gemini/oauth_creds.json and the active account in google_accounts.json. */
function geminiStatus(): { signedIn: boolean; email?: string } {
  const dir = join(process.env.GEMINI_CLI_HOME || homedir(), '.gemini')
  if (!existsSync(join(dir, 'oauth_creds.json'))) return { signedIn: false }
  const active = readJson(join(dir, 'google_accounts.json'))?.active
  return { signedIn: true, email: typeof active === 'string' && active ? active : undefined }
}

export async function accountStatus(engine: AccountEngine): Promise<AccountStatus> {
  const program = engineProgram(engine)
  const base = { engine, installed: !!program, useAccount: usesAccount(engine) }
  if (engine === 'claude-code') return { ...base, ...(program ? await claudeStatus(program.path, program.args) : { signedIn: false }) }
  if (engine === 'codex') return { ...base, ...codexStatus() }
  return { ...base, ...geminiStatus() }
}

export const accountStatuses = (): Promise<AccountStatus[]> => Promise.all(ACCOUNT_ENGINES.map(accountStatus))

export function setUseAccount(engine: AccountEngine, on: boolean): Promise<AccountStatus> {
  setSetting(`engine:${engine}:auth`, on ? 'account' : 'key')
  return accountStatus(engine)
}

export function cancelAccountSignIn(engine: AccountEngine): void {
  running.get(engine)?.cancel()
}

/**
 * Starts the adapter's own browser sign-in and waits for it. Claude Code: `--cli auth login --claudeai` (its own
 * loopback sign-in); `onUrl` gets the sign-in address it prints. Codex and Gemini CLI: the ACP `authenticate`
 * request ("chat-gpt", "oauth-personal"), which opens the browser from the adapter. Afterwards account mode is on.
 */
export async function signInAccount(engine: AccountEngine, clientVersion: string, onUrl: (url: string) => void): Promise<AccountStatus> {
  cancelAccountSignIn(engine)
  const program = engineProgram(engine)
  if (!program) throw new Error(`Install ${engineStatus(engine).name} first.`)
  // Sign in without keys in the environment, so the adapter doesn't settle for a key.
  setSetting(`engine:${engine}:auth`, 'account')
  try {
    if (engine === 'claude-code') await claudeLogin(program.path, program.args, onUrl)
    else {
      const ctrl = new AbortController()
      running.set(engine, { cancel: () => ctrl.abort() })
      await authenticateAcp(engineStatus(engine).name, engineLaunch(engine, homedir()), engine === 'codex' ? 'chat-gpt' : 'oauth-personal', clientVersion, ctrl.signal, SIGN_IN_TIMEOUT_MS)
    }
  } catch (err) {
    if (getSetting(`engine:${engine}:auth`) === 'account' && !(await accountStatus(engine)).signedIn) setSetting(`engine:${engine}:auth`, '')
    throw err
  } finally {
    running.delete(engine)
  }
  const status = await accountStatus(engine)
  if (!status.signedIn) throw new Error('The sign-in did not finish. Try again.')
  return status
}

function claudeLogin(path: string, args: string[], onUrl: (url: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let tail = ''
    let sentUrl = false
    const child: ChildProcess = spawn(path, [...args, '--cli', 'auth', 'login', '--claudeai'], {
      stdio: ['ignore', 'pipe', 'pipe'], env: launchEnv('claude-code'), windowsHide: true, cwd: homedir(),
      shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(path)
    })
    const read = (b: Buffer): void => {
      tail = (tail + b.toString('utf8')).slice(-4000)
      const url = !sentUrl && tail.match(/https:\/\/[^\s"'<>]*(oauth|authorize|login)[^\s"'<>]*/i)?.[0]
      if (url) { sentUrl = true; onUrl(url) }
    }
    child.stdout?.on('data', read)
    child.stderr?.on('data', read)
    const timer = setTimeout(() => { child.kill(); reject(new Error('Sign-in timed out. Try again.')) }, SIGN_IN_TIMEOUT_MS)
    running.set('claude-code', { cancel: () => { child.kill(); reject(new Error('Sign-in cancelled.')) } })
    child.once('error', (err) => { clearTimeout(timer); reject(new Error(`Could not start Claude Code: ${err.message}`)) })
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`Claude Code sign-in did not finish.${tail.trim() ? '\n' + tail.trim().split('\n').slice(-3).join('\n') : ''}`))
    })
  })
}
