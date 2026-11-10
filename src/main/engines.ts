import { app } from 'electron'
import { spawn, spawnSync, type ChildProcess } from 'child_process'
import { accessSync, constants, existsSync, mkdirSync, statSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { delimiter, isAbsolute, join } from 'path'
import type { Agent, EngineInstall, EngineStatus, ExternalEngineId } from '@shared/types'
import { ENGINE_NAMES } from '@shared/engines'
import { getSetting, setSetting } from './db'
import { getSecret as getKey } from './secrets'
import type { AcpLaunch } from './acp'
import { usesOpenRouter } from '@shared/openrouter'
import { openRouterLaunchEnv } from './openrouterLaunch'

type EngineDef = Omit<EngineStatus, 'command' | 'resolvedPath' | 'install'>

interface InstallRecipe {
  posix: string
  windows: string
  source: string
  nextStep: string
}

/**
 * Official installers, copied from each project's own install docs (3 Nov 2026). Each runs in its
 * no-prompt mode, because the app has no terminal to answer questions in. Change these only from
 * the projects' docs; never point them anywhere else.
 */
const INSTALLERS: Partial<Record<ExternalEngineId, InstallRecipe>> = {
  goose: {
    posix: 'curl -fsSL https://github.com/aaif-goose/goose/releases/download/stable/download_cli.sh | CONFIGURE=false bash',
    windows: 'Invoke-WebRequest -Uri "https://raw.githubusercontent.com/aaif-goose/goose/main/download_cli.ps1" -OutFile "$env:TEMP\\download_cli.ps1"; & "$env:TEMP\\download_cli.ps1"',
    source: 'github.com/aaif-goose/goose',
    nextStep: 'Open a terminal and run "goose configure" once to choose its model provider.'
  },
  hermes: {
    posix: 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --non-interactive',
    windows: '& ([scriptblock]::Create((irm https://hermes-agent.nousresearch.com/install.ps1))) -NonInteractive',
    source: 'hermes-agent.nousresearch.com',
    nextStep: 'Follow the Hermes setup guide to choose a model and add its key, then test the connection. On a Mac, Hermes supports Apple silicon only.'
  },
  // The three agency adapters install from npm (the ACP registry lists these packages, github.com/agentclientprotocol/registry).
  'claude-code': {
    posix: 'npm install -g @agentclientprotocol/claude-agent-acp',
    windows: 'npm install -g @agentclientprotocol/claude-agent-acp',
    source: 'github.com/agentclientprotocol/claude-agent-acp',
    nextStep: 'Sign in once by running "claude" in a terminal, or add your Claude key in Settings → Models: Tyslin passes it to the agent.'
  },
  'gemini-cli': {
    posix: 'npm install -g @google/gemini-cli',
    windows: 'npm install -g @google/gemini-cli',
    source: 'github.com/google-gemini/gemini-cli',
    nextStep: 'Sign in once by running "gemini" in a terminal, or add your Gemini key in Settings → Models: Tyslin passes it to the agent.'
  },
  codex: {
    posix: 'npm install -g @agentclientprotocol/codex-acp',
    windows: 'npm install -g @agentclientprotocol/codex-acp',
    source: 'github.com/agentclientprotocol/codex-acp',
    nextStep: 'Add your OpenAI key in Settings → Models (Tyslin passes it to the agent), or sign in with ChatGPT when the agent asks.'
  },
  openclaw: {
    posix: 'curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard',
    windows: '& ([scriptblock]::Create((iwr -useb https://openclaw.ai/install.ps1))) -NoOnboard',
    source: 'openclaw.ai',
    nextStep: 'Open a terminal and run "openclaw onboard --install-daemon" to set up and start the OpenClaw Gateway, which Tyslin connects through.'
  }
}

function installFor(id: ExternalEngineId): EngineInstall | null {
  const r = INSTALLERS[id]
  if (!r) return null
  return { command: process.platform === 'win32' ? r.windows : r.posix, source: r.source, nextStep: r.nextStep }
}

/** External agents Tyslin can drive over ACP. Users install them; Tyslin only starts them. */
export const ENGINES: EngineDef[] = [
  {
    id: 'claude-code', name: ENGINE_NAMES['claude-code'], defaultCommand: 'claude-agent-acp',
    description: 'Anthropic\'s Claude Code, through the Claude Agent ACP adapter.',
    docsUrl: 'https://github.com/agentclientprotocol/claude-agent-acp', note: 'Uses your Claude sign-in, or the Claude key from Settings → Models.'
  },
  {
    id: 'gemini-cli', name: ENGINE_NAMES['gemini-cli'], defaultCommand: 'gemini --acp',
    description: 'Google\'s open-source agent for the terminal, in its ACP mode.',
    docsUrl: 'https://github.com/google-gemini/gemini-cli', note: 'Uses your Google sign-in, or the Gemini key from Settings → Models.'
  },
  {
    id: 'codex', name: ENGINE_NAMES.codex, defaultCommand: 'codex-acp',
    description: 'OpenAI\'s Codex, through its ACP adapter.',
    docsUrl: 'https://github.com/agentclientprotocol/codex-acp', note: 'Uses the OpenAI key from Settings → Models, or a ChatGPT sign-in.'
  },
  {
    id: 'goose', name: ENGINE_NAMES.goose, defaultCommand: 'goose acp',
    description: 'Open-source agent from Block, now under the Agentic AI Foundation.',
    docsUrl: 'https://block.github.io/goose/', note: 'Uses the provider and model set up in Goose.'
  },
  {
    id: 'hermes', name: ENGINE_NAMES.hermes, defaultCommand: 'hermes acp',
    description: 'Open-source agent from Nous Research.',
    docsUrl: 'https://hermes-agent.nousresearch.com/docs/user-guide/features/acp',
    note: 'In this mode Hermes uses its file and terminal tools only.'
  },
  {
    id: 'zeroclaw', name: ENGINE_NAMES.zeroclaw, defaultCommand: 'zeroclaw acp',
    description: 'Lightweight agent runtime written in Rust.',
    docsUrl: 'https://docs.zeroclawlabs.ai/master/en/channels/acp.html',
    note: 'Install from zeroclaw-labs/zeroclaw; beware of look-alike forks.'
  },
  {
    id: 'openclaw', name: ENGINE_NAMES.openclaw, defaultCommand: 'openclaw acp',
    description: 'Personal agent with a gateway and many channels.',
    docsUrl: 'https://docs.openclaw.ai/cli/acp',
    note: 'Needs a running OpenClaw Gateway. Some approval prompts may not reach Tyslin.'
  },
  {
    id: 'custom', name: ENGINE_NAMES.custom, defaultCommand: '',
    description: 'Any program that speaks the Agent Client Protocol over stdio.',
    docsUrl: 'https://agentclientprotocol.com', note: 'Enter the full command, for example: my-agent --acp'
  }
]

/** GUI apps often start with a short PATH (notably on macOS), so look in the usual install folders too. */
export function searchDirs(): string[] {
  const home = homedir()
  const extra = process.platform === 'win32'
    ? [join(home, 'AppData', 'Roaming', 'npm'), join(home, '.cargo', 'bin'), join(home, '.local', 'bin')]
    : [join(home, '.local', 'bin'), join(home, '.cargo', 'bin'), join(home, 'bin'), join(home, '.npm-global', 'bin'), '/usr/local/bin', '/opt/homebrew/bin', '/usr/bin']
  return [...new Set([...(process.env.PATH ?? '').split(delimiter).filter(Boolean), ...extra])]
}

function isRunnable(file: string): boolean {
  try {
    if (!statSync(file).isFile()) return false
    if (process.platform !== 'win32') accessSync(file, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export function which(program: string): string | null {
  if (isAbsolute(program)) return isRunnable(program) ? program : null
  const exts = process.platform === 'win32' ? ['', ...(process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';').map((e) => e.toLowerCase())] : ['']
  for (const dir of searchDirs()) {
    for (const ext of exts) {
      const file = join(dir, program + ext)
      if (isRunnable(file)) return file
    }
  }
  return null
}

/** Splits a command line on spaces, honouring "double" and 'single' quotes. */
export function splitCommand(line: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3])
  return out
}

function def(id: ExternalEngineId): EngineDef {
  const d = ENGINES.find((e) => e.id === id)
  if (!d) throw new Error(`Unknown engine ${id}`)
  return d
}

function commandLine(id: ExternalEngineId): string {
  return (getSetting(`engine:${id}:command`) ?? '').trim() || def(id).defaultCommand
}

export function engineStatus(id: ExternalEngineId): EngineStatus {
  const [program] = splitCommand(commandLine(id))
  return {
    ...def(id),
    command: (getSetting(`engine:${id}:command`) ?? '').trim(),
    resolvedPath: program ? which(program) : null,
    install: installFor(id)
  }
}

export function listEngines(): EngineStatus[] {
  return ENGINES.map((e) => engineStatus(e.id))
}

export function setEngineCommand(id: ExternalEngineId, command: string): EngineStatus {
  def(id)
  setSetting(`engine:${id}:command`, command.trim())
  return engineStatus(id)
}

// ---- Hermes profiles ---------------------------------------------------------------------------------

/** Hermes keeps one persona, memory and config per profile, so every Tyslin agent on Hermes gets its own. */
export const hermesProfileName = (agent: Pick<Agent, 'id'>): string => `tyslin${agent.id.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20)}`

const hermesHome = (): string => process.env.HERMES_HOME || join(homedir(), '.hermes')

/**
 * Makes sure the agent's Hermes profile exists and its SOUL.md carries the agent's instructions (rewritten on
 * every launch, so edits in Tyslin reach Hermes). Returns the profile name.
 */
export function ensureHermesProfile(agent: Agent, hermesPath: string): string {
  const name = hermesProfileName(agent)
  const dir = join(hermesHome(), 'profiles', name)
  if (!existsSync(dir)) {
    // --clone copies the active profile's config, .env (model keys) and skills, so the agent can answer at once.
    const r = spawnSync(hermesPath, ['profile', 'create', name, '--clone', '--no-alias', '--description', `Tyslin agent ${agent.name}`.slice(0, 80)],
      { encoding: 'utf8', timeout: 60_000, env: { ...process.env, PATH: searchDirs().join(delimiter) } })
    if (r.status !== 0 && !existsSync(dir)) throw new Error(`Hermes couldn't create the profile for ${agent.name}: ${(r.stderr || r.stdout || '').trim().slice(0, 300)}`)
  }
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SOUL.md'), `${agent.instructions.trim() || `You are ${agent.name}.`}

(This profile is managed by Tyslin Studio for the agent "${agent.name}". Edit the agent in Tyslin, not this file.)
`, 'utf8')
  return name
}

/** Deletes the agent's Hermes profile, if Hermes and the profile exist. Never throws. */
export function deleteHermesProfile(agent: Pick<Agent, 'id'>): void {
  const name = hermesProfileName(agent)
  if (!existsSync(join(hermesHome(), 'profiles', name))) return
  const [program] = splitCommand(commandLine('hermes'))
  const path = program ? which(program) : null
  if (!path) return
  try { spawnSync(path, ['profile', 'delete', name, '-y'], { timeout: 60_000, env: { ...process.env, PATH: searchDirs().join(delimiter) } }) } catch { /* left on disk */ }
}

/** Environment variables that hold each account adapter's API key. In account mode they're removed so the sign-in is used. */
export const ACCOUNT_KEY_VARS: Partial<Record<ExternalEngineId, string[]>> = {
  'claude-code': ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
  codex: ['OPENAI_API_KEY', 'CODEX_API_KEY'],
  'gemini-cli': ['GEMINI_API_KEY', 'GOOGLE_API_KEY']
}

/** Settings → Models → "Use my account": agents on this adapter run on the user's own sign-in, never a key. */
export const usesAccount = (id: ExternalEngineId): boolean => getSetting(`engine:${id}:auth`) === 'account'

/**
 * The ACP auth method that makes an adapter use the API key from its environment. Codex needs it: a saved
 * ChatGPT login in ~/.codex wins over OPENAI_API_KEY unless the client authenticates with "api-key" (which
 * Codex then records in its auth.json). Claude Code reads ANTHROPIC_API_KEY on its own and offers no key
 * method; Gemini CLI's "gemini-api-key" is left out until its side effects on ~/.gemini are checked.
 */
export const KEY_AUTH_METHODS: Partial<Record<ExternalEngineId, string>> = { codex: 'api-key' }

/** In key mode, with a key in the adapter's environment: the auth method to run after `initialize`. */
export function keyAuthMethod(id: ExternalEngineId, env: NodeJS.ProcessEnv): string | undefined {
  const method = KEY_AUTH_METHODS[id]
  if (!method || usesAccount(id)) return undefined
  return (ACCOUNT_KEY_VARS[id] ?? []).some((v) => !!env[v]) ? method : undefined
}

/** Keys the adapters read from the environment, passed from Settings → Models when set (not in account mode). */
function keyEnv(id: ExternalEngineId): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  if (usesAccount(id)) return env
  const keyFor = (name: string): string | null => { try { return getKey(name) } catch { return null } }
  if (id === 'claude-code') { const k = keyFor('anthropic'); if (k && !process.env.ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = k }
  if (id === 'gemini-cli') { const k = keyFor('gemini'); if (k && !process.env.GEMINI_API_KEY) env.GEMINI_API_KEY = k }
  if (id === 'codex') { const k = keyFor('openai'); if (k && !process.env.OPENAI_API_KEY && !process.env.CODEX_API_KEY) env.OPENAI_API_KEY = k }
  return env
}

/** How to start an engine in `cwd` for an agent. Throws a readable error when it isn't installed or configured. */
export function engineLaunch(id: ExternalEngineId, cwd: string, agent?: Agent): AcpLaunch {
  const d = def(id)
  const [program, ...args] = splitCommand(commandLine(id))
  if (!program) throw new Error(`Set the command for ${d.name} in Settings → Agent engines.`)
  const path = which(program)
  if (!path) throw new Error(`${d.name} isn't installed, or Tyslin can't find "${program}". Install it, or set its full path in Settings → Agent engines.`)
  // Hermes: the agent's own profile, before the subcommand ("hermes -p <profile> acp").
  const finalArgs = id === 'hermes' && agent ? ['-p', ensureHermesProfile(agent, path), ...args] : args
  // The child gets the same widened PATH, so it can find its own helpers, and the keys it reads from the environment.
  const env = launchEnv(id)
  // Gemini CLI refuses its "auto_edit" mode in a folder it hasn't been told to trust, and keeps that list in
  // ~/.gemini, which Tyslin never writes. For an agent the user set to write directly (and only then), this one
  // process trusts its own agency folder, the same as `gemini --skip-trust` (10 Nov 2026).
  if (id === 'gemini-cli' && agent?.writeMode === 'direct' && agent.tools.write) env.GEMINI_CLI_TRUST_WORKSPACE = 'true'
  // A Claude Code or Codex worker set to OpenRouter in the agent editor: its own key route and a Tyslin-owned home.
  if (agent && usesOpenRouter(agent)) {
    openRouterEnv(id, agent, env)
    return { command: path, args: finalArgs, cwd, env }
  }
  return { command: path, args: finalArgs, cwd, env, authMethodId: keyAuthMethod(id, env) }
}

/** Adapter state Tyslin owns (under userData/adapters); deleted by reset.ts with the other app data. */
export const ADAPTERS_DIR = 'adapters'

/**
 * Codex's home for key-mode runs: `authenticate api-key` makes Codex write the key into `<CODEX_HOME>/auth.json`,
 * which in the user's own ~/.codex would replace their ChatGPT login (and sign their `codex` CLI over to the key).
 * So key mode gets a Tyslin-owned home instead; account mode keeps the inherited CODEX_HOME (~/.codex).
 */
export function codexKeyHome(): string {
  const dir = join(app.getPath('userData'), ADAPTERS_DIR, 'codex-home')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  return dir
}

/** A Tyslin-owned folder under userData/adapters, private to this user (mode 700). */
function adapterDir(...parts: string[]): string {
  const dir = join(app.getPath('userData'), ADAPTERS_DIR, ...parts)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  return dir
}

/** OpenRouter for one Claude Code or Codex worker; the environment and Codex config come from openrouterLaunch.ts. */
function openRouterEnv(id: ExternalEngineId, agent: Agent, env: NodeJS.ProcessEnv): void {
  const key = (() => { try { return getKey('openrouter') } catch { return null } })()
  if (!key) throw new Error('No OpenRouter key yet. Add one in Settings → Models, or set this agent back to your own key.')
  if (id !== 'claude-code' && id !== 'codex') return
  const home = id === 'claude-code' ? adapterDir('claude-openrouter') : adapterDir('codex-openrouter', agent.id.replace(/[^a-zA-Z0-9-]/g, ''))
  openRouterLaunchEnv(id, agent.model.trim(), key, home, env)
}

/** The adapter's environment: widened PATH, saved keys, and in account mode no key variables at all. */
export function launchEnv(id: ExternalEngineId): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...keyEnv(id), PATH: searchDirs().join(delimiter) }
  if (usesAccount(id)) for (const v of ACCOUNT_KEY_VARS[id] ?? []) delete env[v]
  // Only when a key will actually be used (see keyAuthMethod); with no key at all Codex keeps its usual home.
  if (id === 'codex' && keyAuthMethod(id, env)) env.CODEX_HOME = codexKeyHome()
  return env
}

/** Absolute path of the engine's program and its default arguments, or null when it isn't installed. */
export function engineProgram(id: ExternalEngineId): { path: string; args: string[] } | null {
  const [program, ...args] = splitCommand(commandLine(id))
  const path = program ? which(program) : null
  return path ? { path, args } : null
}

const INSTALL_TIMEOUT_MS = 20 * 60 * 1000
const installing = new Map<ExternalEngineId, ChildProcess>()

/**
 * Runs an engine's official installer, streaming its output. stdin is closed so a prompt
 * fails fast instead of hanging. Resolves with whether it exited cleanly.
 */
export function runInstall(id: ExternalEngineId, onOutput: (text: string) => void): Promise<{ ok: boolean; error?: string }> {
  const recipe = installFor(id)
  if (!recipe) return Promise.resolve({ ok: false, error: `Tyslin can't install ${def(id).name}; follow its setup guide.` })
  if (installing.has(id)) return Promise.resolve({ ok: false, error: 'An install is already running.' })
  const win = process.platform === 'win32'
  // Only the download-script installers need curl; the npm ones need npm instead.
  if (!win && /\bcurl\b/.test(recipe.command) && !which('curl')) return Promise.resolve({ ok: false, error: 'curl is needed to download the installer. Install curl and try again.' })
  if (/^npm\b/.test(recipe.command) && !which('npm')) return Promise.resolve({ ok: false, error: 'npm is needed to install this adapter. Install Node.js (which includes npm) and try again.' })

  onOutput(`$ ${recipe.command}\n\n`)
  const child = win
    ? spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', recipe.command], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    : spawn('bash', ['-c', recipe.command], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PATH: searchDirs().join(delimiter) }, cwd: homedir() })
  installing.set(id, child)
  child.stdout?.on('data', (b: Buffer) => onOutput(b.toString('utf8')))
  child.stderr?.on('data', (b: Buffer) => onOutput(b.toString('utf8')))
  const timer = setTimeout(() => child.kill(), INSTALL_TIMEOUT_MS)

  return new Promise((done) => {
    child.once('error', (err) => {
      clearTimeout(timer)
      installing.delete(id)
      done({ ok: false, error: `Could not start the installer: ${err.message}` })
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      installing.delete(id)
      if (code === 0) done({ ok: true })
      else done({ ok: false, error: signal ? 'The install was stopped.' : `The installer exited with code ${code}. See the output above.` })
    })
  })
}

export function cancelInstall(id: ExternalEngineId): void {
  installing.get(id)?.kill()
}
