import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { delimiter } from 'path'
import { homedir } from 'os'
import type { McpServer } from '@agentclientprotocol/sdk'
import * as db from './db'
import { getSecret, setSecret } from './secrets'
import { searchDirs, splitCommand, which } from './engines'
import { MCP_PRESETS } from '@shared/mcpPresets'
import type { McpServerInfo, McpServerInput } from '@shared/types'

/**
 * Integrations: MCP servers the user adds once per organization and switches on per agent. Tyslin passes them to
 * external adapters (Claude Code, Codex, Gemini CLI, Goose, ...) in ACP's `session/new`, and the adapter runs the
 * tools. Header and environment values (tokens) are kept encrypted in secret:mcp:<id> and never sent to the window.
 * Agents on Tyslin's built-in models don't use integrations yet.
 */

type Pair = { name: string; value: string }
interface Secrets { headers: Pair[]; env: Pair[] }

const secretKey = (id: string): string => `mcp:${id}`
function readSecrets(id: string): Secrets {
  try {
    const v = JSON.parse(getSecret(secretKey(id)) || '{}') as Partial<Secrets>
    return { headers: v.headers ?? [], env: v.env ?? [] }
  } catch { return { headers: [], env: [] } }
}

/** "Name: value" lines → pairs. */
function parseHeaders(text: string): Pair[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf(':')
    if (i < 1) throw new Error(`"${l.slice(0, 40)}" is not a header. Write it as Name: value.`)
    return { name: l.slice(0, i).trim(), value: l.slice(i + 1).trim() }
  })
}
/** "NAME=value" lines → pairs. */
function parseEnv(text: string): Pair[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf('=')
    if (i < 1 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(l.slice(0, i).trim())) throw new Error(`"${l.slice(0, 40)}" is not a variable. Write it as NAME=value.`)
    return { name: l.slice(0, i).trim(), value: l.slice(i + 1) }
  })
}

const slug = (name: string): string => name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

export function saveIntegration(input: McpServerInput): McpServerInfo {
  const id = input.id ?? randomUUID()
  const old = input.id ? db.getMcpServer(input.id) : null
  if (input.id && !old) throw new Error('That integration no longer exists.')
  const name = slug(input.name)
  if (!name) throw new Error('Give the integration a name.')
  const preset = MCP_PRESETS.find((p) => p.id === input.preset)
  const transport = preset ? 'http' : input.transport
  let url = '', command = '', args: string[] = []
  if (transport === 'http') {
    url = (preset?.url ?? input.url ?? '').trim()
    let parsed: URL
    try { parsed = new URL(url) } catch { throw new Error('Enter the server address, starting with https://') }
    const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
    if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) throw new Error('Use an https:// address (http:// only for localhost).')
  } else {
    const parts = splitCommand(input.commandLine ?? '')
    if (!parts.length) throw new Error('Enter the command that starts the server, e.g. npx -y some-mcp-server')
    ;[command, ...args] = parts
  }

  const secrets = old ? readSecrets(id) : { headers: [], env: [] }
  const before = JSON.stringify(secrets)
  if (preset && input.token !== undefined) {
    const t = input.token.trim()
    secrets.headers = t ? [{ name: 'Authorization', value: `Bearer ${t}` }] : []
  }
  if (!preset && input.headers !== undefined) secrets.headers = transport === 'http' ? parseHeaders(input.headers) : []
  if (!preset && input.env !== undefined) secrets.env = transport === 'stdio' ? parseEnv(input.env) : []
  if (preset && !secrets.headers.length) throw new Error(`Paste your ${preset.title} ${preset.tokenLabel.toLowerCase()}.`)
  if (transport === 'http') secrets.env = []
  else secrets.headers = []

  const saved = db.saveMcpServer({
    id, name, preset: preset?.id ?? '', transport, url, command, args,
    title: (input.title ?? old?.title ?? '').trim().slice(0, 80), source: (input.source ?? old?.source ?? '').trim().slice(0, 200),
    agentIds: input.agentIds ?? old?.agentIds ?? [],
    secretNames: [...secrets.headers.map((h) => h.name), ...secrets.env.map((e) => e.name)]
    // A replaced token (same header name, new value) makes the last test meaningless too; the screen tests again.
  }, !!old && JSON.stringify(secrets) !== before)
  setSecret(secretKey(id), secrets.headers.length || secrets.env.length ? JSON.stringify(secrets) : '')
  return saved
}

export function removeIntegration(id: string): void {
  db.removeMcpServer(id)
  setSecret(secretKey(id), '')
}

/** The ACP form of one server, or null when its program can't be found (stdio). */
function toAcp(s: McpServerInfo): McpServer | null {
  const sec = readSecrets(s.id)
  if (s.transport === 'http') return { type: 'http', name: s.name, url: s.url, headers: sec.headers }
  const path = which(s.command)
  if (!path) return null
  return { name: s.name, command: path, args: s.args, env: [{ name: 'PATH', value: searchDirs().join(delimiter) }, ...sec.env] }
}

/** The integrations switched on for this agent, ready for ACP `session/new`. Servers that can't start are left out. */
export function acpServersForAgent(agentId: string): McpServer[] {
  return db.mcpServersForAgent(agentId).map(toAcp).filter((s): s is McpServer => !!s)
}

// ---- Test: initialize + tools/list, then stop ----------------------------------------------------------

const TEST_TIMEOUT_MS = 60_000
const CLIENT_INFO = { name: 'tyslin-studio', version: '1' }
const PROTOCOL = '2025-06-18'

type Rpc = { jsonrpc: '2.0'; id?: number; method?: string; result?: Record<string, unknown>; error?: { message?: string } }

/** A response body that is JSON or an SSE stream: the message with this id. */
function pickMessage(body: string, contentType: string, id: number): Rpc | null {
  const msgs: Rpc[] = []
  if (contentType.includes('text/event-stream')) {
    for (const line of body.split('\n')) if (line.startsWith('data:')) { try { msgs.push(JSON.parse(line.slice(5).trim()) as Rpc) } catch { /* not JSON */ } }
  } else {
    try { const v = JSON.parse(body) as Rpc | Rpc[]; msgs.push(...(Array.isArray(v) ? v : [v])) } catch { /* not JSON */ }
  }
  return msgs.find((m) => m.id === id) ?? null
}

/** Why a fetch to the server failed before it answered, in plain words ("fetch failed" says nothing). */
function unreachable(url: string, err: unknown): string {
  const e = err as { name?: string; message?: string; cause?: { code?: string; message?: string } }
  const code = e?.cause?.code ?? ''
  let host = url
  try { host = new URL(url).host } catch { /* shown as given */ }
  if (e?.name === 'TimeoutError') return 'The server did not answer within a minute.'
  if (code === 'ECONNREFUSED') return `Nothing is listening at ${host}. Is the server running?`
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return `Can't find ${host}. Check the address and your connection.`
  if (code === 'ECONNRESET' || code === 'UND_ERR_SOCKET') return `${host} closed the connection before answering.`
  if (/CERT|certificate|SSL|TLS/i.test(code + ' ' + (e?.cause?.message ?? ''))) return `${host} has a certificate problem: ${e?.cause?.message ?? code}.`
  return `Couldn't reach ${host}${code ? ` (${code})` : e?.cause?.message ? ` (${e.cause.message})` : ''}.`
}

async function testHttp(s: McpServerInfo): Promise<string[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': PROTOCOL }
  for (const h of readSecrets(s.id).headers) headers[h.name] = h.value
  const signal = AbortSignal.timeout(TEST_TIMEOUT_MS)
  const post = async (msg: object, id?: number): Promise<{ res: Response; msg: Rpc | null }> => {
    const res = await fetch(s.url, { method: 'POST', headers, body: JSON.stringify(msg), signal }).catch((err: unknown) => { throw new Error(unreachable(s.url, err)) })
    if (res.status === 401 || res.status === 403) throw new Error(`The server refused the credentials (${res.status}). Check the token.`)
    if (res.status === 404) throw new Error('No MCP server at that address (404).')
    if (!res.ok && res.status !== 202) throw new Error(`The server answered ${res.status}.`)
    if (id === undefined) { await res.body?.cancel().catch(() => undefined); return { res, msg: null } }
    return { res, msg: pickMessage(await res.text(), res.headers.get('content-type') ?? '', id) }
  }
  const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: CLIENT_INFO } }, 1)
  if (!init.msg) throw new Error("The server didn't answer like an MCP server.")
  if (init.msg.error) throw new Error(init.msg.error.message || 'The server refused to start a session.')
  const session = init.res.headers.get('mcp-session-id')
  if (session) headers['Mcp-Session-Id'] = session
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' })
  const list = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, 2)
  if (list.msg?.error) throw new Error(list.msg.error.message || 'The server would not list its tools.')
  if (session) void fetch(s.url, { method: 'DELETE', headers, signal: AbortSignal.timeout(5000) }).catch(() => undefined)
  return toolNames(list.msg)
}

const toolNames = (m: Rpc | null): string[] => ((m?.result?.tools as { name?: string }[] | undefined) ?? []).map((t) => String(t.name ?? '')).filter(Boolean)

function testStdio(s: McpServerInfo): Promise<string[]> {
  const path = which(s.command)
  if (!path) return Promise.reject(new Error(`Tyslin can't find "${s.command}". Install it, or use its full path.`))
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: searchDirs().join(delimiter) }
  for (const e of readSecrets(s.id).env) env[e.name] = e.value
  return new Promise((resolve, reject) => {
    const child = spawn(path, s.args, { stdio: ['pipe', 'pipe', 'pipe'], env, cwd: homedir(), windowsHide: true, shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(path) })
    let buf = '', errTail = ''
    const done = (err: Error | null, tools?: string[]): void => { clearTimeout(timer); if (child.exitCode === null) child.kill(); if (err) reject(err); else resolve(tools ?? []) }
    const timer = setTimeout(() => done(new Error('The server did not answer within a minute.')), TEST_TIMEOUT_MS)
    // A server that exits at once closes stdin; without a handler the EPIPE would be an uncaught error in main.
    child.stdin.on('error', () => { /* reported by the exit handler */ })
    const send = (m: object): void => { child.stdin.write(JSON.stringify(m) + '\n') }
    child.stderr.on('data', (b: Buffer) => { errTail = (errTail + b.toString('utf8')).slice(-1500) })
    child.stdout.on('data', (b: Buffer) => {
      buf += b.toString('utf8')
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        let m: Rpc
        try { m = JSON.parse(line) as Rpc } catch { continue }
        if (m.id === 1) {
          if (m.error) return done(new Error(m.error.message || 'The server refused to start a session.'))
          send({ jsonrpc: '2.0', method: 'notifications/initialized' })
          send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
        } else if (m.id === 2) {
          if (m.error) return done(new Error(m.error.message || 'The server would not list its tools.'))
          return done(null, toolNames(m))
        }
      }
    })
    child.once('error', (err) => done(new Error(`Could not start the server: ${err.message}`)))
    child.once('exit', (code) => done(new Error(`The server stopped (exit code ${code}).${errTail.trim() ? '\n' + errTail.trim().split('\n').slice(-3).join('\n') : ''}`)))
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: CLIENT_INFO } })
  })
}

export async function testIntegration(id: string): Promise<McpServerInfo> {
  const s = db.getMcpServer(id)
  if (!s) throw new Error('That integration no longer exists.')
  try {
    const tools = s.transport === 'http' ? await testHttp(s) : await testStdio(s)
    db.setMcpTest(id, { ok: true, at: Date.now(), tools })
  } catch (err) {
    const msg = err instanceof Error ? (err.name === 'TimeoutError' ? 'The server did not answer within a minute.' : err.message) : String(err)
    db.setMcpTest(id, { ok: false, at: Date.now(), error: msg })
  }
  return db.getMcpServer(id)!
}
