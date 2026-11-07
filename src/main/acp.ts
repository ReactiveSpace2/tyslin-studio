import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { Readable, Writable } from 'stream'
import { client, ndJsonStream, PROTOCOL_VERSION, RequestError, type ClientContext, type SessionUpdate, type ToolCallContent } from '@agentclientprotocol/sdk'
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
}

const HANDSHAKE_TIMEOUT_MS = 30_000
const STOP_GRACE_MS = 3_000

function start(launch: AcpLaunch): ChildProcessWithoutNullStreams {
  return spawn(launch.command, launch.args, {
    cwd: launch.cwd,
    env: launch.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    // .cmd and .bat shims on Windows only start through a shell.
    shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(launch.command),
    windowsHide: true
  })
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
      try {
        await host.writeTextFile(params.path, params.content, `acp-write-${++writes}`)
        return {}
      } catch (err) {
        throw asRequestError(err)
      }
    })

  const stop = (): void => {
    if (child.exitCode === null && !child.killed) child.kill()
  }

  try {
    return await Promise.race([died, app.connectWith(connection(child), async (agent) => {
      const init = await timeout(initialize(agent, !!host.readTextFile, opts.clientVersion), HANDSHAKE_TIMEOUT_MS,
        `${name} did not answer within ${HANDSHAKE_TIMEOUT_MS / 1000} seconds. Check it runs in a terminal with: ${[launch.command, ...launch.args].join(' ')}`)
      if (init.protocolVersion !== PROTOCOL_VERSION) {
        throw new Error(`${name} speaks ACP version ${init.protocolVersion}; Tyslin speaks version ${PROTOCOL_VERSION}. Update one of them.`)
      }

      let session
      try {
        session = await agent.buildSession(launch.cwd).start()
      } catch (err) {
        if (err instanceof RequestError && err.code === -32000) {
          throw new Error(`${name} needs you to sign in first. Run ${launch.command} in a terminal and follow its sign-in steps, then try again.`)
        }
        throw err
      }

      const onAbort = (): void => {
        void agent.notify('session/cancel', { sessionId: session.sessionId }).catch(() => undefined)
        setTimeout(stop, STOP_GRACE_MS)
      }
      signal?.addEventListener('abort', onAbort, { once: true })

      const reply: string[] = []
      const tools = new Set<string>()
      void session.prompt(opts.prompt).catch(() => undefined)
      try {
        for (;;) {
          const msg = await session.nextUpdate()
          if (msg.kind === 'stop') {
            if (msg.stopReason === 'cancelled' || signal?.aborted) throw new Error('Stopped.')
            if (msg.stopReason === 'refusal') reply.push(`\n\n(${name} declined to continue.)`)
            if (msg.stopReason === 'max_tokens' || msg.stopReason === 'max_turn_requests') reply.push(`\n\n(${name} stopped at its length limit.)`)
            break
          }
          handleUpdate(msg.update, host, reply, tools)
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
    stop()
  }
}

function handleUpdate(u: SessionUpdate, host: AcpHost, reply: string[], tools: Set<string>): void {
  switch (u.sessionUpdate) {
    case 'agent_message_chunk':
      if (u.content.type === 'text') {
        reply.push(u.content.text)
        host.emit({ type: 'text_delta', text: u.content.text })
      }
      break
    case 'tool_call':
      tools.add(u.toolCallId)
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
    default:
      // Thoughts, plans, mode and usage updates aren't shown yet.
      break
  }
}

/** Starts the agent, runs `initialize`, and stops it. Used by Settings → Agent engines → Test. */
export async function testAcp(name: string, launch: AcpLaunch, clientVersion: string): Promise<EngineTestResult> {
  const child = start(launch)
  const stderr = stderrTail(child)
  const died = exitWatch(child, name, stderr)
  died.catch(() => undefined)
  try {
    const init = await Promise.race([died, client({ name: 'tyslin-studio' }).connectWith(connection(child), (agent) =>
      timeout(initialize(agent, true, clientVersion), HANDSHAKE_TIMEOUT_MS, `${name} did not answer within ${HANDSHAKE_TIMEOUT_MS / 1000} seconds.`))])
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
    if (child.exitCode === null) child.kill()
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
    if (child.exitCode === null) child.kill()
  }
}
