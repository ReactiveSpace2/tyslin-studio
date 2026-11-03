import { spawn, type ChildProcess } from 'child_process'
import { accessSync, constants, statSync } from 'fs'
import { homedir } from 'os'
import { delimiter, isAbsolute, join } from 'path'
import type { EngineInstall, EngineStatus, ExternalEngineId } from '@shared/types'
import { ENGINE_NAMES } from '@shared/engines'
import { getSetting, setSetting } from './db'
import type { AcpLaunch } from './acp'

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
function searchDirs(): string[] {
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

function which(program: string): string | null {
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

/** How to start an engine in `cwd`. Throws a readable error when it isn't installed or configured. */
export function engineLaunch(id: ExternalEngineId, cwd: string): AcpLaunch {
  const d = def(id)
  const [program, ...args] = splitCommand(commandLine(id))
  if (!program) throw new Error(`Set the command for ${d.name} in Settings → Agent engines.`)
  const path = which(program)
  if (!path) throw new Error(`${d.name} isn't installed, or Tyslin can't find "${program}". Install it, or set its full path in Settings → Agent engines.`)
  return {
    command: path,
    args,
    cwd,
    // The child gets the same widened PATH, so it can find its own helpers.
    env: { ...process.env, PATH: searchDirs().join(delimiter) }
  }
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
  if (!win && !which('curl')) return Promise.resolve({ ok: false, error: 'curl is needed to download the installer. Install curl and try again.' })

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
