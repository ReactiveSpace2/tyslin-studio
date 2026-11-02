import { readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import type { Agent, Message, Project, Skill } from '@shared/types'
import { getSecret } from './secrets'
import { getSetting } from './db'

/**
 * AgentRuntime is the seam between Tyslin and whatever runs the agent loop.
 * This MVP ships a direct model runtime (Anthropic + OpenAI-compatible, incl. Ollama).
 * A Goose/ACP runtime can implement the same interface later (see README).
 */
export interface AgentRuntime {
  run(opts: RunOptions): Promise<string>
}

export interface RunOptions {
  agent: Agent
  skills: Skill[]
  project: Project | null
  history: Message[]
  onDelta: (text: string) => void
  signal?: AbortSignal
}

export function listProjectFiles(folder: string, limit = 200): string[] {
  const out: string[] = []
  const skip = new Set(['node_modules', '.git', 'dist', 'out', '.next'])
  const walk = (dir: string, depth: number): void => {
    if (out.length >= limit || depth > 4) return
    let entries: string[] = []
    try { entries = readdirSync(dir) } catch { return }
    for (const name of entries) {
      if (out.length >= limit) return
      if (name.startsWith('.') || skip.has(name)) continue
      const full = join(dir, name)
      try {
        if (statSync(full).isDirectory()) walk(full, depth + 1)
        else out.push(relative(folder, full))
      } catch { /* unreadable entry */ }
    }
  }
  walk(folder, 0)
  return out
}

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
    }
  }
  return parts.join('\n\n')
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

class AnthropicRuntime implements AgentRuntime {
  async run({ agent, skills, project, history, onDelta, signal }: RunOptions): Promise<string> {
    const key = getSecret('anthropic')
    if (!key) throw new Error('Add your Anthropic API key in Settings.')
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: agent.model,
        max_tokens: 4096,
        stream: true,
        system: systemPrompt(agent, skills, project),
        messages: history.map((m) => ({ role: m.role, content: m.content }))
      })
    })
    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`)
    let text = ''
    for await (const data of sseLines(res)) {
      try {
        const ev = JSON.parse(data)
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          text += ev.delta.text
          onDelta(ev.delta.text)
        } else if (ev.type === 'error') {
          throw new Error(ev.error?.message ?? 'Model error')
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue
        throw e
      }
    }
    return text
  }
}

class OpenAICompatibleRuntime implements AgentRuntime {
  constructor(private kind: 'openai' | 'ollama') {}
  async run({ agent, skills, project, history, onDelta, signal }: RunOptions): Promise<string> {
    let base = 'https://api.openai.com/v1'
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (this.kind === 'openai') {
      const key = getSecret('openai')
      if (!key) throw new Error('Add your OpenAI API key in Settings.')
      headers.authorization = `Bearer ${key}`
    } else {
      base = (getSetting('ollamaUrl') || 'http://localhost:11434').replace(/\/$/, '') + '/v1'
    }
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal,
      headers,
      body: JSON.stringify({
        model: agent.model,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt(agent, skills, project) },
          ...history.map((m) => ({ role: m.role, content: m.content }))
        ]
      })
    })
    if (!res.ok) throw new Error(`${this.kind} error ${res.status}: ${await res.text()}`)
    let text = ''
    for await (const data of sseLines(res)) {
      if (data === '[DONE]') break
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content
        if (delta) {
          text += delta
          onDelta(delta)
        }
      } catch { /* partial line */ }
    }
    return text
  }
}

export function runtimeFor(agent: Agent): AgentRuntime {
  switch (agent.provider) {
    case 'anthropic': return new AnthropicRuntime()
    case 'openai': return new OpenAICompatibleRuntime('openai')
    case 'ollama': return new OpenAICompatibleRuntime('ollama')
  }
}
