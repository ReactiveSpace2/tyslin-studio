import type { Agent, Message, Project, RunEventBody, Skill } from '@shared/types'
import { getSecret } from './secrets'
import { getSetting } from './db'
import { FILE_TOOLS, listProjectFiles, runTools, type ToolCall, type ToolContext, type ToolDef } from './tools'

/**
 * AgentRuntime is the seam between Tyslin and whatever runs the agent loop.
 * This MVP ships a direct model runtime (Anthropic + OpenAI-compatible, incl. Ollama) with file tools.
 * A Goose/ACP runtime can implement the same interface later (see README).
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
  history: Message[]
  emit: (e: RunEventBody) => void
  signal?: AbortSignal
}

/** Model turns per run, so a confused agent can't loop forever. */
const MAX_TURNS = 12

function systemPrompt(agent: Agent, skills: Skill[], project: Project | null): string {
  const parts = [agent.instructions.trim() || `You are ${agent.name}.`]
  const used = skills.filter((s) => agent.skills.includes(s.name))
  if (used.length) {
    parts.push('## Skills\n' + used.map((s) => `### ${s.name}\n${s.body}`).join('\n\n'))
  }
  if (project) {
    parts.push(`## Project\nYou are working in the project "${project.name}".`)
    if (project.folder) {
      const files = listProjectFiles(project.folder)
      parts.push(`Project folder: ${project.folder}\nFiles:\n` + (files.length ? files.map((f) => `- ${f}`).join('\n') : '(empty)'))
      parts.push(agent.writeMode === 'ask'
        ? 'You can read and change files with your tools. The user reviews every change before it is written, so propose complete, focused edits and explain them briefly.'
        : 'You can read and change files with your tools. Changes are written straight to disk.')
    }
  }
  return parts.join('\n\n')
}

/** File tools are offered only when the project is linked to a folder. */
function toolsFor(opts: RunOptions): { defs: ToolDef[]; ctx: ToolContext } | null {
  if (!opts.project?.folder) return null
  return {
    defs: FILE_TOOLS,
    ctx: { agent: opts.agent, project: opts.project, runId: opts.runId, sessionId: opts.sessionId, emit: opts.emit }
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

async function* sseLines(res: Response): AsyncGenerator<string> {
  if (!res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
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
    const messages: unknown[] = history.map((m) => ({ role: m.role, content: m.content }))
    const texts: string[] = []

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
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
          } else if (ev.type === 'message_delta') {
            stop = ev.delta?.stop_reason ?? stop
          } else if (ev.type === 'error') {
            throw new Error(ev.error?.message ?? 'Model error')
          }
        }
      }

      const text = blocks.filter((b) => b?.type === 'text').map((b) => b.text).join('')
      if (text) texts.push(text)
      const calls: ToolCall[] = blocks.filter((b) => b?.type === 'tool_use').map((b) => ({ id: b.id!, name: b.name!, input: parseArgs(b.json!) }))
      if (stop !== 'tool_use' || !calls.length || !tools) break

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
    return texts.join('\n\n')
  }
}

class OpenAICompatibleRuntime implements AgentRuntime {
  constructor(private kind: 'openai' | 'ollama') {}

  async run(opts: RunOptions): Promise<string> {
    const { agent, skills, project, history, emit, signal } = opts
    let base = 'https://api.openai.com/v1'
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (this.kind === 'openai') {
      const key = getSecret('openai')
      if (!key) throw new Error('Add your OpenAI API key in Settings.')
      headers.authorization = `Bearer ${key}`
    } else {
      base = (getSetting('ollamaUrl') || 'http://localhost:11434').replace(/\/$/, '') + '/v1'
    }
    let tools = toolsFor(opts)
    const messages: unknown[] = [
      { role: 'system', content: systemPrompt(agent, skills, project) },
      ...history.map((m) => ({ role: m.role, content: m.content }))
    ]
    const texts: string[] = []

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        signal,
        headers,
        body: JSON.stringify({
          model: agent.model,
          stream: true,
          messages,
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
        throw new Error(`${this.kind} error ${res.status}: ${body}`)
      }

      let text = ''
      let finish = ''
      const say = textEmitter(emit, texts)
      const calls: { id: string; name: string; args: string }[] = []
      for await (const data of sseLines(res)) {
        if (data === '[DONE]') break
        for (const chunk of parsed(data)) {
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
      if (!live.length || !tools || (finish && finish !== 'tool_calls' && finish !== 'stop')) break

      messages.push({
        role: 'assistant',
        content: text || null,
        tool_calls: live.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args || '{}' } }))
      })
      const results = await runTools(live.map((c) => ({ id: c.id, name: c.name, input: parseArgs(c.args) })), tools.ctx)
      for (const r of results) messages.push({ role: 'tool', tool_call_id: r.id, content: r.content })
    }
    return texts.join('\n\n')
  }
}

export function runtimeFor(agent: Agent): AgentRuntime {
  switch (agent.provider) {
    case 'anthropic': return new AnthropicRuntime()
    case 'openai': return new OpenAICompatibleRuntime('openai')
    case 'ollama': return new OpenAICompatibleRuntime('ollama')
  }
}
