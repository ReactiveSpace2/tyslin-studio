import { app } from 'electron'
import { spawn, spawnSync } from 'child_process'
import { createHash } from 'crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'fs'
import { delimiter, dirname, join } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { AccountEngine, AdapterState } from '@shared/types'
import { ENGINE_NAMES } from '@shared/engines'
import { searchDirs, which } from './engines'

/**
 * Tyslin keeps its own copy of the three agency adapters (14 Nov 2026, owner: "they should download automatically
 * and update themselves"). Each lives in <userData>/adapters/managed/<engine>/<version>/, installed from npm with
 * `npm install --prefix`, so it needs no sudo, never touches the user's global npm and survives nvm switches.
 * A new version goes into its own folder and only then becomes current, so a run already going keeps its files.
 * Node: the computer's own Node when it is 22 or newer (Claude Code's adapter needs 22), otherwise the current
 * Node.js LTS downloaded from nodejs.org and checked against its SHASUMS256.txt.
 */
export const MANAGED: Record<AccountEngine, { pkg: string; bin: string; args: string[] }> = {
  'claude-code': { pkg: '@agentclientprotocol/claude-agent-acp', bin: 'claude-agent-acp', args: [] },
  'gemini-cli': { pkg: '@google/gemini-cli', bin: 'gemini', args: ['--acp'] },
  codex: { pkg: '@agentclientprotocol/codex-acp', bin: 'codex-acp', args: [] }
}
const ORDER: AccountEngine[] = ['claude-code', 'codex', 'gemini-cli']
const MIN_NODE = 22
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const INSTALL_TIMEOUT_MS = 15 * 60 * 1000

interface Saved { node?: string; adapters: Partial<Record<AccountEngine, { version: string; dir: string; script: string }>> }

const root = (): string => join(app.getPath('userData'), 'adapters', 'managed')
const stateFile = (): string => join(root(), 'state.json')

function readSaved(): Saved {
  try { const j = JSON.parse(readFileSync(stateFile(), 'utf8')) as Partial<Saved>; return { ...j, adapters: j.adapters ?? {} } } catch { return { adapters: {} } }
}
function writeSaved(s: Saved): void {
  mkdirSync(root(), { recursive: true, mode: 0o700 })
  const tmp = stateFile() + '.tmp'
  writeFileSync(tmp, JSON.stringify(s, null, 1))
  renameSync(tmp, stateFile())
}

// ---- What the window sees -------------------------------------------------------------------------------

const states = new Map<AccountEngine, AdapterState>()
let notify: (list: AdapterState[]) => void = () => undefined

function put(id: AccountEngine, patch: Partial<AdapterState>): void {
  const prev = states.get(id) ?? { id, name: ENGINE_NAMES[id], phase: 'idle' as const }
  states.set(id, { ...prev, error: undefined, ...patch })
  notify(adapterStates())
}

export function adapterStates(): AdapterState[] {
  const saved = readSaved()
  return ORDER.map((id) => {
    const s = states.get(id) ?? { id, name: ENGINE_NAMES[id], phase: 'idle' as const }
    const cur = saved.adapters[id]
    return { ...s, version: cur && existsSync(cur.script) ? cur.version : undefined }
  })
}

// ---- Launching ------------------------------------------------------------------------------------------

/** The Node this Tyslin runs adapters with, or null when there is none yet. */
export function managedNode(): string | null {
  const n = readSaved().node
  return n && existsSync(n) ? n : null
}

/** How to start Tyslin's own copy of an adapter: node + the package's script + its default arguments. */
export function managedProgram(id: string): { path: string; args: string[]; nodeDir: string } | null {
  if (!(id in MANAGED)) return null
  const cur = readSaved().adapters[id as AccountEngine]
  const node = managedNode()
  if (!cur || !node || !existsSync(cur.script)) return null
  return { path: node, args: [cur.script, ...MANAGED[id as AccountEngine].args], nodeDir: dirname(node) }
}

// ---- Node -----------------------------------------------------------------------------------------------

const major = (v: string): number => Number(/^v?(\d+)/.exec(v.trim())?.[1] ?? 0)

/** The computer's own node when it is new enough, with the npm beside it (as `node npm-cli.js`). */
function systemNode(): { node: string; npmCli: string } | null {
  const node = which('node')
  if (!node) return null
  const v = spawnSync(node, ['-v'], { encoding: 'utf8', timeout: 10_000 })
  if (v.status !== 0 || major(v.stdout) < MIN_NODE) return null
  const npmCli = npmCliFor(node)
  return npmCli ? { node, npmCli } : null
}

function npmCliFor(node: string): string | null {
  const dir = dirname(node)
  const candidates = process.platform === 'win32'
    ? [join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js')]
    : [join(dir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'), ...(() => { const n = which('npm'); try { return n ? [realpathSync(n)] : [] } catch { return [] } })()]
  return candidates.find((c) => existsSync(c) && c.endsWith('.js')) ?? null
}

function nodeTarget(): { name: string; ext: 'tar.gz' | 'zip' } {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  if (process.platform === 'win32') return { name: `win-${arch}`, ext: 'zip' }
  return { name: `${process.platform === 'darwin' ? 'darwin' : 'linux'}-${arch}`, ext: 'tar.gz' }
}

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!r.ok) throw new Error(`${url} answered ${r.status}`)
  return r.text()
}

/** Downloads the newest Node.js LTS into adapters/managed/node/<version>/ and returns its node binary. */
async function downloadNode(): Promise<string> {
  const list = JSON.parse(await fetchText('https://nodejs.org/dist/index.json')) as { version: string; lts: string | false }[]
  const lts = list.find((v) => v.lts && major(v.version) >= MIN_NODE)
  if (!lts) throw new Error('Could not find a Node.js release to download.')
  const { name, ext } = nodeTarget()
  const base = `node-${lts.version}-${name}`
  const file = `${base}.${ext}`
  const dest = join(root(), 'node', lts.version)
  const bin = process.platform === 'win32' ? join(dest, base, 'node.exe') : join(dest, base, 'bin', 'node')
  if (existsSync(bin)) return bin
  const sums = await fetchText(`https://nodejs.org/dist/${lts.version}/SHASUMS256.txt`)
  const want = sums.split('\n').find((l) => l.trim().endsWith('  ' + file))?.split(/\s+/)[0]
  if (!want) throw new Error(`Node.js ${lts.version} has no download for this computer.`)
  mkdirSync(dest, { recursive: true })
  const archive = join(dest, file)
  const r = await fetch(`https://nodejs.org/dist/${lts.version}/${file}`, { signal: AbortSignal.timeout(INSTALL_TIMEOUT_MS) })
  if (!r.ok || !r.body) throw new Error(`Node.js download answered ${r.status}`)
  await pipeline(Readable.fromWeb(r.body as never), createWriteStream(archive))
  const got = createHash('sha256').update(readFileSync(archive)).digest('hex')
  if (got !== want) { rmSync(dest, { recursive: true, force: true }); throw new Error('The Node.js download did not match its checksum, so it was thrown away.') }
  // tar is on macOS, Linux and Windows 10+ (bsdtar, which also reads .zip).
  const x = spawnSync('tar', ext === 'zip' ? ['-xf', archive, '-C', dest] : ['-xzf', archive, '-C', dest], { timeout: 5 * 60_000 })
  rmSync(archive, { force: true })
  if (x.status !== 0 || !existsSync(bin)) throw new Error('Could not unpack Node.js.')
  return bin
}

/** A Node and npm to install with: the saved one, the computer's own, or a fresh download. */
async function ensureNode(): Promise<{ node: string; npmCli: string }> {
  const saved = managedNode()
  const savedCli = saved ? npmCliFor(saved) : null
  if (saved && savedCli) return { node: saved, npmCli: savedCli }
  const sys = systemNode()
  if (sys) { writeSaved({ ...readSaved(), node: sys.node }); return sys }
  for (const id of ORDER) if (!readSaved().adapters[id]) put(id, { phase: 'installing', detail: 'Downloading Node.js' })
  const node = await downloadNode()
  const npmCli = npmCliFor(node)
  if (!npmCli) throw new Error('The downloaded Node.js has no npm.')
  writeSaved({ ...readSaved(), node })
  return { node, npmCli }
}

// ---- Install and update ---------------------------------------------------------------------------------

const newer = (a: string, b: string): boolean => {
  const p = (v: string): number[] => v.split('-')[0].split('.').map((n) => Number(n) || 0)
  const [x, y] = [p(a), p(b)]
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  return false
}

async function latestVersion(pkg: string): Promise<string> {
  const j = JSON.parse(await fetchText(`https://registry.npmjs.org/${pkg}/latest`)) as { version?: string }
  if (!j.version) throw new Error(`npm has no version of ${pkg}`)
  return j.version
}

function installEnv(node: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: [dirname(node), ...searchDirs()].join(delimiter), npm_config_update_notifier: 'false' }
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

function npmInstall(n: { node: string; npmCli: string }, dir: string, spec: string): Promise<void> {
  mkdirSync(dir, { recursive: true })
  return new Promise((resolve, reject) => {
    let tail = ''
    const child = spawn(n.node, [n.npmCli, 'install', '--prefix', dir, '--no-audit', '--no-fund', '--no-save', '--omit=dev', '--loglevel=error', spec], {
      cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      env: installEnv(n.node)
    })
    const keep = (b: Buffer): void => { tail = (tail + b.toString('utf8')).slice(-2000) }
    child.stdout.on('data', keep); child.stderr.on('data', keep)
    const timer = setTimeout(() => child.kill(), INSTALL_TIMEOUT_MS)
    child.once('error', (e) => { clearTimeout(timer); reject(e) })
    child.once('exit', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(tail.trim().split('\n').slice(-3).join('\n') || `npm exited with code ${code}`)) })
  })
}

function scriptOf(dir: string, id: AccountEngine): string {
  const { pkg, bin } = MANAGED[id]
  const pj = JSON.parse(readFileSync(join(dir, 'node_modules', pkg, 'package.json'), 'utf8')) as { bin?: string | Record<string, string> }
  const rel = typeof pj.bin === 'string' ? pj.bin : pj.bin?.[bin]
  if (!rel) throw new Error(`${pkg} has no "${bin}" program`)
  return join(dir, 'node_modules', pkg, rel)
}

/** Installs or updates one adapter to `version`; a failure leaves the current copy in place. */
async function installVersion(id: AccountEngine, version: string, n: { node: string; npmCli: string }): Promise<void> {
  const cur = readSaved().adapters[id]
  put(id, { phase: cur ? 'updating' : 'installing', from: cur?.version, to: version, detail: undefined })
  const dir = join(root(), id, version)
  const partial = dir + '.partial'
  rmSync(partial, { recursive: true, force: true })
  try {
    await npmInstall(n, partial, `${MANAGED[id].pkg}@${version}`)
    rmSync(dir, { recursive: true, force: true })
    renameSync(partial, dir)
    const script = scriptOf(dir, id)
    const s = readSaved()
    writeSaved({ ...s, adapters: { ...s.adapters, [id]: { version, dir, script } } })
    put(id, { phase: 'done', from: cur?.version, to: version, at: Date.now() })
  } catch (e) {
    rmSync(partial, { recursive: true, force: true })
    put(id, { phase: 'error', error: e instanceof Error ? e.message : String(e) })
  }
}

/** Removes old version folders; the current one stays. Done at launch, before any run can use an old one. */
function prune(): void {
  const s = readSaved()
  for (const id of ORDER) {
    const keep = s.adapters[id]?.dir
    const folder = join(root(), id)
    if (!existsSync(folder)) continue
    for (const name of readdirSync(folder)) {
      const p = join(folder, name)
      if (p !== keep) rmSync(p, { recursive: true, force: true })
    }
  }
}

let checking: Promise<void> | null = null

/** Installs missing adapters and updates old ones, one at a time. Safe to call often; runs once at a time. */
export function checkAdapters(): Promise<void> {
  checking ??= (async () => {
    try {
      for (const id of ORDER) put(id, { phase: 'checking' })
      const latest = new Map<AccountEngine, string>()
      for (const id of ORDER) {
        try { latest.set(id, await latestVersion(MANAGED[id].pkg)) } catch (e) { put(id, { phase: 'error', error: `Could not reach npm: ${e instanceof Error ? e.message : String(e)}` }) }
      }
      const todo = ORDER.filter((id) => { const v = latest.get(id); const cur = readSaved().adapters[id]; return v && (!cur || !existsSync(cur.script) || newer(v, cur.version)) })
      for (const id of ORDER) if (!todo.includes(id) && latest.has(id)) put(id, { phase: 'idle' })
      for (const id of todo) put(id, { phase: 'queued' })
      if (!todo.length) return
      let n: { node: string; npmCli: string }
      try { n = await ensureNode() } catch (e) {
        for (const id of todo) put(id, { phase: 'error', error: e instanceof Error ? e.message : String(e) })
        return
      }
      for (const id of todo) await installVersion(id, latest.get(id)!, n)
    } finally { checking = null }
  })()
  return checking
}

/** One adapter now (the Install button in a task or on an agent's page). */
export async function installAdapter(id: AccountEngine): Promise<{ ok: boolean; error?: string }> {
  await checkAdapters()
  const s = states.get(id)
  return s?.phase === 'error' ? { ok: false, error: s.error } : { ok: !!managedProgram(id) }
}

/** Starts the managed adapters: clean old copies, check now, then every six hours while Tyslin is open. */
export function startAdapterManager(onChange: (list: AdapterState[]) => void): void {
  notify = onChange
  try { prune() } catch { /* best effort */ }
  void checkAdapters()
  setInterval(() => void checkAdapters(), CHECK_EVERY_MS).unref()
}
