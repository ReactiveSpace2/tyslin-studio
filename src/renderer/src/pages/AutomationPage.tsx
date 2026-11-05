import { useCallback, useEffect, useRef, useState } from 'react'
import { useCurrentProject } from '../currentProject'
import type { Agent, AutoEdge, AutoNode, AutoNodeType, AutomationDoc, AutomationProgress, Project, StudioFile } from '@shared/types'
import { DEFAULT_MODEL_AGENT } from '@shared/models'
import { WEEKDAY_NAMES } from '@shared/schedule'
import { Icon, type IconName } from '../components/Icon'
import { AgentSelect } from '../components/AgentSelect'
import { SAVE_LABEL, StudioFiles, StudioOverview, useAutosave } from '../components/StudioFiles'
import { useDefaultModel, modelLabel } from '../defaultModel'

interface Props {
  agents: Agent[]
  projects: Project[]
  onOpenChat: (agentId: string, projectId: string | null, sessionId?: string) => void
  /** A file to open straight away (from Drive). */
  initial?: { projectId: string; path: string }
}

type Group = 'Triggers' | 'AI' | 'Actions' | 'Flow'
interface NodeKind { type: AutoNodeType; label: string; icon: IconName; group: Group; desc: string; config: AutoNode['config'] }

/** Every node type, with what a new one starts with. */
export const NODE_KINDS: NodeKind[] = [
  { type: 'manual', label: 'Manual trigger', icon: 'play', group: 'Triggers', desc: 'Starts when you press Run. Can pass a starting text.', config: { text: '' } },
  { type: 'schedule', label: 'Schedule', icon: 'clock', group: 'Triggers', desc: 'Starts on a timer while the automation is active.', config: { repeat: 'daily', minutes: 60, time: '09:00', day: 1, text: '' } },
  { type: 'agent', label: 'AI agent', icon: 'agents', group: 'AI', desc: 'Sends a prompt to the default model, an agent or an assistant.', config: { agentId: DEFAULT_MODEL_AGENT, prompt: '{{input}}' } },
  { type: 'http', label: 'HTTP request', icon: 'connectors', group: 'Actions', desc: 'Calls a URL and passes on the response.', config: { method: 'GET', url: 'https://', headers: '', body: '' } },
  { type: 'file', label: 'Write file', icon: 'file', group: 'Actions', desc: 'Saves or appends text to a file in the project folder.', config: { path: 'reports/{{date}}.md', mode: 'overwrite', content: '{{input}}' } },
  { type: 'telegram', label: 'Telegram message', icon: 'send', group: 'Actions', desc: 'Sends a message to your linked Telegram chats.', config: { text: '{{input}}' } },
  { type: 'condition', label: 'If', icon: 'filter', group: 'Flow', desc: 'Sends the input down the true or false branch.', config: { op: 'contains', value: '' } },
  { type: 'template', label: 'Text template', icon: 'skills', group: 'Flow', desc: 'Builds new text from the input and earlier nodes.', config: { text: '{{input}}' } },
  { type: 'wait', label: 'Wait', icon: 'pause', group: 'Flow', desc: 'Pauses before the next node.', config: { seconds: 5 } }
]
const KIND = Object.fromEntries(NODE_KINDS.map((k) => [k.type, k])) as Record<AutoNodeType, NodeKind>
const isTrigger = (t: AutoNodeType): boolean => t === 'manual' || t === 'schedule'
const OPS: [string, string][] = [['contains', 'contains'], ['not_contains', 'does not contain'], ['equals', 'is exactly'], ['regex', 'matches pattern'], ['empty', 'is empty'], ['not_empty', 'is not empty']]

const SIZE = 88
const GRID = 20
/** The wire layer is a large SVG (clicks outside an SVG's own box don't reach its paths). */
const WIRE_SPAN = 20000
const uid = (): string => Math.random().toString(36).slice(2, 10)
const snap = (v: number): number => Math.round(v / GRID) * GRID
const isTyping = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))

/** Where a port sits, in board coordinates. */
function portPos(n: AutoNode, port: 'in' | 'out' | 'true' | 'false'): { x: number; y: number } {
  if (port === 'in') return { x: n.x, y: n.y + SIZE / 2 }
  if (port === 'true') return { x: n.x + SIZE, y: n.y + SIZE * 0.32 }
  if (port === 'false') return { x: n.x + SIZE, y: n.y + SIZE * 0.68 }
  return { x: n.x + SIZE, y: n.y + SIZE / 2 }
}
const curve = (a: { x: number; y: number }, b: { x: number; y: number }): string => {
  const dx = Math.max(60, Math.abs(b.x - a.x) / 2)
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
}
/** One line under the node name, e.g. "Daily at 09:00" or "GET example.com". */
function subtitle(n: AutoNode, agents: Agent[], dm: string): string {
  const c = n.config
  switch (n.type) {
    case 'schedule': return c.repeat === 'interval' ? `Every ${c.minutes} min` : c.repeat === 'weekly' ? `${WEEKDAY_NAMES[Number(c.day ?? 1)].slice(0, 3)} ${c.time}` : `${c.repeat === 'weekdays' ? 'Weekdays' : 'Daily'} ${c.time}`
    case 'agent': return c.agentId === DEFAULT_MODEL_AGENT ? dm : agents.find((a) => a.id === c.agentId)?.name ?? 'Pick an agent'
    case 'http': { const u = String(c.url ?? ''); return `${c.method} ${u.replace(/^https?:\/\//, '').split('/')[0] || '…'}` }
    case 'file': return String(c.path ?? '')
    case 'condition': return `${OPS.find(([o]) => o === c.op)?.[1] ?? ''} ${c.value ?? ''}`.trim()
    case 'wait': return `${c.seconds}s`
    case 'telegram': return 'Linked chats'
    case 'template': return 'Template'
    default: return KIND[n.type].label
  }
}

type NodeRun = { status: AutomationProgress['status']; output?: string; error?: string; sessionId?: string }
type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'node'; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | { kind: 'wire'; from: string; port: AutoEdge['port'] }

/** Automation: build flows of triggers, AI agents and actions on a board, like n8n. */
export function AutomationPage({ agents, projects, onOpenChat, initial }: Props): JSX.Element {
  const dm = useDefaultModel()
  // The project picked in the title bar; App remounts this screen when it changes.
  const [projectId] = useCurrentProject()
  const [file, setFile] = useState<StudioFile | null>(null)
  const [doc, setDoc] = useState<AutomationDoc | null>(null)
  const [dirty, setDirty] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [view, setView] = useState({ x: 120, y: 160, zoom: 1 })
  const [selNode, setSelNode] = useState<string | null>(null)
  const [selEdge, setSelEdge] = useState<string | null>(null)
  const [picker, setPicker] = useState<{ from?: { id: string; port: AutoEdge['port'] } } | null>(null)
  const [wire, setWire] = useState<{ from: string; port: AutoEdge['port']; x: number; y: number } | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [nodeRuns, setNodeRuns] = useState<Record<string, NodeRun>>({})
  const [result, setResult] = useState<{ status: AutomationProgress['status']; logPath?: string; error?: string; trigger: string } | null>(null)
  const [logs, setLogs] = useState<StudioFile[]>([])
  const [viewing, setViewing] = useState<{ path: string; text: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const boardRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const past = useRef<AutomationDoc[]>([])
  const docRef = useRef(doc)
  docRef.current = doc
  const viewRef = useRef(view)
  viewRef.current = view
  const fileRef = useRef(file)
  fileRef.current = file

  const json = doc ? JSON.stringify(doc, null, 2) : null
  const save = useAutosave(json, dirty, async (v) => { if (file) await window.tyslin.studio.write(projectId, { path: file.path }, v) }, () => { setDirty(false); setRefresh((r) => r + 1) })

  const apply = (d: AutomationDoc): void => { docRef.current = d; setDoc(d); setDirty(true) }
  const commit = (d: AutomationDoc): void => {
    if (docRef.current) { past.current.push(docRef.current); if (past.current.length > 100) past.current.shift() }
    apply(d)
  }
  const undo = (): void => { const p = past.current.pop(); if (p) apply(p) }
  const patchNode = (id: string, patch: Partial<AutoNode> | ((n: AutoNode) => Partial<AutoNode>), record = true): void => {
    const d = docRef.current
    if (!d) return
    const next = { ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, ...(typeof patch === 'function' ? patch(n) : patch) } : n)) }
    if (record) commit(next)
    else apply(next)
  }

  // ---------- files ----------
  const loadLogs = useCallback(async (f: StudioFile | null, pid: string | null): Promise<void> => {
    if (!f) { setLogs([]); return }
    const r = await window.tyslin.studio.list('run', pid).catch(() => null)
    setLogs((r?.files ?? []).filter((l) => l.name.startsWith(f.name + ' ')))
  }, [])
  const fit = useCallback((d: AutomationDoc | null = docRef.current): void => {
    const r = boardRef.current?.getBoundingClientRect()
    if (!r || !d?.nodes.length) return
    const xs = d.nodes.map((n) => n.x), ys = d.nodes.map((n) => n.y)
    const x1 = Math.min(...xs) - 100, y1 = Math.min(...ys) - 60, x2 = Math.max(...xs) + SIZE + 140, y2 = Math.max(...ys) + SIZE + 90
    const zoom = Math.min(1.25, Math.max(0.2, Math.min(r.width / (x2 - x1), r.height / (y2 - y1))))
    setView({ zoom, x: (r.width - (x2 - x1) * zoom) / 2 - x1 * zoom, y: (r.height - (y2 - y1) * zoom) / 2 - y1 * zoom })
  }, [])
  const open = async (f: StudioFile | null, pid: string | null = projectId): Promise<void> => {
    setFile(f); setDoc(null); setDirty(false); setSelNode(null); setSelEdge(null); setNodeRuns({}); setResult(null); setViewing(null); setRunId(null); setPicker(null)
    past.current = []
    if (!f) return
    try {
      const raw = JSON.parse(await window.tyslin.studio.read(pid, f.path)) as Partial<AutomationDoc>
      const d: AutomationDoc = { version: 1, active: !!raw.active, nodes: raw.nodes ?? [], edges: raw.edges ?? [] }
      setDoc(d)
      requestAnimationFrame(() => fit(d))
    } catch {
      setNotice('This automation file could not be read.')
    }
    void loadLogs(f, pid)
  }
  useEffect(() => {
    if (!initial) return
    const name = initial.path.split('/').pop()!.replace(/\.automation\.json$/, '')
    void open({ name, path: initial.path, updatedAt: Date.now() }, initial.projectId)
  }, [initial?.path])
  const create = async (name: string): Promise<void> => {
    const d: AutomationDoc = {
      version: 1, active: false,
      nodes: [
        { id: uid(), type: 'manual', name: 'Start', x: 0, y: 0, config: { text: '' } },
        { id: uid(), type: 'agent', name: 'AI agent', x: 220, y: 0, config: { agentId: DEFAULT_MODEL_AGENT, prompt: 'Write three ideas for what to work on today.\n\n{{input}}' } }
      ],
      edges: []
    }
    d.edges.push({ id: uid(), from: d.nodes[0].id, port: 'out', to: d.nodes[1].id })
    const f = await window.tyslin.studio.write(projectId, { kind: 'automation', name }, JSON.stringify(d, null, 2))
    setRefresh((x) => x + 1)
    await open(f)
  }

  // ---------- runs ----------
  useEffect(() => window.tyslin.studio.onAutomation((p) => {
    if (!fileRef.current || p.path !== fileRef.current.path) return
    if (p.finished) {
      setRunId((r) => (r === p.runId ? null : r))
      setResult({ status: p.status, logPath: p.logPath, error: p.error, trigger: p.trigger })
      void loadLogs(fileRef.current, projectId)
      return
    }
    if (p.nodeId) setNodeRuns((m) => ({ ...m, [p.nodeId!]: { status: p.status, output: p.output, error: p.error, sessionId: p.sessionId ?? m[p.nodeId!]?.sessionId } }))
  }), [projectId, loadLogs])

  const run = async (): Promise<void> => {
    if (!file || !doc) return
    // Run what is on screen, even if the autosave hasn't happened yet.
    if (dirty && json) { await window.tyslin.studio.write(projectId, { path: file.path }, json); setDirty(false) }
    setNodeRuns({}); setResult(null); setViewing(null)
    try {
      setRunId(await window.tyslin.studio.runAutomation(projectId, file.path))
    } catch (e) {
      setNotice(errorText(e))
    }
  }

  // ---------- editing ----------
  const addNode = (type: AutoNodeType, from?: { id: string; port: AutoEdge['port'] }): void => {
    const d = docRef.current
    if (!d) return
    const k = KIND[type]
    const src = from ? d.nodes.find((n) => n.id === from.id) : selNode ? d.nodes.find((n) => n.id === selNode) : null
    const r = boardRef.current?.getBoundingClientRect()
    const v = viewRef.current
    let x = src ? src.x + 220 : snap(((r?.width ?? 600) / 2 - v.x) / v.zoom - SIZE / 2)
    let y = src ? src.y + (from?.port === 'false' ? 140 : 0) : snap(((r?.height ?? 400) / 2 - v.y) / v.zoom - SIZE / 2)
    while (d.nodes.some((n) => Math.abs(n.x - x) < SIZE && Math.abs(n.y - y) < SIZE)) y += 140
    const sameType = d.nodes.filter((n) => n.type === type).length
    const node: AutoNode = { id: uid(), type, name: sameType ? `${k.label} ${sameType + 1}` : k.label, x: snap(x), y: snap(y), config: { ...k.config } }
    const edges = [...d.edges]
    if (src && !isTrigger(type)) {
      const port = from?.port ?? (src.type === 'condition' ? 'true' : 'out')
      edges.push({ id: uid(), from: src.id, port, to: node.id })
    }
    commit({ ...d, nodes: [...d.nodes, node], edges })
    setSelNode(node.id); setSelEdge(null); setPicker(null)
    // Keep the new node in view.
    if (r) {
      const sx = node.x * v.zoom + v.x, sy = node.y * v.zoom + v.y
      if (sx < 40 || sy < 40 || sx + (SIZE + 160) * v.zoom > r.width || sy + (SIZE + 60) * v.zoom > r.height) {
        setView({ ...v, x: r.width / 2 - (node.x + SIZE / 2) * v.zoom, y: r.height / 2 - (node.y + SIZE / 2) * v.zoom })
      }
    }
  }
  const removeNode = (id: string): void => {
    const d = docRef.current
    if (!d) return
    commit({ ...d, nodes: d.nodes.filter((n) => n.id !== id), edges: d.edges.filter((e) => e.from !== id && e.to !== id) })
    setSelNode(null)
  }
  const duplicateNode = (id: string): void => {
    const d = docRef.current
    const n = d?.nodes.find((x) => x.id === id)
    if (!d || !n) return
    const copy = { ...n, id: uid(), name: `${n.name} copy`, x: n.x + 40, y: n.y + 120, config: { ...n.config } }
    commit({ ...d, nodes: [...d.nodes, copy] })
    setSelNode(copy.id)
  }
  const connect = (from: string, port: AutoEdge['port'], to: string): void => {
    const d = docRef.current
    if (!d || from === to) return
    const target = d.nodes.find((n) => n.id === to)
    if (!target || isTrigger(target.type)) { setNotice('Triggers start a run, so nothing connects into them.'); return }
    if (d.edges.some((e) => e.from === from && e.port === port && e.to === to)) return
    // No loops: the target must not already lead back to the source.
    const seen = new Set<string>()
    const leadsBack = (id: string): boolean => {
      if (id === from) return true
      if (seen.has(id)) return false
      seen.add(id)
      return d.edges.filter((e) => e.from === id).some((e) => leadsBack(e.to))
    }
    if (leadsBack(to)) { setNotice('That connection would make a loop.'); return }
    commit({ ...d, edges: [...d.edges, { id: uid(), from, port, to }] })
  }

  // ---------- pointer ----------
  const toWorld = (cx: number, cy: number): { x: number; y: number } => {
    const r = boardRef.current!.getBoundingClientRect()
    const v = viewRef.current
    return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom }
  }
  const onBoardDown = (e: React.PointerEvent): void => {
    if (e.button !== 0 && e.button !== 1) return
    boardRef.current?.focus()
    boardRef.current?.setPointerCapture(e.pointerId)
    drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }
    setSelNode(null); setSelEdge(null); setPicker(null)
  }
  const onNodeDown = (e: React.PointerEvent, n: AutoNode): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    boardRef.current?.focus()
    boardRef.current?.setPointerCapture(e.pointerId)
    const p = toWorld(e.clientX, e.clientY)
    drag.current = { kind: 'node', id: n.id, sx: p.x, sy: p.y, ox: n.x, oy: n.y, moved: false }
    setSelNode(n.id); setSelEdge(null)
  }
  const onPortDown = (e: React.PointerEvent, n: AutoNode, port: AutoEdge['port']): void => {
    e.stopPropagation()
    boardRef.current?.setPointerCapture(e.pointerId)
    const p = toWorld(e.clientX, e.clientY)
    drag.current = { kind: 'wire', from: n.id, port }
    setWire({ from: n.id, port, x: p.x, y: p.y })
  }
  const onMove = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d) return
    if (d.kind === 'pan') { setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy })); return }
    const p = toWorld(e.clientX, e.clientY)
    if (d.kind === 'wire') { setWire((w) => (w ? { ...w, x: p.x, y: p.y } : w)); return }
    const dx = p.x - d.sx, dy = p.y - d.sy
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return
    if (!d.moved && docRef.current) { past.current.push(docRef.current); d.moved = true }
    patchNode(d.id, { x: Math.round(d.ox + dx), y: Math.round(d.oy + dy) }, false)
  }
  const onUp = (e: React.PointerEvent): void => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.kind === 'node' && d.moved) patchNode(d.id, (n) => ({ x: snap(n.x), y: snap(n.y) }), false)
    if (d.kind === 'wire') {
      setWire(null)
      const target = document.elementsFromPoint(e.clientX, e.clientY).map((el) => el.closest('[data-node]')?.getAttribute('data-node')).find(Boolean)
      if (target) connect(d.from, d.port, target)
      else setPicker({ from: { id: d.from, port: d.port } }) // dropped on empty board: pick a node to add there, like n8n
    }
  }
  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) {
        setView((v) => {
          const zoom = Math.min(2, Math.max(0.2, v.zoom * Math.exp(-e.deltaY * 0.0025)))
          const wx = (e.clientX - r.left - v.x) / v.zoom, wy = (e.clientY - r.top - v.y) / v.zoom
          return { zoom, x: e.clientX - r.left - wx * zoom, y: e.clientY - r.top - wy * zoom }
        })
      } else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [doc !== null])

  useEffect(() => {
    if (!doc) return
    const down = (e: KeyboardEvent): void => {
      if (isTyping(e.target)) return
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === 'z') { e.preventDefault(); undo(); return }
      if (mod && k === 'd' && selNode) { e.preventDefault(); duplicateNode(selNode); return }
      if (mod) return
      if ((k === 'delete' || k === 'backspace') && (selNode || selEdge)) {
        e.preventDefault()
        if (selNode) removeNode(selNode)
        else if (selEdge && docRef.current) { commit({ ...docRef.current, edges: docRef.current.edges.filter((x) => x.id !== selEdge) }); setSelEdge(null) }
        return
      }
      if (k === 'escape') { setSelNode(null); setSelEdge(null); setPicker(null); return }
      if (e.shiftKey && (k === '!' || e.code === 'Digit1')) fit()
      if (k === 'n' || (k === '+' && !e.shiftKey)) setPicker({})
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  })

  // ---------- render ----------
  const nodes = doc?.nodes ?? []
  const edges = doc?.edges ?? []
  const sel = nodes.find((n) => n.id === selNode) ?? null
  const hasSchedule = nodes.some((n) => n.type === 'schedule')
  const dmLabel = dm ? modelLabel(dm) : 'Default model'
  const running = !!runId

  const nodeEl = (n: AutoNode): JSX.Element => {
    const k = KIND[n.type]
    const r = nodeRuns[n.id]
    const outs: AutoEdge['port'][] = n.type === 'condition' ? ['true', 'false'] : ['out']
    return (
      <div key={n.id} data-node={n.id} className={'au-node' + (isTrigger(n.type) ? ' trigger' : '') + (selNode === n.id ? ' on' : '') + (r ? ' ' + r.status : '')}
        style={{ left: n.x, top: n.y }} onPointerDown={(e) => onNodeDown(e, n)}>
        <div className="au-box" title={k.desc}>
          <Icon name={k.icon} size={30} />
          {r?.status === 'done' && <span className="au-badge ok" aria-label="Done"><Icon name="check" size={11} /></span>}
          {r?.status === 'failed' && <span className="au-badge bad" aria-label="Failed"><Icon name="warning" size={11} /></span>}
          {isTrigger(n.type) && <span className="au-bolt" aria-hidden="true">{n.type === 'schedule' ? 'TIMER' : 'START'}</span>}
        </div>
        <div className="au-label"><strong>{n.name}</strong><span>{subtitle(n, agents, dmLabel)}</span></div>
        {!isTrigger(n.type) && <span className="au-port in" aria-hidden="true" />}
        {outs.map((p) => {
          const pos = p === 'true' ? '32%' : p === 'false' ? '68%' : '50%'
          const used = edges.some((e) => e.from === n.id && e.port === p)
          return (
            <span key={p}>
              <span className={'au-port out ' + p} style={{ top: parseFloat(pos) * SIZE / 100 }} onPointerDown={(e) => onPortDown(e, n, p)} title="Drag to connect" />
              {p !== 'out' && <span className="au-port-label" style={{ top: `${parseFloat(pos) * SIZE / 100 - 9}px` }}>{p}</span>}
              {!used && (
                <button type="button" className="au-plus" style={{ top: `${parseFloat(pos) * SIZE / 100 - 11}px` }} aria-label={`Add a node after ${n.name}${p !== 'out' ? ` (${p})` : ''}`}
                  onPointerDown={(e) => e.stopPropagation()} onClick={() => { setSelNode(n.id); setPicker({ from: { id: n.id, port: p } }) }}>
                  <Icon name="plus" size={11} />
                </button>
              )}
            </span>
          )
        })}
      </div>
    )
  }

  return (
    <div className="studio">
      <StudioFiles kind="automation" title="Automation" newLabel="New automation" allLabel="All automations" projects={projects} projectId={projectId}
        selected={file?.path ?? null} onSelect={(f) => void open(f)} refreshKey={refresh}
        onNew={(n) => void create(n)} onDelete={async (f) => { await window.tyslin.studio.remove(projectId, f.path); if (file?.path === f.path) void open(null); setRefresh((r) => r + 1) }} />
      <div className="studio-main">
        {!doc ? (
          <StudioOverview kind="automation" title="Automation" newLabel="New automation" projectId={projectId} refreshKey={refresh}
            intro={<>Connect triggers, AI agents and actions into flows that run by themselves: on a schedule or when you press Run. Each node passes its result to the next. Automations and their run logs are saved in the project folder under <code className="mono">automations/</code>.</>}
            onOpen={(f) => void open(f)} onNew={(n) => void create(n)} />
        ) : (
          <>
            <div className="studio-bar">
              <strong className="studio-title">{file?.name}</strong>
              <span className="hint">{SAVE_LABEL[save]}</span>
              <span style={{ flex: 1 }} />
              <label className={'au-active' + (doc.active ? ' on' : '')} title={hasSchedule ? 'Active automations run on their schedule while Tyslin is open' : 'Add a Schedule trigger to run this automatically'}>
                <input type="checkbox" role="switch" checked={doc.active} disabled={!hasSchedule && !doc.active} onChange={(e) => commit({ ...doc, active: e.target.checked })} />
                <span className="au-switch" aria-hidden="true" />
                {doc.active ? 'Active' : 'Inactive'}
              </label>
              <span className="cv-sep" />
              <button type="button" className="btn btn-sm" onClick={() => setPicker(picker ? null : {})} aria-expanded={!!picker}><Icon name="plus" size={12} /> Add node</button>
              <button type="button" className="cv-tool" aria-label="Fit to view" title="Fit (Shift+1)" onClick={() => fit()}><Icon name="grid" size={14} /></button>
              {running
                ? <button type="button" className="btn btn-sm" onClick={() => runId && void window.tyslin.studio.stopAutomation(runId)}><Icon name="stop" size={12} /> Stop</button>
                : <button type="button" className="btn btn-sm btn-primary" onClick={() => void run()}><Icon name="play" size={12} /> Run</button>}
            </div>
            <div className="studio-split">
              <div ref={boardRef} className="au-board" tabIndex={0} aria-label="Automation board"
                onPointerDown={onBoardDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${GRID * view.zoom}px ${GRID * view.zoom}px` }}>
                <div className="au-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
                  <svg className="au-wires" width={2 * WIRE_SPAN} height={2 * WIRE_SPAN} style={{ left: -WIRE_SPAN, top: -WIRE_SPAN }} aria-hidden="true">
                    <g transform={`translate(${WIRE_SPAN} ${WIRE_SPAN})`}>
                    {edges.map((ed) => {
                      const a = nodes.find((n) => n.id === ed.from), b = nodes.find((n) => n.id === ed.to)
                      if (!a || !b) return null
                      const p1 = portPos(a, ed.port), p2 = portPos(b, 'in')
                      const d = curve(p1, p2)
                      const lit = nodeRuns[ed.to] && nodeRuns[ed.from]?.status === 'done'
                      return (
                        <g key={ed.id}>
                          <path d={d} className="au-hit" onPointerDown={(e) => { e.stopPropagation(); setSelEdge(ed.id); setSelNode(null) }} />
                          <path d={d} className={'au-wire' + (selEdge === ed.id ? ' on' : '') + (lit ? ' lit' : '')} />
                        </g>
                      )
                    })}
                    {wire && (() => { const a = nodes.find((n) => n.id === wire.from); return a ? <path d={curve(portPos(a, wire.port), wire)} className="au-wire drawing" /> : null })()}
                    </g>
                  </svg>
                  {nodes.map(nodeEl)}
                  {selEdge && (() => {
                    const ed = edges.find((x) => x.id === selEdge)
                    const a = ed && nodes.find((n) => n.id === ed.from), b = ed && nodes.find((n) => n.id === ed.to)
                    if (!ed || !a || !b) return null
                    const p1 = portPos(a, ed.port), p2 = portPos(b, 'in')
                    return (
                      <button type="button" className="au-edge-del" style={{ left: (p1.x + p2.x) / 2 - 14, top: (p1.y + p2.y) / 2 - 14 }} aria-label="Delete connection"
                        onPointerDown={(e) => e.stopPropagation()} onClick={() => { commit({ ...doc, edges: doc.edges.filter((x) => x.id !== selEdge) }); setSelEdge(null) }}>
                        <Icon name="trash" size={12} />
                      </button>
                    )
                  })()}
                </div>
                {!nodes.length && <p className="cv-empty hint">Add a trigger to start: press Add node, then Manual trigger or Schedule.</p>}
                {notice && <button type="button" className="cv-notice" onClick={() => setNotice(null)}>{notice}</button>}
                {picker && (
                  <div className="au-picker" role="dialog" aria-label="Add a node" onPointerDown={(e) => e.stopPropagation()}>
                    <div className="au-picker-head"><strong>{picker.from ? 'What happens next?' : 'Add a node'}</strong>
                      <button type="button" className="cv-tool" aria-label="Close" onClick={() => setPicker(null)}><Icon name="close" size={13} /></button></div>
                    {(['Triggers', 'AI', 'Actions', 'Flow'] as Group[]).filter((g) => !(picker.from && g === 'Triggers')).map((g) => (
                      <div key={g} className="au-picker-group">
                        <span className="section-label" style={{ padding: 0 }}>{g}</span>
                        {NODE_KINDS.filter((k) => k.group === g).map((k) => (
                          <button key={k.type} type="button" className="au-pick" onClick={() => addNode(k.type, picker.from)}>
                            <span className="au-pick-ic"><Icon name={k.icon} size={16} /></span>
                            <span><strong>{k.label}</strong><small>{k.desc}</small></span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <aside className="studio-side au-side">
                {sel ? (
                  <NodeEditor key={sel.id} node={sel} agents={agents} run={nodeRuns[sel.id]} nodes={nodes}
                    onChange={(patch) => patchNode(sel.id, patch)} onDelete={() => removeNode(sel.id)} onDuplicate={() => duplicateNode(sel.id)}
                    onOpenChat={(sid) => onOpenChat(sel.type === 'agent' ? String(sel.config.agentId ?? DEFAULT_MODEL_AGENT) : DEFAULT_MODEL_AGENT, projectId, sid)} />
                ) : (
                  <div className="au-runs">
                    <span className="section-label" style={{ padding: 0 }}>Runs</span>
                    {running && <div className="au-result running"><strong>Running…</strong><span className="hint">Nodes light up as they finish. You can leave this screen.</span></div>}
                    {result && (
                      <div className={'au-result ' + result.status}>
                        <strong>{result.status === 'done' ? 'Finished' : result.status === 'stopped' ? 'Stopped' : 'Failed'}{result.trigger === 'schedule' ? ' (scheduled)' : ''}</strong>
                        {result.error && <span className="hint">{result.error}</span>}
                        {result.logPath && <button type="button" className="link-btn" onClick={async () => setViewing({ path: result.logPath!, text: await window.tyslin.studio.read(projectId, result.logPath!) })}>Read the log</button>}
                      </div>
                    )}
                    {viewing ? (
                      <div className="au-log">
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <button type="button" className="link-btn" onClick={() => setViewing(null)}>All runs</button>
                          <button type="button" className="link-btn" onClick={() => void window.tyslin.studio.reveal(projectId, viewing.path)}>Show file</button>
                        </div>
                        <pre>{viewing.text}</pre>
                      </div>
                    ) : logs.length ? (
                      <div className="au-loglist">
                        {logs.slice(0, 30).map((l) => (
                          <button key={l.path} type="button" className="sf-open" onClick={async () => setViewing({ path: l.path, text: await window.tyslin.studio.read(projectId, l.path) })}>
                            <strong>{l.name.slice(file!.name.length + 1)}</strong><span>Run log</span>
                          </button>
                        ))}
                      </div>
                    ) : !running && !result && <p className="hint">No runs yet. Press Run to try it.</p>}
                    <div className="au-help">
                      <span className="section-label" style={{ padding: 0 }}>How it works</span>
                      <p className="hint">Drag from a node's right edge to another node to connect them, or press + to add the next node. Click a node to set it up. Each node gets the text from the node before it as <code className="mono">{'{{input}}'}</code>.</p>
                      <p className="hint">{hasSchedule ? (doc.active ? 'Active: the schedule runs while Tyslin is open.' : 'Switch it to Active to run on the schedule.') : 'Add a Schedule trigger to run it automatically.'}</p>
                      <p className="hint"><strong>Keys:</strong> N add node · Delete remove · Ctrl+D duplicate · Ctrl+Z undo · Shift+1 fit</p>
                    </div>
                  </div>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Right panel for the selected node: its name, its settings and what it produced in the last run. */
function NodeEditor({ node, agents, run, nodes, onChange, onDelete, onDuplicate, onOpenChat }: {
  node: AutoNode
  agents: Agent[]
  run?: NodeRun
  nodes: AutoNode[]
  onChange: (patch: Partial<AutoNode>) => void
  onDelete: () => void
  onDuplicate: () => void
  onOpenChat: (sessionId: string) => void
}): JSX.Element {
  const k = KIND[node.type]
  const c = node.config
  const set = (key: string, v: string | number | boolean): void => onChange({ config: { ...c, [key]: v } })
  const text = (key: string, label: string, rows = 4, placeholder = ''): JSX.Element => (
    <label className="field" style={{ gap: 4 }}><span className="label">{label}</span>
      <textarea className="textarea mono au-tpl" rows={rows} value={String(c[key] ?? '')} placeholder={placeholder} onChange={(e) => set(key, e.target.value)} spellCheck={false} />
    </label>
  )
  const others = nodes.filter((n) => n.id !== node.id).map((n) => n.name)

  return (
    <div className="au-editor">
      <div className="cv-props-head"><span className="au-pick-ic"><Icon name={k.icon} size={15} /></span><strong>{k.label}</strong></div>
      <p className="hint" style={{ margin: 0 }}>{k.desc}</p>
      <label className="field" style={{ gap: 4 }}><span className="label">Name</span>
        <input className="input" value={node.name} onChange={(e) => onChange({ name: e.target.value })} />
      </label>

      {node.type === 'manual' && text('text', 'Starting text (optional)', 4, 'e.g. Write a weekly update about our launch')}
      {node.type === 'schedule' && (
        <>
          <label className="field" style={{ gap: 4 }}><span className="label">Runs</span>
            <select className="select" value={String(c.repeat)} onChange={(e) => set('repeat', e.target.value)}>
              <option value="interval">Every few minutes</option><option value="daily">Every day</option><option value="weekdays">Every weekday</option><option value="weekly">Every week</option>
            </select>
          </label>
          {c.repeat === 'interval'
            ? <label className="field" style={{ gap: 4 }}><span className="label">Every (minutes)</span><input className="input mono" type="number" min={1} value={Number(c.minutes ?? 60)} onChange={(e) => set('minutes', Math.max(1, Number(e.target.value) || 1))} /></label>
            : (
              <div className="cv-grid">
                <label className="cv-num"><span>At</span><input className="input mono" type="time" value={String(c.time ?? '09:00')} onChange={(e) => set('time', e.target.value)} /></label>
                {c.repeat === 'weekly' && (
                  <label className="cv-num"><span>On</span>
                    <select className="select" value={Number(c.day ?? 1)} onChange={(e) => set('day', Number(e.target.value))}>{WEEKDAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
                  </label>
                )}
              </div>
            )}
          {text('text', 'Starting text (optional)', 3)}
          <p className="hint" style={{ margin: 0 }}>Runs while Tyslin is open and the automation is Active (switch at the top).</p>
        </>
      )}
      {node.type === 'agent' && (
        <>
          <label className="field" style={{ gap: 4 }}><span className="label">Model or agent</span>
            <AgentSelect agents={agents} value={String(c.agentId ?? DEFAULT_MODEL_AGENT)} onChange={(v) => set('agentId', v)} /></label>
          {text('prompt', 'Prompt', 7, 'e.g. Summarise this for a founder in five bullets:\n\n{{input}}')}
        </>
      )}
      {node.type === 'http' && (
        <>
          <div className="cv-grid" style={{ gridTemplateColumns: '96px 1fr' }}>
            <label className="cv-num"><span>Method</span>
              <select className="select" value={String(c.method ?? 'GET')} onChange={(e) => set('method', e.target.value)}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => <option key={m}>{m}</option>)}</select>
            </label>
            <label className="cv-num"><span>URL</span><input className="input mono" value={String(c.url ?? '')} onChange={(e) => set('url', e.target.value)} spellCheck={false} /></label>
          </div>
          {text('headers', 'Headers (JSON, optional)', 3, '{"Authorization": "Bearer …"}')}
          {c.method !== 'GET' && c.method !== 'DELETE' && text('body', 'Body', 4, '{"text": "{{input}}"}')}
        </>
      )}
      {node.type === 'condition' && (
        <>
          <label className="field" style={{ gap: 4 }}><span className="label">The input…</span>
            <select className="select" value={String(c.op ?? 'contains')} onChange={(e) => set('op', e.target.value)}>{OPS.map(([o, l]) => <option key={o} value={o}>{l}</option>)}</select>
          </label>
          {c.op !== 'empty' && c.op !== 'not_empty' && (
            <label className="field" style={{ gap: 4 }}><span className="label">Value</span><input className="input mono" value={String(c.value ?? '')} onChange={(e) => set('value', e.target.value)} /></label>
          )}
          <p className="hint" style={{ margin: 0 }}>The input goes on unchanged, down the <strong>true</strong> or <strong>false</strong> branch.</p>
        </>
      )}
      {node.type === 'template' && text('text', 'Text', 7, 'e.g. Daily report for {{date}}\n\n{{input}}')}
      {node.type === 'file' && (
        <>
          <label className="field" style={{ gap: 4 }}><span className="label">File in the project folder</span><input className="input mono" value={String(c.path ?? '')} onChange={(e) => set('path', e.target.value)} spellCheck={false} /></label>
          <div className="seg" role="group" aria-label="Write mode">
            {(['overwrite', 'append'] as const).map((m) => <button key={m} type="button" className={c.mode === m ? 'on' : ''} aria-pressed={c.mode === m} onClick={() => set('mode', m)}>{m === 'overwrite' ? 'Replace' : 'Append'}</button>)}
          </div>
          {text('content', 'Content', 5)}
        </>
      )}
      {node.type === 'telegram' && (
        <>
          {text('text', 'Message', 5)}
          <p className="hint" style={{ margin: 0 }}>Goes to the chats linked in Connectors → Telegram.</p>
        </>
      )}
      {node.type === 'wait' && (
        <label className="field" style={{ gap: 4 }}><span className="label">Seconds</span><input className="input mono" type="number" min={0} max={3600} value={Number(c.seconds ?? 5)} onChange={(e) => set('seconds', Math.min(3600, Math.max(0, Number(e.target.value) || 0)))} /></label>
      )}

      {!['wait', 'condition'].includes(node.type) && (
        <p className="hint au-vars">Use <code className="mono">{'{{input}}'}</code> for the previous node's text, <code className="mono">{'{{date}}'}</code>, <code className="mono">{'{{time}}'}</code>{others.length ? <>, or <code className="mono">{`{{node.${others[0]}}}`}</code> for another node's output</> : null}.</p>
      )}

      <div className="au-output">
        <span className="section-label" style={{ padding: 0 }}>Output</span>
        {!run ? <p className="hint">Run the automation to see what this node produces.</p>
          : run.status === 'running' ? <p className="hint">Running…</p>
            : run.error ? <p className="hint account-error">{run.error}</p>
              : <pre>{run.output?.trim() || '(empty)'}</pre>}
        {run?.sessionId && <button type="button" className="link-btn" onClick={() => onOpenChat(run.sessionId!)}>Open chat</button>}
      </div>
      <div className="cv-actions">
        <button type="button" className="btn btn-sm" onClick={onDuplicate}>Duplicate</button>
        <button type="button" className="btn btn-sm cv-danger" onClick={onDelete}><Icon name="trash" size={12} /> Delete</button>
      </div>
    </div>
  )
}
