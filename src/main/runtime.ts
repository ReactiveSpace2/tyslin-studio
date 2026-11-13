import { app } from 'electron'
import { randomUUID } from 'crypto'
import { homedir } from 'os'
import type { Agent, ExternalEngineId, PendingPermission, PermissionChoice, Project, RunEventBody, Skill } from '@shared/types'
import { getSecret } from './secrets'
import { isReadOnlyCommand } from './readOnly'
import { getAgent, getPrefs, getProject, getSetting, listAgents, type ModelMessage } from './db'
import { readImage } from './attachments'
import { acpFileAccess, FILE_TOOLS, listProjectFiles, runTools, type ToolCall, type ToolContext, type ToolDef } from './tools'
import { runAcpTurn } from './acp'
import { acpServersForAgent } from './integrations'
import { engineLaunch, engineStatus } from './engines'
import { BOARD_TOOLS, boardSummary } from './boardTools'
import { getAgency } from './db'
import { memoryPrompt } from './memory'
import { AGENCY_TEMPLATES, intakeInstructions, templatePages } from '@shared/agencies'
import { pageInstructions } from '@shared/pages'
import { openRouterError, usesOpenRouter } from '@shared/openrouter'

/**
 * AgentRuntime is the seam between Tyslin and whatever runs the agent loop.
 * Two kinds: Tyslin's direct model runtimes (Anthropic + OpenAI-compatible: OpenAI, Gemini, Ollama)
 * with file tools, and AcpRuntime, which drives an external agent (Goose, Hermes, ZeroClaw, OpenClaw…)
 * over the Agent Client Protocol.
 * Runtimes report progress only through `emit`, as AG-UI-shaped events.
 */
export interface AgentRuntime {
  run(opts: RunOptions): Promise<string>
}

export interface RunOptions {
  runId: string
  sessionId: string
  agent: Agent
  skills: Skill[]
  project: Project | null
  history: ModelMessage[]
  emit: (e: RunEventBody) => void
  signal?: AbortSignal
}

/** Model turns per run, so a confused agent can't loop forever. */
/** Tool rounds per reply. 12 was too few for a Lead reading a folder before planning (10 Nov 2026). */
const MAX_TURNS = 24

/**
 * The tool loop ran out of rounds while the model was still calling tools. With some text, that text is the reply
 * with a note; with none, the run fails visibly instead of ending as an empty reply (10 Nov 2026).
 */
/**
 * fetch with two retries for network-level failures only ("fetch failed": DNS, reset, offline), 2 s then 5 s apart.
 * HTTP errors come back as responses and are never retried here; a stopped run isn't retried (10 Nov 2026: one
 * dropped connection failed a Lead's whole run).
 */
async function fetchRetry(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, init)
    } catch (err) {
      if (attempt >= 2 || init.signal?.aborted || !(err instanceof TypeError)) throw err
      await new Promise((r) => setTimeout(r, attempt === 0 ? 2000 : 5000))
      if (init.signal?.aborted) throw err
    }
  }
}

function outOfTurns(texts: string[]): string {
  const note = `(Stopped after ${MAX_TURNS} rounds of tool calls before finishing. Ask again to continue, or narrow the request.)`
  if (!texts.join('').trim()) throw new Error(`Stopped after ${MAX_TURNS} rounds of tool calls without an answer. Ask again to continue, or narrow the request.`)
  return [...texts, note].join('\n\n')
}

function systemPrompt(agent: Agent, skills: Skill[], project: Project | null): string {
  const parts = [agent.instructions.trim() || `You are ${agent.name}.`]
  // Scheduled runs and plans need the date (a Lead asked to "write the next 7 days" had none, 10 Nov 2026).
  const now = new Date()
  parts.push(`Today is ${now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} (${now.toISOString().slice(0, 10)}), ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} local time.`)
  if (agent.goal?.trim()) parts.push('## Your goal\n' + agent.goal.trim())
  const shared = getPrefs().sharedInstructions
  if (shared) parts.push('## Workspace guidelines\n' + shared)
  const used = skills.filter((s) => agent.skills.includes(s.name))
  if (used.length) {
    parts.push('## Skills\n' + used.map((s) => `### ${s.name}\n${s.body}`).join('\n\n'))
  }
  // Org chart: who this agent reports to and who it leads, in its project.
  if (agent.kind === 'agent' && agent.projectId) {
    const home = getProject(agent.projectId)
    const lead = agent.leadId ? getAgent(agent.leadId) : null
    const team = listAgents().filter((a) => a.leadId === agent.id && a.projectId === agent.projectId)
    const lines = [`You report to ${lead ? `${lead.name} (${lead.description || 'agent'})` : 'the user, who is in charge'}.`]
    if (team.length) lines.push(`You lead this team${home ? ` in ${home.name}` : ''}; plan work for them and say who should do what:\n` + team.map((a) => `- ${a.name}: ${a.description || 'agent'}`).join('\n'))
    parts.push('## Team\n' + lines.join('\n'))
  }
  // The Lead of an agency sees its board and roster, and has the board tools.
  const agency = agent.agency ? getAgency(agent.agency) : null
  if (agency && agency.leadId === agent.id) {
    parts.push('## Your agency and its board\n' + boardSummary(agency) + '\n\nUse the board tools to add, edit, assign, move and comment on cards, board_run_card to start one (only when cards start on their own, see above), message_boss to talk to the boss (one message per card unless the boss replies) and agency_log for decisions.\nA worker reads only its card\'s title and notes, so put each card\'s full instructions in the notes: what to do, which files, what "done" looks like. Comments are for your log, not for instructions. When a starter card from the template matches part of the brief, edit it with board_edit_card (new title and notes) and use it; when it doesn\'t, leave it where it is (out of Planned) and leave it out of your plan and digests. Never move a card to Done unless its work was done, and never hand out a card with empty notes.\nYou have no shell: you cannot run tests, builds or commands. When you review, report what the worker\'s result and the files show and say whose result it is ("per Martin\'s card, 13 tests pass"); never say you ran or verified something yourself. Cards run one at a time, in board order; put the card others depend on first.\nWhen a card needs something the team may not have, put it in the card\'s needs (board_add_card or board_edit_card): a tool (Playwright, a browser; GitHub; Linear; Stripe) or a skill from the library, by name. If the plan needs a tool or skill the roster lacks, send one message_boss with kind "needs" before you say the plan is ready: say what and why in the text, and put "Add <name>" for each in options plus "Plan without them". The boss adds them in the app and Tyslin tells you what was added; never ask the boss to install anything by hand.')
  } else if (agency) {
    parts.push(`## Your agency\nYou work in the agency "${agency.name}"${agency.goal ? ` (goal: ${agency.goal})` : ''}. You report to the Lead, never to the boss. Put your result on the card you were given (your reply is saved on it). Never edit or move anything in the boards/ folder: Tyslin moves your card to Review when you finish, and only the Lead changes the board.`)
  }
  // What the Lead asks before planning a new brief; read from the template on every run so older agencies get it.
  if (agency && agency.leadId === agent.id) {
    const intake = intakeInstructions(AGENCY_TEMPLATES.find((t) => t.id === agency.templateId))
    if (intake) parts.push(intake)
  }
  // Agency pages: agencies created before their template had pages don't have the paragraph in their saved instructions.
  if (agency && !agent.instructions.includes('## Agency pages')) {
    const pages = pageInstructions(templatePages(agency.templateId))
    if (pages) parts.push(pages)
  }
  // Agency memory (memory/agency.md and the agent's own file), written on the Memory screen.
  const memory = memoryPrompt(agent)
  if (memory) parts.push(memory)
  if (project) {
    parts.push(`## Project\nYou are working in the project "${project.name}".`)
    if (project.folder) {
      const files = listProjectFiles(project.folder)
      parts.push(`Project folder: ${project.folder}\nFiles:\n` + (files.length ? files.map((f) => `- ${f}`).join('\n') : '(empty)'))
      parts.push((agent.writeMode === 'ask'
        ? 'You can read and change files with your tools. The user reviews every change before it is written, so propose complete, focused edits and explain them briefly.'
        : 'You can read and change files with your tools. Changes are written straight to disk.')
        + (agent.engine !== 'builtin' ? ' Create and change files only with your file tools (write_file, edit_file), never through the shell: no echo/cat/tee redirection, no python or node one-liners that write files, no touch. Shell writes skip the review and the Changes panel. The shell is for reading, tests and builds.' : ''))
    }
  }
  return parts.join('\n\n')
}

/** File tools are offered only when the project is linked to a folder. */
function toolsFor(opts: RunOptions): { defs: ToolDef[]; ctx: ToolContext } | null {
  if (!opts.project?.folder || !opts.agent.tools.read) return null
  const agency = opts.agent.agency ? getAgency(opts.agent.agency) : null
  const lead = !!agency && agency.leadId === opts.agent.id
  return {
    // "Change project files" off: only the reading tools. The agency Lead also gets the board tools.
    defs: [...(opts.agent.tools.write ? FILE_TOOLS : FILE_TOOLS.filter((t) => t.name === 'list_files' || t.name === 'read_file')), ...(lead ? BOARD_TOOLS : [])],
    ctx: { agent: opts.agent, project: opts.project, runId: opts.runId, sessionId: opts.sessionId, emit: opts.emit, agency: lead ? agency! : undefined }
  }
}

/** The user's words plus the text of anything they attached. */
function messageText(m: ModelMessage): string {
  if (!m.context) return m.content
  return m.content.trim() ? `${m.content}\n\n${m.context}` : m.context
}

function images(m: ModelMessage): { mime: string; data: string }[] {
  return m.role === 'user' ? m.attachments.map(readImage).filter((x) => x !== null) : []
}

function anthropicMessage(m: ModelMessage): unknown {
  const imgs = images(m)
  const text = messageText(m)
  if (!imgs.length) return { role: m.role, content: text }
  return {
    role: m.role,
    content: [
      ...imgs.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.data } })),
      ...(text ? [{ type: 'text', text }] : [])
    ]
  }
}

function openAIMessage(m: ModelMessage): unknown {
  const imgs = images(m)
  const text = messageText(m)
  if (!imgs.length) return { role: m.role, content: text }
  return {
    role: m.role,
    content: [
      ...(text ? [{ type: 'text', text }] : []),
      ...imgs.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.data}` } }))
    ]
  }
}

function parseArgs(json: string): Record<string, unknown> {
  try {
    const v = JSON.parse(json || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

/**
 * How long a model stream may send nothing before the reply is ended with an error. Thinking models can be quiet for
 * a while, so this is generous; it exists because a stream that never sends again otherwise sat on "Thinking" until
 * Stop (QA, 10 Nov 2026: gemini-3.1-pro-preview with tools, also hung over plain curl).
 */
export const STREAM_IDLE_MS = 180_000

async function* sseLines(res: Response): AsyncGenerator<string> {
  if (!res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    let timer: NodeJS.Timeout | undefined
    const idle = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`The model sent nothing for ${STREAM_IDLE_MS / 60_000} minutes, so the reply was stopped. Send it again, or pick another model for this agent.`)), STREAM_IDLE_MS)
    })
    let chunk: ReadableStreamReadResult<Uint8Array>
    try { chunk = await Promise.race([reader.read(), idle]) } catch (err) { void reader.cancel().catch(() => undefined); throw err } finally { clearTimeout(timer) }
    const { value, done } = chunk
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let i: number
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (line.startsWith('data:')) yield line.slice(5).trim()
    }
  }
}

/** Emits text deltas, putting a blank line between turns so the stream matches the saved reply. */
function textEmitter(emit: RunOptions['emit'], texts: string[]): (t: string) => void {
  let first = true
  return (t) => {
    if (first && texts.length) emit({ type: 'text_delta', text: '\n\n' })
    first = false
    emit({ type: 'text_delta', text: t })
  }
}

function* parsed(data: string): Generator<any> {
  try {
    yield JSON.parse(data)
  } catch { /* partial line */ }
}

class AnthropicRuntime implements AgentRuntime {
  async run(opts: RunOptions): Promise<string> {
    const { agent, skills, project, history, emit, signal } = opts
    const key = getSecret('anthropic')
    if (!key) throw new Error('Add your Anthropic API key in Settings.')
    const tools = toolsFor(opts)
    const messages: unknown[] = history.map(anthropicMessage)
    const texts: string[] = []

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await fetchRetry('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: agent.model,
          max_tokens: 8192,
          stream: true,
          system: systemPrompt(agent, skills, project),
          messages,
          ...(tools && { tools: tools.defs.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) })
        })
      })
      if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`)

      // Content blocks by stream index, rebuilt so the turn can be sent back with its tool results.
      const blocks: { type: string; text?: string; id?: string; name?: string; json?: string }[] = []
      let stop = ''
      const say = textEmitter(emit, texts)
      for await (const data of sseLines(res)) {
        for (const ev of parsed(data)) {
          if (ev.type === 'content_block_start') {
            const b = ev.content_block
            blocks[ev.index] = b.type === 'tool_use' ? { type: 'tool_use', id: b.id, name: b.name, json: '' } : { type: b.type, text: '' }
            if (b.type === 'tool_use') emit({ type: 'tool_call_start', toolCallId: b.id, name: b.name })
          } else if (ev.type === 'content_block_delta') {
            const b = blocks[ev.index]
            if (ev.delta?.type === 'text_delta' && b) {
              b.text += ev.delta.text
              say(ev.delta.text)
            } else if (ev.delta?.type === 'input_json_delta' && b) {
              b.json += ev.delta.partial_json
              emit({ type: 'tool_call_args', toolCallId: b.id!, delta: ev.delta.partial_json })
            }
          } else if (ev.type === 'content_block_stop') {
            const b = blocks[ev.index]
            if (b?.type === 'tool_use') emit({ type: 'tool_call_end', toolCallId: b.id! })
          } else if (ev.type === 'message_start') {
            const u = ev.message?.usage
            if (u) emit({ type: 'usage', inputTokens: Number(u.input_tokens ?? 0) + Number(u.cache_read_input_tokens ?? 0) + Number(u.cache_creation_input_tokens ?? 0), outputTokens: 0 })
          } else if (ev.type === 'message_delta') {
            stop = ev.delta?.stop_reason ?? stop
            if (ev.usage?.output_tokens) emit({ type: 'usage', inputTokens: 0, outputTokens: Number(ev.usage.output_tokens) })
          } else if (ev.type === 'error') {
            throw new Error(ev.error?.message ?? 'Model error')
          }
        }
      }

      const text = blocks.filter((b) => b?.type === 'text').map((b) => b.text).join('')
      if (text) texts.push(text)
      const calls: ToolCall[] = blocks.filter((b) => b?.type === 'tool_use').map((b) => ({ id: b.id!, name: b.name!, input: parseArgs(b.json!) }))
      if (stop !== 'tool_use' || !calls.length || !tools) return texts.join('\n\n')

      messages.push({
        role: 'assistant',
        content: blocks.filter(Boolean).map((b) => b.type === 'tool_use'
          ? { type: 'tool_use', id: b.id, name: b.name, input: parseArgs(b.json!) }
          : { type: 'text', text: b.text })
          .filter((b) => b.type !== 'text' || b.text)
      })
      const results = await runTools(calls, tools.ctx)
      messages.push({
        role: 'user',
        content: results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.content, is_error: r.isError }))
      })
    }
    return outOfTurns(texts)
  }
}

class OpenAICompatibleRuntime implements AgentRuntime {
  constructor(private kind: 'openai' | 'gemini' | 'ollama' | 'openrouter') {}

  async run(opts: RunOptions): Promise<string> {
    const { agent, skills, project, history, emit, signal } = opts
    let base = 'https://api.openai.com/v1'
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (this.kind === 'openai' || this.kind === 'gemini' || this.kind === 'openrouter') {
      const key = getSecret(this.kind)
      if (!key) throw new Error(`Add your ${this.kind === 'openai' ? 'OpenAI' : this.kind === 'gemini' ? 'Google Gemini' : 'OpenRouter'} API key in Settings.`)
      headers.authorization = `Bearer ${key}`
      if (this.kind === 'gemini') base = 'https://generativelanguage.googleapis.com/v1beta/openai'
      if (this.kind === 'openrouter') {
        base = 'https://openrouter.ai/api/v1'
        // OpenRouter asks apps to identify themselves (shown on its usage pages); no user data in these.
        headers['HTTP-Referer'] = 'https://tyslin.ai'
        headers['X-Title'] = 'Tyslin Studio'
      }
    } else {
      base = (getSetting('ollamaUrl') || 'http://localhost:11434').replace(/\/$/, '') + '/v1'
    }
    let tools = toolsFor(opts)
    const messages: unknown[] = [
      { role: 'system', content: systemPrompt(agent, skills, project) },
      ...history.map(openAIMessage)
    ]
    const texts: string[] = []

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await fetchRetry(`${base}/chat/completions`, {
        method: 'POST',
        signal,
        headers,
        body: JSON.stringify({
          model: agent.model,
          stream: true,
          messages,
          // Token counts in the last chunk, for cost estimates (Gemini's OpenAI endpoint rejects the option).
          ...(this.kind !== 'gemini' && { stream_options: { include_usage: true } }),
          // OpenRouter adds what it billed for the request (`usage.cost`, USD) to that last chunk.
          ...(this.kind === 'openrouter' && { usage: { include: true } }),
          ...(tools && { tools: tools.defs.map((t) => ({ type: 'function', function: t })) })
        })
      })
      if (!res.ok) {
        const body = await res.text()
        // Many local models can't call tools; carry on as plain chat rather than failing.
        if (tools && this.kind === 'ollama' && /does not support tools/i.test(body)) {
          tools = null
          turn--
          continue
        }
        if (this.kind === 'openrouter') throw new Error(openRouterError(`error ${res.status}: ${body}`, agent.model) ?? `OpenRouter error ${res.status}: ${body.slice(0, 400)}`)
        throw new Error(`${this.kind} error ${res.status}: ${body}`)
      }

      let text = ''
      let finish = ''
      const say = textEmitter(emit, texts)
      // extra: provider data to echo back (Gemini 3 rejects the next turn without its thought_signature).
      const calls: { id: string; name: string; args: string; extra?: unknown }[] = []
      for await (const data of sseLines(res)) {
        if (data === '[DONE]') break
        for (const chunk of parsed(data)) {
          // OpenRouter sends errors that happen after the stream started as a chunk with `error` (e.g. credits ran out).
          const streamErr = (chunk as { error?: { code?: number | string; message?: string } }).error
          if (streamErr) {
            const raw = `error ${streamErr.code ?? ''}: ${streamErr.message ?? ''}`
            throw new Error((this.kind === 'openrouter' ? openRouterError(raw, agent.model) : null) ?? `${this.kind} ${raw}`)
          }
          if (chunk.usage) {
            const billed = this.kind === 'openrouter' ? Number((chunk.usage as { cost?: unknown }).cost) : NaN
            emit({ type: 'usage', inputTokens: Number(chunk.usage.prompt_tokens ?? 0), outputTokens: Number(chunk.usage.completion_tokens ?? 0),
              ...(Number.isFinite(billed) && billed >= 0 ? { cost: billed, costSource: 'actual' as const } : {}) })
          }
          const choice = chunk.choices?.[0]
          const delta = choice?.delta
          if (delta?.content) {
            text += delta.content
            say(delta.content)
          }
          for (const tc of delta?.tool_calls ?? []) {
            const i = tc.index ?? calls.length
            if (!calls[i]) {
              calls[i] = { id: tc.id || `call_${opts.runId.slice(0, 8)}_${turn}_${i}`, name: tc.function?.name ?? '', args: '' }
              emit({ type: 'tool_call_start', toolCallId: calls[i].id, name: calls[i].name })
            }
            if (tc.extra_content) calls[i].extra = tc.extra_content
            if (tc.function?.arguments) {
              calls[i].args += tc.function.arguments
              emit({ type: 'tool_call_args', toolCallId: calls[i].id, delta: tc.function.arguments })
            }
          }
          if (choice?.finish_reason) finish = choice.finish_reason
        }
      }
      for (const c of calls) if (c) emit({ type: 'tool_call_end', toolCallId: c.id })

      if (text) texts.push(text)
      const live = calls.filter(Boolean)
      if (!live.length || !tools || (finish && finish !== 'tool_calls' && finish !== 'stop')) return texts.join('\n\n')

      messages.push({
        role: 'assistant',
        content: text || null,
        tool_calls: live.map((c) => ({
          id: c.id, type: 'function', function: { name: c.name, arguments: c.args || '{}' },
          ...(c.extra !== undefined && { extra_content: c.extra })
        }))
      })
      const results = await runTools(live.map((c) => ({ id: c.id, name: c.name, input: parseArgs(c.args) })), tools.ctx)
      for (const r of results) messages.push({ role: 'tool', tool_call_id: r.id, content: r.content })
    }
    return outOfTurns(texts)
  }
}

/** Permission requests from external agents, waiting for the user's answer. */
const permissions = new Map<string, { runId: string; sessionId: string; title: string; choices: PermissionChoice[]; toolCallId: string; askedAt: number; done: (choiceId: string | null) => void }>()

export function answerPermission(permissionId: string, choiceId: string | null): void {
  permissions.get(permissionId)?.done(choiceId)
  permissions.delete(permissionId)
}

/** Every request still waiting, oldest first, so a task can show them again after the screen was away (10 Nov 2026). */
export function pendingPermissions(): PendingPermission[] {
  return [...permissions.entries()].map(([id, p]) => ({ id, sessionId: p.sessionId, runId: p.runId, toolCallId: p.toolCallId, title: p.title, choices: p.choices, askedAt: p.askedAt })).sort((a, b) => a.askedAt - b.askedAt)
}

/** The adapter's own "allow once" choice, when it offers one, for a command Tyslin answers on the user's behalf. */
function allowOnceChoice(choices: PermissionChoice[]): PermissionChoice | undefined {
  return choices.find((c) => c.kind === 'allow_once') ?? choices.find((c) => c.kind.startsWith('allow'))
}

/** Declines every open permission request of a stopped run. */
export function cancelRunPermissions(runId: string): void {
  for (const [id, p] of permissions) if (p.runId === runId) answerPermission(id, null)
}

/** Most recent turns, newest last, within a rough size budget. */
const HISTORY_CHARS = 30_000

/**
 * ACP sessions start fresh each run, so the agent's role and the conversation so far go into
 * the prompt itself.
 */
function acpPrompt(opts: RunOptions): string {
  const [latest, ...older] = [...opts.history].reverse()
  const turns: string[] = []
  let size = 0
  for (const m of older) {
    const line = `${m.role === 'user' ? 'User' : 'You'}: ${messageText(m)}`
    if (size + line.length > HISTORY_CHARS) break
    turns.unshift(line)
    size += line.length
  }
  return [
    `# Your role (set in Tyslin Studio)\n${systemPrompt(opts.agent, opts.skills, opts.project)}`,
    turns.length ? `# Conversation so far\n${turns.join('\n\n')}` : '',
    `# New message from the user\n${latest ? messageText(latest) : ''}`
  ].filter(Boolean).join('\n\n')
}

class AcpRuntime implements AgentRuntime {
  constructor(private engine: ExternalEngineId) {}

  async run(opts: RunOptions): Promise<string> {
    const { name } = engineStatus(this.engine)
    const folder = opts.project?.folder ?? null
    const launch = engineLaunch(this.engine, folder ?? homedir(), opts.agent)
    const access = folder && opts.agent.tools.read
      ? acpFileAccess({ agent: opts.agent, project: opts.project!, runId: opts.runId, sessionId: opts.sessionId, emit: opts.emit })
      : null
    // Gemini CLI's write_file reads the file first and treats only an ENOENT-like error as "new file"; over ACP the
    // error arrives as a plain object, so every new file failed with "Error checking existing file" (gemini 0.67,
    // 10 Nov 2026). For Gemini CLI a missing file reads as empty, so the write goes ahead; other adapters keep the error.
    const read = access && this.engine === 'gemini-cli'
      ? (abs: string, line?: number | null, limit?: number | null): string => {
          try { return access.read(abs, line, limit) } catch (err) { if (err instanceof Error && /does not exist$/.test(err.message)) return ''; throw err }
        }
      : access?.read
    const files = access && { read: read!, write: opts.agent.tools.write ? access.write : undefined }

    const requestPermission = (title: string, choices: PermissionChoice[], toolCallId: string): Promise<string | null> => {
      // Looking at files inside the folder and version checks don't need the user (Settings → Notifications → Approvals).
      const allow = allowOnceChoice(choices)
      if (allow && getPrefs().autoAllowReadOnly && isReadOnlyCommand(title)) {
        opts.emit({ type: 'tool_result', toolCallId, content: `Allowed without asking (read-only): ${title}`, isError: false })
        return Promise.resolve(allow.id)
      }
      const permissionId = randomUUID()
      const answer = new Promise<string | null>((done) => permissions.set(permissionId, { runId: opts.runId, sessionId: opts.sessionId, title, choices, toolCallId, askedAt: Date.now(), done }))
      opts.emit({ type: 'state_update', status: 'waiting_for_review' })
      opts.emit({ type: 'approval_needed', toolCallId, permissionId, title, choices })
      return answer.finally(() => opts.emit({ type: 'state_update', status: 'running' }))
    }

    // OpenRouter runs pick their model through the environment and config (engines.ts openRouterEnv); the slug isn't
    // in the adapter's own model list, so it isn't chosen over ACP. Their errors are put in plain words.
    const viaOpenRouter = usesOpenRouter(opts.agent)
    // The adapter's last words: Claude Code prints "Failed to authenticate. API Error: 401 …" and then exits, so the
    // thrown error alone only says "exit code 1".
    let tail = ''
    const emit: RunOptions['emit'] = viaOpenRouter ? (e) => { if (e.type === 'text_delta') tail = (tail + e.text).slice(-2000); opts.emit(e) } : opts.emit
    const turn = runAcpTurn({
      name,
      launch,
      prompt: acpPrompt(opts),
      clientVersion: app.getVersion(),
      signal: opts.signal,
      mcpServers: acpServersForAgent(opts.agent.id),
      // The agent's model, when the adapter lets clients choose among its models (Codex does); else its default.
      model: viaOpenRouter ? undefined : opts.agent.model,
      autoEdit: opts.agent.writeMode === 'direct' && !!files?.write,
      host: { emit, readTextFile: files?.read, writeTextFile: files?.write, requestPermission }
    })
    if (!viaOpenRouter) return turn
    return turn.catch((err: unknown) => {
      const text = err instanceof Error ? err.message : String(err)
      // codex-acp turns OpenRouter's 401 into ACP's "Authentication required", which acp.ts words as "sign in first".
      const plain = openRouterError(text, opts.agent.model) ?? openRouterError(tail, opts.agent.model)
        ?? (/sign in first|Authentication required/i.test(text) ? openRouterError('error 401', opts.agent.model) : null)
      throw plain ? new Error(`${name} on OpenRouter: ${plain}`) : err
    })
  }
}

export function runtimeFor(agent: Agent): AgentRuntime {
  if (agent.engine !== 'builtin') return new AcpRuntime(agent.engine)
  switch (agent.provider) {
    case 'anthropic': return new AnthropicRuntime()
    case 'openai': return new OpenAICompatibleRuntime('openai')
    case 'openrouter': return new OpenAICompatibleRuntime('openrouter')
    case 'gemini': return new OpenAICompatibleRuntime('gemini')
    case 'ollama': return new OpenAICompatibleRuntime('ollama')
  }
}
