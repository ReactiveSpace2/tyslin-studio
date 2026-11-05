import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { AskResult, AutoEdge, AutoNode, AutomationDoc, AutomationProgress, Project, WorkflowDoc } from '@shared/types'
import { nextRunAfter } from '@shared/schedule'
import * as db from './db'
import { listStudioFiles, projectFor, readStudioFile, writeStudioFile } from './studio'

/**
 * Automation runs: start at the trigger nodes and follow the connections, each node getting the text
 * the node before it produced. Agent nodes go through askAgent (so chats, the status bar, Stop and reviews
 * work as usual); file writes stay inside the project folder; schedules fire from the app's scheduler tick.
 */

export interface AutomationDeps {
  ask: (agentId: string, projectId: string | null, prompt: string, title: string, onSession?: (id: string) => void) => Promise<AskResult>
  /** Stops a chat that is still replying. */
  stopSession: (sessionId: string) => void
  sendTelegram: (text: string) => Promise<number>
  emit: (p: AutomationProgress) => void
}

const MAX_STEPS = 200
const HTTP_LIMIT = 200_000

interface Run { stopped: boolean; sessionId?: string; timer?: () => void; key: string }
const runs = new Map<string, Run>()
/** projectId + path of automations running now, so a schedule never starts a second copy. */
const busy = new Set<string>()

export function parseAutomation(text: string): AutomationDoc {
  const j = JSON.parse(text) as Partial<AutomationDoc>
  return { version: 1, active: !!j.active, nodes: Array.isArray(j.nodes) ? j.nodes : [], edges: Array.isArray(j.edges) ? j.edges : [] }
}

const pad = (n: number): string => String(n).padStart(2, '0')
const dateStr = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const timeStr = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** {{input}}, {{node.Name}}, {{date}}, {{time}}. Unknown names stay as they are. */
export function render(tpl: string, input: string, outputs: Map<string, string>): string {
  const now = new Date()
  return String(tpl ?? '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (all, key: string) => {
    if (key === 'input') return input
    if (key === 'date') return dateStr(now)
    if (key === 'time') return timeStr(now)
    if (key.startsWith('node.')) return outputs.get(key.slice(5).trim()) ?? all
    return all
  })
}

const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : d)

function check(op: string, value: string, input: string): boolean {
  const a = input.trim(), b = value.trim()
  switch (op) {
    case 'not_contains': return !a.toLowerCase().includes(b.toLowerCase())
    case 'equals': return a === b
    case 'regex': try { return new RegExp(b, 'i').test(a) } catch { throw new Error(`"${b}" is not a valid pattern.`) }
    case 'empty': return a === ''
    case 'not_empty': return a !== ''
    default: return a.toLowerCase().includes(b.toLowerCase())
  }
}

const sleep = (ms: number, run: Run): Promise<void> => new Promise((resolve) => {
  const t = setTimeout(() => { run.timer = undefined; resolve() }, ms)
  run.timer = () => { clearTimeout(t); resolve() }
})

/** Runs one node. Returns its output and, for If, which branch to follow. */
async function runNode(n: AutoNode, input: string, outputs: Map<string, string>, ctx: { projectId: string; title: string; run: Run; deps: AutomationDeps; onSession: (id: string) => void }): Promise<{ output: string; port?: 'true' | 'false' }> {
  const c = n.config ?? {}
  const t = (k: string): string => render(str(c[k]), input, outputs)
  switch (n.type) {
    case 'manual':
    case 'schedule':
      return { output: t('text') }
    case 'template':
      return { output: t('text') }
    case 'agent': {
      const prompt = t('prompt').trim() || input
      if (!prompt.trim()) throw new Error('Nothing to send: write a prompt, or connect a node that produces text.')
      const r = await ctx.deps.ask(str(c.agentId, 'default'), ctx.projectId, prompt, `${ctx.title} · ${n.name}`, ctx.onSession)
      if (!r.ok) throw Object.assign(new Error(r.error ?? 'The agent could not answer.'), { sessionId: r.sessionId })
      return { output: r.reply.trim() }
    }
    case 'http': {
      const url = t('url').trim()
      if (!/^https?:\/\//i.test(url)) throw new Error('The URL must start with http:// or https://.')
      const method = (str(c.method, 'GET').toUpperCase().match(/^(GET|POST|PUT|PATCH|DELETE)$/) ?? ['GET'])[0]
      let headers: Record<string, string> = {}
      const h = t('headers').trim()
      if (h) {
        try { headers = JSON.parse(h) as Record<string, string> } catch { throw new Error('Headers must be JSON, e.g. {"Authorization": "Bearer …"}.') }
      }
      const body = method === 'GET' || method === 'DELETE' ? undefined : t('body')
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), 30_000)
      ctx.run.timer = () => ac.abort()
      try {
        const res = await fetch(url, { method, headers, body, signal: ac.signal })
        const text = (await res.text()).slice(0, HTTP_LIMIT)
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`)
        return { output: text }
      } catch (e) {
        if (ac.signal.aborted) throw new Error(ctx.run.stopped ? 'Stopped.' : 'The request took longer than 30 seconds.')
        throw e
      } finally {
        clearTimeout(timer)
        ctx.run.timer = undefined
      }
    }
    case 'condition': {
      const ok = check(str(c.op, 'contains'), t('value'), input)
      return { output: input, port: ok ? 'true' : 'false' }
    }
    case 'file': {
      const path = t('path').trim().replace(/^[/\\]+/, '')
      if (!path) throw new Error('Give the file a path inside the project folder, e.g. reports/{{date}}.md.')
      const content = t('content') || input
      let text = content
      if (str(c.mode) === 'append') {
        try { text = readStudioFile(ctx.projectId, path) + (content.startsWith('\n') ? '' : '\n') + content } catch { /* new file */ }
      }
      writeStudioFile(ctx.projectId, { path }, text)
      return { output: input, }
    }
    case 'telegram': {
      const text = t('text') || input
      const n2 = await ctx.deps.sendTelegram(text)
      return { output: `Sent to ${n2} ${n2 === 1 ? 'chat' : 'chats'}.\n\n${text}` }
    }
    case 'wait': {
      const s = Math.min(3600, Math.max(0, Number(c.seconds) || 0))
      await sleep(s * 1000, ctx.run)
      return { output: input }
    }
  }
}

/**
 * Runs an automation from its triggers. Manual runs start at every trigger; scheduled runs only at
 * schedule triggers. Writes a Markdown log to automations/runs/.
 */
export async function runAutomation(runId: string, projectId: string | null, path: string, trigger: 'manual' | 'schedule', deps: AutomationDeps): Promise<void> {
  const project = projectFor(projectId)
  const key = `${project.id}:${path}`
  const run: Run = { stopped: false, key }
  runs.set(runId, run)
  busy.add(key)
  const base = { runId, path, projectId: project.id, trigger }
  const send = (p: Omit<AutomationProgress, 'runId' | 'path' | 'projectId' | 'trigger'>): void => deps.emit({ ...base, ...p })
  const title = path.split('/').pop()!.replace(/\.automation\.json$/, '')
  const started = new Date()
  const log = [`# ${title}`, `${trigger === 'schedule' ? 'Scheduled run' : 'Run'} on ${started.toLocaleString()}`, '']
  let status: AutomationProgress['status'] = 'done'
  let error: string | undefined
  try {
    const doc = parseAutomation(readStudioFile(project.id, path))
    const starts = doc.nodes.filter((n) => (trigger === 'schedule' ? n.type === 'schedule' : n.type === 'manual' || n.type === 'schedule'))
    if (!starts.length) throw new Error('Add a trigger (Manual or Schedule) to start the automation.')
    const outputs = new Map<string, string>()
    const queue: { node: AutoNode; input: string }[] = starts.map((node) => ({ node, input: '' }))
    let steps = 0
    while (queue.length) {
      if (run.stopped) { status = 'stopped'; break }
      if (++steps > MAX_STEPS) throw new Error(`Stopped after ${MAX_STEPS} steps.`)
      const { node, input } = queue.shift()!
      send({ nodeId: node.id, status: 'running' })
      let sessionId: string | undefined
      try {
        const r = await runNode(node, input, outputs, { projectId: project.id, title, run, deps, onSession: (id) => { sessionId = id; run.sessionId = id } })
        run.sessionId = undefined
        if (run.stopped) { status = 'stopped'; send({ nodeId: node.id, status: 'stopped', sessionId }); break }
        outputs.set(node.name, r.output)
        send({ nodeId: node.id, status: 'done', output: r.output, sessionId })
        log.push(`## ${node.name}${r.port ? ` → ${r.port}` : ''}`, '', r.output.trim() ? r.output.trim().slice(0, 20_000) : '_(no output)_', '')
        const next = doc.edges.filter((e: AutoEdge) => e.from === node.id && (r.port ? e.port === r.port : e.port === 'out'))
        for (const e of next) {
          const to = doc.nodes.find((n) => n.id === e.to)
          if (to && to.type !== 'manual' && to.type !== 'schedule') queue.push({ node: to, input: r.output })
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        const sid = (e as { sessionId?: string }).sessionId ?? sessionId
        status = run.stopped ? 'stopped' : 'failed'
        error = `${node.name}: ${message}`
        send({ nodeId: node.id, status, error: message, sessionId: sid })
        log.push(`## ${node.name}`, '', `**${status === 'stopped' ? 'Stopped' : 'Failed'}:** ${message}`, '')
        break
      }
    }
  } catch (e) {
    status = 'failed'
    error = e instanceof Error ? e.message : String(e)
    log.push(`**Failed:** ${error}`, '')
  }
  let logPath: string | undefined
  const stamp = `${dateStr(started)} ${pad(started.getHours())}-${pad(started.getMinutes())}-${pad(started.getSeconds())}`
  try { logPath = writeStudioFile(project.id, { kind: 'run', name: `${title} ${stamp}` }, log.join('\n')).path } catch { /* folder gone */ }
  runs.delete(runId)
  busy.delete(key)
  send({ status, finished: true, error, logPath })
}

export function stopAutomation(runId: string, deps: Pick<AutomationDeps, 'stopSession'>): void {
  const r = runs.get(runId)
  if (!r) return
  r.stopped = true
  r.timer?.()
  if (r.sessionId) deps.stopSession(r.sessionId)
}

/** Old Workflows files become automations (manual trigger with the brief, then one AI agent node per step). Originals stay. */
export function migrateWorkflows(project: Project): void {
  const dir = join(project.folder!, 'workflows')
  if (!existsSync(dir)) return
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.workflow.json'))) {
    const name = f.slice(0, -'.workflow.json'.length)
    if (existsSync(join(project.folder!, 'automations', `${name}.automation.json`))) continue
    try {
      const w = JSON.parse(readFileSync(join(dir, f), 'utf8')) as WorkflowDoc
      const nodes: AutoNode[] = [{ id: 'trigger', type: 'manual', name: 'Start', x: 0, y: 0, config: { text: w.brief ?? '' } }]
      const edges: AutoEdge[] = []
      ;(w.steps ?? []).forEach((s, i) => {
        const id = `step${i + 1}`
        nodes.push({ id, type: 'agent', name: `Step ${i + 1}`, x: (i + 1) * 220, y: 0, config: { agentId: s.agentId || 'default', prompt: `${s.instruction}\n\n{{input}}` } })
        edges.push({ id: `e${i}`, from: nodes[i].id, port: 'out', to: id })
      })
      const doc: AutomationDoc = { version: 1, active: false, nodes, edges }
      writeStudioFile(project.id, { path: `automations/${name}.automation.json` }, JSON.stringify(doc, null, 2))
    } catch { /* unreadable: leave it */ }
  }
}

/**
 * Called by the scheduler tick: runs active automations whose schedule is due, in every project of the
 * current organization that has a folder. The next time is kept per file in `automation:next:<project>:<path>`.
 */
export function runDueAutomations(now: number, start: (projectId: string, path: string) => void): void {
  const projects = db.listProjects().filter((p) => p.folder && existsSync(p.folder))
  for (const p of projects) {
    let files: { path: string }[] = []
    try { files = listStudioFiles('automation', p.id).files } catch { continue }
    for (const f of files) {
      const key = `automation:next:${p.id}:${f.path}`
      let doc: AutomationDoc
      try { doc = parseAutomation(readStudioFile(p.id, f.path)) } catch { continue }
      const sched = doc.nodes.find((n) => n.type === 'schedule')
      if (!doc.active || !sched) { if (db.getSetting(key)) db.setSetting(key, ''); continue }
      const next = Number(db.getSetting(key) || 0)
      if (!next) { db.setSetting(key, String(nextScheduled(sched, now))); continue }
      if (now < next) continue
      db.setSetting(key, String(nextScheduled(sched, now)))
      if (!busy.has(`${p.id}:${f.path}`)) start(p.id, f.path)
    }
  }
}

/** When a schedule trigger fires next after `from`. */
export function nextScheduled(n: AutoNode, from: number): number {
  const c = n.config ?? {}
  const repeat = str(c.repeat, 'interval')
  if (repeat === 'interval') return from + Math.max(1, Number(c.minutes) || 60) * 60_000
  return nextRunAfter({ repeat: repeat === 'weekdays' ? 'weekdays' : repeat === 'weekly' ? 'weekly' : 'daily', time: str(c.time, '09:00'), day: Number(c.day ?? 1) }, from)
}
