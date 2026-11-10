import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { Readable, Writable } from 'stream'
import { client, ndJsonStream, PROTOCOL_VERSION, RequestError, type ActiveSession, type ClientContext, type InitializeResponse, type McpServer, type SessionUpdate, type ToolCallContent } from '@agentclientprotocol/sdk'
import type { EngineTestResult, PermissionChoice, RunEventBody } from '@shared/types'

/**
 * ACP (Agent Client Protocol) client: starts an external agent as a subprocess and drives one
 * prompt turn over stdio. No Electron or database imports here; the caller supplies a host that
 * decides how files are read and written and how permission is asked.
 */

export interface AcpHost {
  emit: (e: RunEventBody) => void
  /** Present only when the run has a project folder; agents get no file access otherwise. */
  readTextFile?: (absPath: string, line?: number | null, limit?: number | null) => string
  /** Resolves once written; throws (with a reason the agent can read) if the user declined. */
  writeTextFile?: (absPath: string, content: string, toolCallId: string) => Promise<void>
  /** Resolves with the chosen option id, or null if the user declined. */
  requestPermission: (title: string, choices: PermissionChoice[], toolCallId: string) => Promise<string | null>
}

export interface AcpLaunch {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  /**
   * An ACP auth method to run right after `initialize` when the agent offers it (Codex: "api-key", so it
   * uses the key in `env` instead of a saved ChatGPT login). Set by engines.ts in key mode only.
   */
  authMethodId?: string
}

const HANDSHAKE_TIMEOUT_MS = 30_000
const STOP_GRACE_MS = 3_000

/** Adapter processes still running, so the app can stop them (and what they started) when it quits. */
const live = new Set<ChildProcessWithoutNullStreams>()

function start(launch: AcpLaunch): ChildProcessWithoutNullStreams {
  const child = spawn(launch.command, launch.args, {
    cwd: launch.cwd,
    env: launch.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    // .cmd and .bat shims on Windows only start through a shell.
    shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(launch.command),
    windowsHide: true,
    // Its own process group, so stopping it also stops what it started: the CLI behind the adapter, dev servers,
    // test runners. Killing only the adapter left those running and holding memory (10 Nov 2026).
    detached: process.platform !== 'win32'
  })
  live.add(child)
  child.once('exit', () => live.delete(child))
  return child
}

/**
 * Stops an adapter and everything it started: SIGTERM to its process group, SIGKILL after a grace period if
 * anything in the group is still there. Windows: `taskkill /T /F` on the tree.
 */
export function killTree(child: ChildProcessWithoutNullStreams, graceMs = 3_000): void {
  const pid = child.pid
  if (!pid) return
  if (process.platform === 'win32') {
    try { spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => undefined) } catch { /* gone */ }
    return
  }
  const signalGroup = (sig: NodeJS.Signals): boolean => { try { process.kill(-pid, sig); return true } catch { return false } }
  if (!signalGroup('SIGTERM') && child.exitCode === null) { try { child.kill() } catch { /* gone */ } }
  setTimeout(() => { signalGroup('SIGKILL') }, graceMs).unref()
}

/** On quit: every adapter still running, and its process group. */
export function killAllAdapters(): void {
  for (const child of live) killTree(child, 1_000)
  live.clear()
}

/** Keeps the last few KB of stderr so a crash can be explained. */
function stderrTail(child: ChildProcessWithoutNullStreams): () => string {
  let tail = ''
  child.stderr.on('data', (b: Buffer) => { tail = (tail + b.toString('utf8')).slice(-4000) })
  return () => tail.trim().split('\n').slice(-6).join('\n')
}

/** Rejects when the process fails to start or exits before `done` settles. */
function exitWatch(child: ChildProcessWithoutNullStreams, name: string, stderr: () => string): Promise<never> {
  return new Promise((_, reject) => {
    child.once('error', (err: NodeJS.ErrnoException) => {
      reject(new Error(err.code === 'ENOENT' ? `${name} is not installed or not on your PATH.` : `${name} could not start: ${err.message}`))
    })
    child.once('exit', (code, signal) => {
      const why = stderr()
      reject(new Error(`${name} stopped unexpectedly (${signal ?? `exit code ${code}`}).${why ? `\n${why}` : ''}`))
    })
  })
}

/** Errors thrown in request handlers reach the agent only as "Internal error" unless they're RequestErrors. */
function asRequestError(err: unknown): RequestError {
  return err instanceof RequestError ? err : new RequestError(-32603, err instanceof Error ? err.message : String(err))
}

/**
 * When the agent dies, the connection usually reports "closed" before the process's exit
 * arrives. Give the exit a moment so the error carries the exit code and stderr instead.
 */
async function explain(err: unknown, died: Promise<never>): Promise<never> {
  await Promise.race([died, new Promise((r) => setTimeout(r, 500))])
  throw err
}

function timeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let t: NodeJS.Timeout
  return Promise.race([p, new Promise<never>((_, reject) => { t = setTimeout(() => reject(new Error(message)), ms) })])
    .finally(() => clearTimeout(t))
}

function connection(child: ChildProcessWithoutNullStreams): ReturnType<typeof ndJsonStream> {
  return ndJsonStream(
    Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
    Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>
  )
}

async function initialize(agent: ClientContext, fileAccess: boolean, clientVersion: string) {
  return agent.request('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    clientCapabilities: { fs: { readTextFile: fileAccess, writeTextFile: fileAccess }, terminal: false },
    clientInfo: { name: 'tyslin-studio', title: 'Tyslin Studio', version: clientVersion }
  })
}

/** Runs `launch.authMethodId` when the agent offers that method; a method the agent doesn't list is skipped. */
async function authenticateIfOffered(agent: ClientContext, init: InitializeResponse, launch: AcpLaunch, name: string): Promise<void> {
  const methodId = launch.authMethodId
  if (!methodId || !(init.authMethods ?? []).some((m) => m.id === methodId)) return
  try {
    await timeout(agent.request('authenticate', { methodId }), HANDSHAKE_TIMEOUT_MS, `${name} did not finish signing in with the API key within ${HANDSHAKE_TIMEOUT_MS / 1000} seconds.`)
  } catch (err) {
    const why = err instanceof RequestError ? (typeof (err.data as { details?: unknown } | undefined)?.details === 'string' ? (err.data as { details: string }).details : err.message) : err instanceof Error ? err.message : String(err)
    throw new Error(`${name} could not sign in with the API key from Settings → Models: ${why}`)
  }
}

/**
 * Asks the agent to use `model` for this session, through the "model" config option `session/new` returned
 * (ACP session config; Codex lists its models there). Nothing happens when the agent offers no model choice.
 * When the agent lists models and `model` isn't one of them (for example the default model is a Claude name
 * and the agent is Codex), the agent's own default stays and the reason is logged; a run never fails over it.
 */
async function chooseModel(agent: ClientContext, session: ActiveSession, model: string, name: string): Promise<void> {
  const option = (session.newSessionResponse.configOptions ?? []).find((o) => o.type === 'select' && (o.category === 'model' || o.id === 'model'))
  if (!option || option.type !== 'select') return
  const values = option.options.flatMap((o) => 'options' in o ? o.options : [o])
  const want = model.trim().toLowerCase()
  const hit = values.find((v) => v.value === model) ?? values.find((v) => v.value.toLowerCase() === want || v.name.toLowerCase() === want)
  if (!hit) {
    console.warn(`[acp] ${name} doesn't offer the model "${model}"; using its default "${option.currentValue}". Offered: ${values.map((v) => v.value).join(', ')}`)
    return
  }
  if (hit.value === option.currentValue) return
  try {
    await agent.request('session/set_config_option', { sessionId: session.sessionId, configId: option.id, value: hit.value })
  } catch (err) {
    console.warn(`[acp] ${name} refused the model "${hit.value}" (${err instanceof Error ? err.message : String(err)}); using its default "${option.currentValue}".`)
  }
}

/**
 * For an agent set to write directly: switches the session to the adapter's own "edits without asking" mode
 * (Gemini CLI `auto_edit`, Claude Code `acceptEdits`), so file edits don't each ask while shell commands still
 * do (10 Nov 2026). Never a mode that approves everything (`yolo`, `bypassPermissions`). No such mode: nothing changes.
 */
async function autoEditMode(agent: ClientContext, session: ActiveSession, name: string): Promise<void> {
  const modes = session.newSessionResponse.modes
  const hit = modes?.availableModes.find((m) => /^(auto_?edit|accept_?edits)$/i.test(m.id))
  if (!modes || !hit || hit.id === modes.currentModeId) return
  try {
    await agent.request('session/set_mode', { sessionId: session.sessionId, modeId: hit.id })
  } catch (err) {
    console.warn(`[acp] ${name} refused the mode "${hit.id}" (${err instanceof Error ? err.message : String(err)}); edits will ask.`)
  }
}

/**
 * Error forms Codex sends as plain reply text (to clients without its typed-failure extension) while the
 * turn still ends with `end_turn`. Only these exact shapes count; a normal reply mentioning an error doesn't.
 */
const TEXT_FAILURE_FORMS = [
  /\bmodel is not supported when using Codex with\b/,
  /^(Warning: Falling back from WebSockets to HTTPS transport\. )?unexpected status [45]\d\d\b/,
  /\bauth error code: [a-z_]+/,
  /^Authentication required\b/,
  /^You have been logged out\b/,
  // Claude Code's API failures as text, e.g. "API Error: 402 {…}" from OpenRouter (out of credits) (10 Nov 2026).
  /^(Failed to authenticate\. )?API Error: [45]\d\d\b/
]

/** What the agent said went wrong during the turn, if anything; checked when the turn stops. */
/** `cost`: the adapter's own running total for the session in USD (ACP usage_update), when it reports one. */
interface TurnState { failure: string | null; lastText: string; cost: number | null }

/** An agent-side error: Codex's `_meta.codex.error` (not a retry) or its thread ending in a system error. */
function failureFromMeta(meta: Record<string, unknown> | null | undefined, state: TurnState): string | null {
  const codex = meta?.codex as { error?: { message?: unknown; willRetry?: unknown }; threadStatus?: { type?: unknown } } | undefined
  if (!codex) return null
  if (codex.error && codex.error.willRetry !== true && typeof codex.error.message === 'string') return codex.error.message
  if (codex.threadStatus?.type === 'systemError') return state.lastText.trim() || 'The agent stopped with a system error.'
  return null
}

function contentText(content: ToolCallContent[] | null | undefined): string {
  return (content ?? []).map((c) => {
    if (c.type === 'content' && c.content.type === 'text') return c.content.text
    if (c.type === 'diff') return `Edited ${c.path}`
    return ''
  }).filter(Boolean).join('\n')
}

function toolArgs(u: { rawInput?: unknown; locations?: { path: string }[] | null }): string {
  const input = u.rawInput && typeof u.rawInput === 'object' ? u.rawInput as Record<string, unknown> : {}
  const path = typeof input.path === 'string' ? input.path : u.locations?.[0]?.path
  return JSON.stringify(path ? { ...input, path } : input)
}

/**
 * Starts the agent, opens a session in `launch.cwd`, sends one prompt and streams the turn as
 * run events. Returns the agent's reply text. The process is stopped when the turn ends.
 */
export async function runAcpTurn(opts: {
  name: string
  launch: AcpLaunch
  prompt: string
  host: AcpHost
  clientVersion: string
  signal?: AbortSignal
  /** Integrations switched on for this agent; remote ones only go to agents that support them. */
  mcpServers?: McpServer[]
  /** The agent's model in Tyslin; used when the adapter lets clients pick one of its models (see chooseModel). */
  model?: string
  /** The agent writes directly: pick the adapter's edits-without-asking mode when it has one (see autoEditMode). */
  autoEdit?: boolean
}): Promise<string> {
  const { name, launch, host, signal } = opts
  if (signal?.aborted) throw new Error('Stopped.')
  const child = start(launch)
  const stderr = stderrTail(child)
  const died = exitWatch(child, name, stderr)
  died.catch(() => { /* surfaced through the race below */ })
  let writes = 0

  const app = client({ name: 'tyslin-studio' })
    .onRequest('session/request_permission', async ({ params }) => {
      const choices: PermissionChoice[] = params.options.map((o) => ({ id: o.optionId, name: o.name, kind: o.kind }))
      const title = params.toolCall.title || `${name} wants to use a tool`
      const picked = await host.requestPermission(title, choices, params.toolCall.toolCallId)
      return { outcome: picked ? { outcome: 'selected', optionId: picked } : { outcome: 'cancelled' } }
    })
    .onRequest('fs/read_text_file', ({ params }) => {
      if (!host.readTextFile) throw RequestError.invalidRequest(undefined, 'File access is not available in this chat.')
      try {
        return { content: host.readTextFile(params.path, params.line, params.limit) }
      } catch (err) {
        throw asRequestError(err)
      }
    })
    .onRequest('fs/write_text_file', async ({ params }) => {
      if (!host.writeTextFile) throw RequestError.invalidRequest(undefined, 'File access is not available in this chat.')
      const id = `acp-write-${++writes}`
      try {
        await host.writeTextFile(params.path, params.content, id)
        return {}
      } catch (err) {
        // Shown in the task's activity, so a refused write (outside the folder, review declined) isn't silent.
        const msg = err instanceof Error ? err.message : String(err)
        host.emit({ type: 'tool_call_start', toolCallId: id, name: `Write ${params.path}` })
        host.emit({ type: 'tool_call_end', toolCallId: id })
        host.emit({ type: 'tool_result', toolCallId: id, content: `Not written: ${msg}`, isError: true })
        console.warn(`[acp] ${name} write refused for ${params.path}: ${msg}`)
        throw asRequestError(err)
      }
    })

  const stop = (): void => {
    killTree(child)
  }
  // Stopped while the agent is still starting (the handshake can take up to 30 s): there is no session to
  // cancel yet, and an abort listener added later never fires, so stop the process now.
  signal?.addEventListener('abort', stop, { once: true })

  try {
    return await Promise.race([died, app.connectWith(connection(child), async (agent) => {
      const init = await timeout(initialize(agent, !!host.readTextFile, opts.clientVersion), HANDSHAKE_TIMEOUT_MS,
        `${name} did not answer within ${HANDSHAKE_TIMEOUT_MS / 1000} seconds. Check it runs in a terminal with: ${[launch.command, ...launch.args].join(' ')}`)
      if (init.protocolVersion !== PROTOCOL_VERSION) {
        throw new Error(`${name} speaks ACP version ${init.protocolVersion}; Tyslin speaks version ${PROTOCOL_VERSION}. Update one of them.`)
      }
      // Key mode: sign the adapter in with the key from its environment before the session opens, or Codex
      // keeps using whatever login its own files hold (a ChatGPT account, with its own model list).
      await authenticateIfOffered(agent, init, launch, name)

      let session
      try {
        const mcp = init.agentCapabilities?.mcpCapabilities
        const mcpServers = (opts.mcpServers ?? []).filter((m) => !('type' in m) || (m.type === 'http' ? !!mcp?.http : m.type === 'sse' ? !!mcp?.sse : true))
        session = await agent.buildSession({ cwd: launch.cwd, mcpServers }).start()
      } catch (err) {
        if (err instanceof RequestError && err.code === -32000) {
          throw new Error(`${name} needs you to sign in first. Run ${launch.command} in a terminal and follow its sign-in steps, then try again.`)
        }
        throw err
      }
      signal?.removeEventListener('abort', stop)
      if (signal?.aborted) throw new Error('Stopped.')
      if (opts.model?.trim()) await chooseModel(agent, session, opts.model, name)
      if (opts.autoEdit) await autoEditMode(agent, session, name)

      const onAbort = (): void => {
        void agent.notify('session/cancel', { sessionId: session.sessionId }).catch(() => undefined)
        setTimeout(stop, STOP_GRACE_MS)
      }
      signal?.addEventListener('abort', onAbort, { once: true })

      const reply: string[] = []
      const tools = new Set<string>()
      const state: TurnState = { failure: null, lastText: '', cost: null }
      // A prompt the agent rejects (a JSON-RPC error, e.g. "Authentication required") surfaces from nextUpdate().
      void session.prompt(opts.prompt).catch(() => undefined)
      try {
        for (;;) {
          const msg = await session.nextUpdate().catch((err: unknown) => {
            // Codex answers a bad or missing login with -32000 ("Authentication required") on the prompt itself.
            if (err instanceof RequestError && err.code === -32000) {
              throw new Error(launch.authMethodId
                ? `${name} rejected the API key from Settings → Models. Check the key, or switch ${name} to your account.`
                : `${name} needs you to sign in first. Run ${launch.command} in a terminal and follow its sign-in steps, then try again.`)
            }
            // Other JSON-RPC errors carry the real reason in `data.message` (Codex: "Quota exceeded…" as a bare "Internal error").
            if (err instanceof RequestError) {
              const d = (err.data ?? {}) as { message?: string; codexErrorInfo?: string }
              if (d.message) throw new Error(`${name} stopped: ${d.message}${d.codexErrorInfo === 'usageLimitExceeded' ? ' The account behind the key is out of credits or over its limit.' : ''}`)
            }
            throw err
          })
          if (msg.kind === 'stop') {
            // Token counts from the prompt response (Claude Code, Codex), and the adapter's own cost figure for the
            // session (Claude Code's usage_update; one session per turn here, so the session total is this turn's).
            const u = (msg.response as { usage?: { inputTokens?: number; outputTokens?: number; cachedReadTokens?: number; cachedWriteTokens?: number } | null }).usage
            if (u || state.cost !== null) {
              host.emit({ type: 'usage', inputTokens: u ? Number(u.inputTokens ?? 0) + Number(u.cachedReadTokens ?? 0) + Number(u.cachedWriteTokens ?? 0) : 0,
                outputTokens: u ? Number(u.outputTokens ?? 0) : 0, ...(state.cost !== null ? { cost: state.cost, costSource: 'estimated' as const, cumulative: true } : {}) })
            }
            if (msg.stopReason === 'cancelled' || signal?.aborted) throw new Error('Stopped.')
            // Codex reports some failures only as reply text and a normal end_turn; those are run errors, not results.
            if (state.failure) throw new Error(`${name} failed: ${state.failure.trim().replace(/\s+/g, ' ').slice(0, 400)}`)
            if (msg.stopReason === 'refusal') reply.push(`\n\n(${name} declined to continue.)`)
            if (msg.stopReason === 'max_tokens' || msg.stopReason === 'max_turn_requests') reply.push(`\n\n(${name} stopped at its length limit.)`)
            break
          }
          handleUpdate(msg.update, host, reply, tools, state)
        }
      } finally {
        signal?.removeEventListener('abort', onAbort)
        session.dispose()
      }
      return reply.join('').trim()
    })])
  } catch (err) {
    return await explain(err, died)
  } finally {
    signal?.removeEventListener('abort', stop)
    stop()
  }
}

function handleUpdate(u: SessionUpdate, host: AcpHost, reply: string[], tools: Set<string>, state: TurnState): void {
  switch (u.sessionUpdate) {
    case 'agent_message_chunk':
      if (u.content.type === 'text') {
        const text = u.content.text
        // Gemini CLI announces a session mode change as a text chunk ("[MODE_UPDATE] autoEdit"); it isn't the agent's
        // reply, and as one it hid a run that ended with no answer (10 Nov 2026).
        if (/^\s*\[MODE_UPDATE\] \S+\s*$/.test(text)) break
        reply.push(text)
        state.lastText = text
        // Codex sends an error as one whole chunk; a streamed reply never arrives in these exact shapes.
        if (TEXT_FAILURE_FORMS.some((re) => re.test(text.trim()))) state.failure = state.failure ?? text
        host.emit({ type: 'text_delta', text })
      }
      break
    case 'session_info_update':
      state.failure = state.failure ?? failureFromMeta(u._meta, state)
      break
    case 'tool_call':
      tools.add(u.toolCallId)
      // Text before and after a tool call are separate paragraphs; without this they glue into one sentence.
      if (reply.length && !/\n\s*$/.test(reply[reply.length - 1])) reply.push('\n\n')
      host.emit({ type: 'tool_call_start', toolCallId: u.toolCallId, name: u.title })
      host.emit({ type: 'tool_call_args', toolCallId: u.toolCallId, delta: toolArgs(u) })
      host.emit({ type: 'tool_call_end', toolCallId: u.toolCallId })
      if (u.status === 'completed' || u.status === 'failed') {
        host.emit({ type: 'tool_result', toolCallId: u.toolCallId, content: contentText(u.content), isError: u.status === 'failed' })
      }
      break
    case 'tool_call_update':
      // Agents may update a call Tyslin never saw start; open it so the UI has a row for it.
      if (!tools.has(u.toolCallId)) {
        tools.add(u.toolCallId)
        host.emit({ type: 'tool_call_start', toolCallId: u.toolCallId, name: u.title ?? 'Tool' })
        host.emit({ type: 'tool_call_end', toolCallId: u.toolCallId })
      }
      if (u.status === 'completed' || u.status === 'failed') {
        host.emit({ type: 'tool_result', toolCallId: u.toolCallId, content: contentText(u.content), isError: u.status === 'failed' })
      }
      break
    case 'usage_update': {
      // Cumulative for the session; Claude Code fills `cost` (its own figure at its price list), Codex doesn't.
      const c = (u as { cost?: { amount?: number; currency?: string } | null }).cost
      if (c && typeof c.amount === 'number' && Number.isFinite(c.amount) && (!c.currency || c.currency === 'USD')) state.cost = c.amount
      break
    }
    default:
      // Thoughts, plans and mode updates aren't shown yet.
      break
  }
}

/** Starts the agent, runs `initialize` (and, in key mode, `authenticate`), and stops it. Used by Settings → Agent engines → Test. */
export async function testAcp(name: string, launch: AcpLaunch, clientVersion: string): Promise<EngineTestResult> {
  const child = start(launch)
  const stderr = stderrTail(child)
  const died = exitWatch(child, name, stderr)
  died.catch(() => undefined)
  try {
    const init = await Promise.race([died, client({ name: 'tyslin-studio' }).connectWith(connection(child), async (agent) => {
      const r = await timeout(initialize(agent, true, clientVersion), HANDSHAKE_TIMEOUT_MS, `${name} did not answer within ${HANDSHAKE_TIMEOUT_MS / 1000} seconds.`)
      await authenticateIfOffered(agent, r, launch, name)
      return r
    })])
    const info = init.agentInfo
    return {
      ok: init.protocolVersion === PROTOCOL_VERSION,
      agent: info ? [info.title || info.name, info.version].filter(Boolean).join(' ') : undefined,
      protocolVersion: init.protocolVersion,
      authMethods: (init.authMethods ?? []).map((m) => m.name),
      error: init.protocolVersion === PROTOCOL_VERSION ? undefined : `Speaks ACP version ${init.protocolVersion}; Tyslin speaks ${PROTOCOL_VERSION}.`
    }
  } catch (err) {
    const why = await explain(err, died).catch((e: unknown) => e)
    return { ok: false, error: why instanceof Error ? why.message : String(why) }
  } finally {
    killTree(child)
  }
}

/**
 * Starts the agent, runs `initialize` and then `authenticate` with one of the methods it offers (for example
 * Codex's "chat-gpt" or Gemini CLI's "oauth-personal"; the agent opens the browser itself), and stops it.
 * Rejects with a readable reason when the method isn't offered, the sign-in fails, or `signal` aborts.
 */
export async function authenticateAcp(name: string, launch: AcpLaunch, methodId: string, clientVersion: string, signal: AbortSignal, timeoutMs: number): Promise<void> {
  const child = start(launch)
  const stderr = stderrTail(child)
  const died = exitWatch(child, name, stderr)
  died.catch(() => undefined)
  const aborted = new Promise<never>((_, reject) => {
    if (signal.aborted) reject(new Error('Sign-in cancelled.'))
    signal.addEventListener('abort', () => reject(new Error('Sign-in cancelled.')), { once: true })
  })
  aborted.catch(() => undefined)
  try {
    await Promise.race([died, aborted, client({ name: 'tyslin-studio' }).connectWith(connection(child), async (agent) => {
      const init = await timeout(initialize(agent, false, clientVersion), HANDSHAKE_TIMEOUT_MS, `${name} did not answer within ${HANDSHAKE_TIMEOUT_MS / 1000} seconds.`)
      const offered = (init.authMethods ?? []) as { id?: string; methodId?: string }[]
      if (!offered.some((m) => (m.id ?? m.methodId) === methodId)) throw new Error(`This version of ${name} doesn't offer browser sign-in. Update it, or sign in with its own command.`)
      await timeout(agent.request('authenticate', { methodId }), timeoutMs, 'Sign-in timed out. Try again.')
    })])
  } catch (err) {
    const why = await explain(err, died).catch((e: unknown) => e)
    throw why instanceof Error ? why : new Error(String(why))
  } finally {
    killTree(child)
  }
}
