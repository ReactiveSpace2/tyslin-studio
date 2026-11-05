import { useEffect, useRef, useState } from 'react'
import type { Agent, MindMapDoc, MindNode, Project, StudioFile } from '@shared/types'
import { Icon } from '../components/Icon'
import { SAVE_LABEL, StudioFiles, StudioOverview, useAutosave } from '../components/StudioFiles'
import { AgentSelect } from './WorkflowsPage'

interface Props {
  agents: Agent[]
  projects: Project[]
  onOpenChat: (agentId: string, projectId: string | null, sessionId?: string) => void
  /** A file to open straight away (from Drive). */
  initial?: { projectId: string; path: string }
}

const uid = (): string => Math.random().toString(36).slice(2, 10)
const node = (text: string, children: MindNode[] = []): MindNode => ({ id: uid(), text, children })

/** Nested Markdown list ("- a\n  - b") to nodes. Lines that aren't list items are skipped. */
export function parseOutline(md: string): MindNode[] {
  const roots: MindNode[] = []
  const stack: { indent: number; node: MindNode }[] = []
  for (const line of md.split('\n')) {
    const m = /^(\s*)(?:[-*+]|\d+[.)])\s+(.+?)\s*$/.exec(line)
    if (!m) continue
    const indent = m[1].replace(/\t/g, '  ').length
    const n = node(m[2].replace(/\*\*(.+?)\*\*/g, '$1'))
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    if (stack.length) stack[stack.length - 1].node.children.push(n)
    else roots.push(n)
    stack.push({ indent, node: n })
  }
  return roots
}

const toMarkdown = (n: MindNode, depth = 0): string =>
  depth === 0 ? `# ${n.text}\n\n` + n.children.map((c) => toMarkdown(c, 1)).join('') : `${'  '.repeat(depth - 1)}- ${n.text}\n` + n.children.map((c) => toMarkdown(c, depth + 1)).join('')

function find(root: MindNode, id: string, parent: MindNode | null = null): { n: MindNode; parent: MindNode | null } | null {
  if (root.id === id) return { n: root, parent }
  for (const c of root.children) { const r = find(c, id, root); if (r) return r }
  return null
}
const clone = (n: MindNode): MindNode => JSON.parse(JSON.stringify(n))

/** Mind mapper: a map per file, edited by keyboard or mouse, grown by an agent on request. */
export function MindMapPage({ agents, projects, onOpenChat, initial }: Props): JSX.Element {
  const [projectId, setProjectId] = useState<string | null>(null)
  const [file, setFile] = useState<StudioFile | null>(null)
  const [root, setRoot] = useState<MindNode | null>(null)
  const [dirty, setDirty] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [agentId, setAgentId] = useState<string>(agents.find((a) => a.kind === 'assistant')?.id ?? agents[0]?.id ?? '')
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  const save = useAutosave(root ? JSON.stringify({ version: 1, root } satisfies MindMapDoc, null, 2) : null, dirty,
    async (v) => { if (file) await window.tyslin.studio.write(projectId, { path: file.path }, v) }, () => { setDirty(false); setRefresh((r) => r + 1) })

  const open = async (f: StudioFile | null, pid: string | null = projectId): Promise<void> => {
    setFile(f); setRoot(null); setSel(null); setEditing(null); setDirty(false); setError(null)
    if (!f) return
    try {
      const doc = JSON.parse(await window.tyslin.studio.read(pid, f.path)) as MindMapDoc
      setRoot(doc.root); setSel(doc.root.id)
    } catch {
      setError('This map could not be read.')
    }
  }
  useEffect(() => {
    if (!initial) return
    setProjectId(initial.projectId)
    const name = initial.path.split('/').pop()!.replace(/\.(mindmap\.json|workflow\.json|md)$/, '')
    void open({ name, path: initial.path, updatedAt: Date.now() }, initial.projectId)
  }, [initial?.path])
  const create = async (name: string): Promise<void> => {
    const r = node(name)
    const f = await window.tyslin.studio.write(projectId, { kind: 'mindmap', name }, JSON.stringify({ version: 1, root: r }, null, 2))
    setRefresh((x) => x + 1)
    setFile(f); setRoot(r); setSel(r.id); setEditing(r.id); setDirty(false)
  }
  const change = (fn: (r: MindNode) => void): void => {
    if (!root) return
    const r = clone(root)
    fn(r)
    setRoot(r)
    setDirty(true)
  }

  const addChild = (id: string, text = 'New idea'): void => {
    const n = node(text)
    change((r) => { const f = find(r, id); if (f) { f.n.children.push(n); f.n.collapsed = false } })
    setSel(n.id); setEditing(n.id)
  }
  const addSibling = (id: string): void => {
    if (!root || id === root.id) return addChild(id)
    const n = node('New idea')
    change((r) => { const f = find(r, id); if (f?.parent) f.parent.children.splice(f.parent.children.indexOf(f.n) + 1, 0, n) })
    setSel(n.id); setEditing(n.id)
  }
  const remove = (id: string): void => {
    if (!root || id === root.id) return
    const f = find(root, id)
    change((r) => { const g = find(r, id); if (g?.parent) g.parent.children = g.parent.children.filter((c) => c.id !== id) })
    setSel(f?.parent?.id ?? root.id)
  }
  const rename = (id: string, text: string): void => change((r) => { const f = find(r, id); if (f) f.n.text = text.trim() || f.n.text })
  const toggle = (id: string): void => change((r) => { const f = find(r, id); if (f && f.n.children.length) f.n.collapsed = !f.n.collapsed })

  const onKey = (e: React.KeyboardEvent): void => {
    if (!root || !sel || editing) return
    const f = find(root, sel)
    if (!f) return
    const sibs = f.parent?.children ?? []
    const i = sibs.findIndex((c) => c.id === sel)
    const keys: Record<string, () => void> = {
      Tab: () => addChild(sel), Enter: () => addSibling(sel), Delete: () => remove(sel), Backspace: () => remove(sel),
      F2: () => setEditing(sel), ' ': () => toggle(sel),
      ArrowRight: () => { if (f.n.children.length && !f.n.collapsed) setSel(f.n.children[0].id) },
      ArrowLeft: () => { if (f.parent) setSel(f.parent.id) },
      ArrowDown: () => { if (i >= 0 && i < sibs.length - 1) setSel(sibs[i + 1].id) },
      ArrowUp: () => { if (i > 0) setSel(sibs[i - 1].id) }
    }
    if (keys[e.key]) { e.preventDefault(); keys[e.key]() }
  }

  /** Ask the chosen agent or assistant for a map, or for ideas under the selected node. */
  const ask = async (mode: 'generate' | 'expand'): Promise<void> => {
    if (!root || !agentId) return
    const target = mode === 'expand' && sel ? find(root, sel)?.n : root
    if (!target) return
    const path: string[] = []
    if (mode === 'expand' && sel) { let p = find(root, sel); while (p) { path.unshift(p.n.text); p = p.parent ? find(root, p.parent.id) : null } }
    const prompt = mode === 'generate'
      ? `Make a mind map about: ${topic.trim() || root.text}\n\nReply with ONLY a nested Markdown bullet list (two-space indents), 5 to 8 main branches, up to 3 levels deep, each item a few words. No title, no other text.`
      : `This is a mind map about "${root.text}". Suggest 4 to 6 short sub-ideas for the branch: ${path.join(' > ')}.\n\nReply with ONLY a Markdown bullet list, one item per line, each a few words. No other text.`
    setBusy(mode); setError(null)
    const r = await window.tyslin.studio.ask(agentId, projectId, prompt, `Mind map: ${root.text}`)
    setBusy(null)
    if (!r.ok) { setError(r.error ?? 'The agent could not answer.'); return }
    const items = parseOutline(r.reply)
    if (!items.length) { setError('The reply had no list to add. Try again, or pick another agent.'); return }
    change((x) => {
      const f = find(x, target.id)
      if (!f) return
      if (mode === 'generate') { if (topic.trim()) f.n.text = topic.trim(); f.n.children = items } else { f.n.children.push(...items); f.n.collapsed = false }
    })
  }

  const exportMd = async (): Promise<void> => {
    if (!root || !file) return
    const f = await window.tyslin.studio.write(projectId, { kind: 'canvas', name: file.name }, toMarkdown(root))
    await window.tyslin.studio.reveal(projectId, f.path)
  }

  useEffect(() => { if (sel && !editing) boardRef.current?.focus() }, [sel, editing])

  const Node = ({ n, depth }: { n: MindNode; depth: number }): JSX.Element => (
    <div className="mm-branch">
      <div className={'mm-node d' + Math.min(depth, 3) + (sel === n.id ? ' on' : '')} onClick={(e) => { e.stopPropagation(); setSel(n.id) }}
        onDoubleClick={(e) => { e.stopPropagation(); setEditing(n.id) }}>
        {editing === n.id ? (
          <input className="mm-input" autoFocus defaultValue={n.text} aria-label="Idea"
            onBlur={(e) => { rename(n.id, e.target.value); setEditing(null) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { rename(n.id, (e.target as HTMLInputElement).value); setEditing(null); e.preventDefault() }
              if (e.key === 'Escape') setEditing(null)
              e.stopPropagation()
            }} />
        ) : <span>{n.text}</span>}
        {n.children.length > 0 && (
          <button type="button" className="mm-fold" aria-label={n.collapsed ? `Expand ${n.text}` : `Collapse ${n.text}`} onClick={(e) => { e.stopPropagation(); toggle(n.id) }}>
            {n.collapsed ? n.children.length : '−'}
          </button>
        )}
      </div>
      {n.children.length > 0 && !n.collapsed && (
        <div className="mm-kids">{n.children.map((c) => <Node key={c.id} n={c} depth={depth + 1} />)}</div>
      )}
    </div>
  )

  return (
    <div className="studio">
      <StudioFiles kind="mindmap" title="Mind mapper" newLabel="New mind map" allLabel="All mind maps" projects={projects} projectId={projectId}
        onProject={(id) => { setProjectId(id); void open(null) }} selected={file?.path ?? null} onSelect={(f) => void open(f)} refreshKey={refresh}
        onNew={(n) => void create(n)} onDelete={async (f) => { await window.tyslin.studio.remove(projectId, f.path); if (file?.path === f.path) void open(null); setRefresh((r) => r + 1) }} />
      <div className="studio-main">
        {!root ? (
          <StudioOverview kind="mindmap" title="Mind mapper" newLabel="New mind map" projectId={projectId} refreshKey={refresh} error={error}
            intro={<>Turn a topic into a map you can grow and edit. Maps are saved in the project folder under <code className="mono">mindmaps/</code>.</>} onOpen={(f) => void open(f)} onNew={(n) => void create(n)} />
        ) : (
          <>
            <div className="studio-bar">
              <strong className="studio-title">{file?.name}</strong>
              <span className="hint">{SAVE_LABEL[save]}</span>
              <span style={{ flex: 1 }} />
              <button type="button" className="btn btn-sm" disabled={!sel} onClick={() => sel && addChild(sel)} title="Tab"><Icon name="plus" size={12} /> Child</button>
              <button type="button" className="btn btn-sm" disabled={!sel} onClick={() => sel && addSibling(sel)} title="Enter">Sibling</button>
              <button type="button" className="btn btn-sm icon-btn" disabled={!sel || sel === root.id} onClick={() => sel && remove(sel)} aria-label="Delete idea" title="Delete"><Icon name="trash" size={13} /></button>
              <button type="button" className="btn btn-sm" onClick={() => void exportMd()}>Export Markdown</button>
              <button type="button" className="btn btn-sm icon-btn" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}><Icon name="minus" size={12} /></button>
              <button type="button" className="btn btn-sm icon-btn" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))}><Icon name="plus" size={12} /></button>
            </div>
            <div className="studio-split">
              <div className="mm-board" ref={boardRef} tabIndex={0} onKeyDown={onKey} onClick={() => setSel(root.id)} aria-label="Mind map. Tab adds a child, Enter a sibling, Delete removes, F2 renames, arrows move.">
                <div className="mm-tree" style={{ transform: `scale(${zoom})` }}><Node n={root} depth={0} /></div>
              </div>
              <aside className="studio-side">
                <span className="section-label" style={{ padding: 0 }}>Grow it with an agent</span>
                <label className="field" style={{ gap: 4 }}><span className="label">Agent or assistant</span><AgentSelect agents={agents} value={agentId} onChange={setAgentId} /></label>
                <label className="field" style={{ gap: 4 }}>
                  <span className="label">Topic</span>
                  <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={root.text} />
                </label>
                <button type="button" className="btn btn-primary" disabled={!!busy || !agentId} onClick={() => {
                  if (root.children.length && !window.confirm('Replace the whole map with a new one from the agent?')) return
                  void ask('generate')
                }}>{busy === 'generate' ? 'Thinking…' : 'Generate map'}</button>
                <button type="button" className="btn" disabled={!!busy || !sel || !agentId} onClick={() => void ask('expand')}>{busy === 'expand' ? 'Thinking…' : 'Expand selected idea'}</button>
                {error && <p className="hint account-error" role="alert">{error}</p>}
                <p className="hint">Each request runs as a chat with the agent, so you'll see it in the status bar and in its chat history.</p>
                <p className="hint"><strong>Keys:</strong> Tab child · Enter sibling · Delete remove · F2 rename · Space fold · arrows move</p>
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
