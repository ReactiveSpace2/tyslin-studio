import { useCurrentProject } from '../currentProject'
import { useEffect, useRef, useState } from 'react'
import type { Agent, KanbanCard, KanbanColumn, KanbanDoc, OrgColor, Project, StudioFile } from '@shared/types'
import { ORG_COLORS } from '@shared/types'
import { DEFAULT_MODEL_AGENT } from '@shared/models'
import { Icon } from '../components/Icon'
import { AgentSelect } from '../components/AgentSelect'
import { SAVE_LABEL, StudioFiles, StudioOverview, useAutosave } from '../components/StudioFiles'
import { modelLabel, useDefaultModel } from '../defaultModel'

interface Props {
  agents: Agent[]
  projects: Project[]
  onOpenChat: (agentId: string, projectId: string | null, sessionId?: string) => void
  /** A file to open straight away (from Drive). */
  initial?: { projectId: string; path: string }
  /** Inside an agency tab: cards run through the agency (assignee, cost, Review), not a plain chat. */
  agencyId?: string
}

const uid = (): string => Math.random().toString(36).slice(2, 10)
const today = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const COLORS = Object.keys(ORG_COLORS) as OrgColor[]

function newBoard(): KanbanDoc {
  return {
    version: 1,
    columns: ['To do', 'In progress', 'Review', 'Done'].map((title) => ({ id: uid(), title, cards: [] })),
    labels: [
      { id: uid(), name: 'Urgent', color: 'coral' },
      { id: uid(), name: 'Research', color: 'teal' },
      { id: uid(), name: 'Writing', color: 'violet' }
    ]
  }
}

function parseBoard(text: string): KanbanDoc {
  const j = JSON.parse(text) as Partial<KanbanDoc>
  return {
    version: 1,
    columns: (j.columns ?? []).map((c) => ({ id: String(c.id ?? uid()), title: String(c.title ?? 'Column'), cards: (c.cards ?? []).map((k) => ({ ...k, labels: k.labels ?? [], notes: k.notes ?? '' })) })),
    labels: j.labels ?? []
  }
}

type DragItem = { kind: 'card'; cardId: string; from: string } | { kind: 'column'; id: string }

/** Kanban: boards of columns and cards in the project folder. Cards can be given to an agent and run. */
export function KanbanPage({ agents, projects, onOpenChat, initial, agencyId }: Props): JSX.Element {
  const dm = useDefaultModel()
  // The project picked in the title bar; App remounts this screen when it changes.
  const [projectId] = useCurrentProject()
  const [file, setFile] = useState<StudioFile | null>(null)
  const [doc, setDoc] = useState<KanbanDoc | null>(null)
  const [dirty, setDirty] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [dragOver, setDragOver] = useState<{ col: string; index: number } | null>(null)
  const [running, setRunning] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const dragItem = useRef<DragItem | null>(null)
  const docRef = useRef(doc)
  docRef.current = doc

  const json = doc ? JSON.stringify(doc, null, 2) : null
  const save = useAutosave(json, dirty, async (v) => { if (file) await window.tyslin.studio.write(projectId, { path: file.path }, v) }, () => { setDirty(false); setRefresh((r) => r + 1) })
  const change = (fn: (d: KanbanDoc) => KanbanDoc): void => {
    const cur = docRef.current
    if (!cur) return
    const next = fn(cur)
    docRef.current = next
    setDoc(next)
    setDirty(true)
  }

  const openFile = async (f: StudioFile | null, pid: string | null = projectId): Promise<void> => {
    setFile(f); setDoc(null); setDirty(false); setOpen(null); setAdding(null)
    if (f) setDoc(parseBoard(await window.tyslin.studio.read(pid, f.path)))
  }
  useEffect(() => {
    if (!initial) return
    const name = initial.path.split('/').pop()!.replace(/\.board\.json$/, '')
    void openFile({ name, path: initial.path, updatedAt: Date.now() }, initial.projectId)
  }, [initial?.path])
  const create = async (name: string): Promise<void> => {
    const d = newBoard()
    const f = await window.tyslin.studio.write(projectId, { kind: 'board', name }, JSON.stringify(d, null, 2))
    setRefresh((x) => x + 1)
    setFile(f); setDoc(d); setDirty(false); setOpen(null)
  }

  // ---------- cards and columns ----------
  const find = (id: string): { col: KanbanColumn; card: KanbanCard } | null => {
    for (const col of docRef.current?.columns ?? []) { const card = col.cards.find((c) => c.id === id); if (card) return { col, card } }
    return null
  }
  const patchCard = (id: string, patch: Partial<KanbanCard>): void =>
    change((d) => ({ ...d, columns: d.columns.map((c) => ({ ...c, cards: c.cards.map((k) => (k.id === id ? { ...k, ...patch } : k)) })) }))
  const addCard = (colId: string): void => {
    const title = draft.trim()
    if (!title) { setAdding(null); return }
    change((d) => ({ ...d, columns: d.columns.map((c) => (c.id === colId ? { ...c, cards: [...c.cards, { id: uid(), title, notes: '', labels: [], createdAt: Date.now() }] } : c)) }))
    setDraft('')
  }
  const removeCard = (id: string): void => {
    change((d) => ({ ...d, columns: d.columns.map((c) => ({ ...c, cards: c.cards.filter((k) => k.id !== id) })) }))
    if (open === id) setOpen(null)
  }
  const moveCard = (cardId: string, toCol: string, index: number): void => change((d) => {
    let card: KanbanCard | undefined
    let fromIdx = -1, fromCol = ''
    for (const c of d.columns) { const i = c.cards.findIndex((k) => k.id === cardId); if (i >= 0) { card = c.cards[i]; fromIdx = i; fromCol = c.id } }
    if (!card) return d
    // Dropping lower in the same column: the card's own slot is removed first.
    const at = fromCol === toCol && fromIdx < index ? index - 1 : index
    const without = d.columns.map((c) => ({ ...c, cards: c.cards.filter((k) => k.id !== cardId) }))
    return { ...d, columns: without.map((c) => (c.id === toCol ? { ...c, cards: [...c.cards.slice(0, at), card!, ...c.cards.slice(at)] } : c)) }
  })
  const moveColumn = (id: string, to: number): void => change((d) => {
    const from = d.columns.findIndex((c) => c.id === id)
    if (from < 0) return d
    const cols = [...d.columns]
    const [c] = cols.splice(from, 1)
    cols.splice(from < to ? to - 1 : to, 0, c)
    return { ...d, columns: cols }
  })
  const addColumn = (): void => change((d) => ({ ...d, columns: [...d.columns, { id: uid(), title: 'New column', cards: [] }] }))
  const removeColumn = (id: string): void => {
    const col = docRef.current?.columns.find((c) => c.id === id)
    if (col?.cards.length && !window.confirm(`Delete "${col.title}" and its ${col.cards.length} cards?`)) return
    change((d) => ({ ...d, columns: d.columns.filter((c) => c.id !== id) }))
  }

  // Agency boards change from the main process (the Lead's tools, finished runs): reload when told.
  useEffect(() => window.tyslin.cards.onBoardChanged(async (p) => {
    if (!file || p.path !== file.path || p.projectId !== projectId) return
    setDoc(parseBoard(await window.tyslin.studio.read(projectId, file.path)))
    setDirty(false)
    void window.tyslin.cards.running().then((ids) => setRunning(Object.fromEntries(ids.map((i) => [i, true]))))
  }), [file?.path, projectId])
  useEffect(() => { if (agencyId) void window.tyslin.cards.running().then((ids) => setRunning(Object.fromEntries(ids.map((i) => [i, true])))) }, [agencyId, file?.path])

  /** Gives the card to its agent (or the default model) as a chat; the reply is saved on the card. */
  const runCard = async (id: string): Promise<void> => {
    const hit = find(id)
    if (!hit || running[id]) return
    const { card, col } = hit
    if (agencyId) {
      // Through the agency: the main process runs it, writes the result, cost and log on the card and moves it.
      setRunning((r) => ({ ...r, [id]: true })); setErrors((e) => ({ ...e, [id]: '' }))
      try { await window.tyslin.cards.run(agencyId, id) } catch (err) {
        setRunning((m) => ({ ...m, [id]: false }))
        setErrors((e) => ({ ...e, [id]: err instanceof Error ? err.message.replace(/^.*Error: /, '') : String(err) }))
      }
      return
    }
    const agentId = card.agentId || DEFAULT_MODEL_AGENT
    const labels = (docRef.current?.labels ?? []).filter((l) => card.labels.includes(l.id)).map((l) => l.name)
    const prompt = [`Work on this task from the "${file?.name ?? 'board'}" board (column: ${col.title}).`, '', `## ${card.title}`, card.notes.trim() ? `\n${card.notes.trim()}` : '',
      labels.length ? `\nLabels: ${labels.join(', ')}` : '', card.due ? `\nDue: ${card.due}` : '', '', 'Reply with the finished work, or the next concrete steps if it needs more than one reply.'].join('\n')
    setRunning((r) => ({ ...r, [id]: true })); setErrors((e) => ({ ...e, [id]: '' }))
    const r = await window.tyslin.studio.ask(agentId, projectId, prompt, `Kanban: ${card.title}`)
    setRunning((m) => ({ ...m, [id]: false }))
    if (!r.ok) { setErrors((e) => ({ ...e, [id]: r.error ?? 'The agent could not answer.' })); if (r.sessionId) patchCard(id, { sessionId: r.sessionId }); return }
    patchCard(id, { result: r.reply.trim(), sessionId: r.sessionId })
    // A card worked on from "To do" moves to the next column, as on a real board.
    const d = docRef.current
    const idx = d ? d.columns.findIndex((c) => c.id === col.id) : -1
    if (d && idx === 0 && d.columns.length > 1) moveCard(id, d.columns[1].id, d.columns[1].cards.length)
  }

  // ---------- drag and drop ----------
  const onCardDragStart = (e: React.DragEvent, cardId: string, from: string): void => {
    dragItem.current = { kind: 'card', cardId, from }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', cardId)
  }
  const overCards = (e: React.DragEvent, colId: string, index: number): void => {
    if (dragItem.current?.kind !== 'card') return
    e.preventDefault()
    e.stopPropagation()
    setDragOver((o) => (o?.col === colId && o.index === index ? o : { col: colId, index }))
  }
  const dropCard = (e: React.DragEvent): void => {
    e.preventDefault()
    const d = dragItem.current
    if (d?.kind === 'card' && dragOver) moveCard(d.cardId, dragOver.col, dragOver.index)
    dragItem.current = null
    setDragOver(null)
  }

  const labels = doc?.labels ?? []
  const match = (k: KanbanCard): boolean => !q.trim() || `${k.title} ${k.notes}`.toLowerCase().includes(q.trim().toLowerCase())
  const sel = open ? find(open) : null
  const agentName = (id?: string): string => (!id || id === DEFAULT_MODEL_AGENT ? (dm ? modelLabel(dm) : 'Default model') : agents.find((a) => a.id === id)?.name ?? 'Missing agent')
  const total = doc?.columns.reduce((n, c) => n + c.cards.length, 0) ?? 0

  return (
    <div className="studio">
      <StudioFiles kind="board" title="Kanban" newLabel="New board" allLabel="All boards" projects={projects} projectId={projectId}
        selected={file?.path ?? null} onSelect={(f) => void openFile(f)} refreshKey={refresh}
        onNew={(n) => void create(n)} onDelete={async (f) => { await window.tyslin.studio.remove(projectId, f.path); if (file?.path === f.path) void openFile(null); setRefresh((r) => r + 1) }} />
      <div className="studio-main">
        {!doc ? (
          <StudioOverview kind="board" title="Kanban" newLabel="New board" projectId={projectId} refreshKey={refresh}
            intro={<>Plan work on boards of columns and cards. Give a card to an agent or the default model and run it; the result is saved on the card. Boards are saved in the project folder under <code className="mono">boards/</code>.</>}
            onOpen={(f) => void openFile(f)} onNew={(n) => void create(n)} />
        ) : (
          <>
            <div className="studio-bar">
              <strong className="studio-title">{file?.name}</strong>
              <span className="hint">{SAVE_LABEL[save]}</span>
              <span className="hint mono">{total} {total === 1 ? 'card' : 'cards'}</span>
              <span style={{ flex: 1 }} />
              <input className="input kb-search" type="search" placeholder="Filter cards" aria-label="Filter cards" value={q} onChange={(e) => setQ(e.target.value)} />
              <button type="button" className="btn btn-sm" onClick={addColumn}><Icon name="plus" size={12} /> Column</button>
            </div>
            <div className="studio-split">
              <div className="kb-board" onDragOver={(e) => { if (dragItem.current) e.preventDefault() }} onDrop={dropCard} onDragEnd={() => { dragItem.current = null; setDragOver(null) }}>
                {doc.columns.map((col, ci) => {
                  const cards = col.cards.filter(match)
                  return (
                    <section key={col.id} className="kb-col" aria-label={col.title}
                      onDragOver={(e) => {
                        if (dragItem.current?.kind === 'column') { e.preventDefault(); return }
                        overCards(e, col.id, col.cards.length)
                      }}
                      onDrop={(e) => {
                        const d = dragItem.current
                        if (d?.kind === 'column') { e.preventDefault(); e.stopPropagation(); moveColumn(d.id, ci); dragItem.current = null }
                      }}>
                      <header className="kb-col-head" draggable onDragStart={(e) => { dragItem.current = { kind: 'column', id: col.id }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', col.id) }}>
                        <input className="kb-col-title" value={col.title} aria-label="Column name"
                          onChange={(e) => change((d) => ({ ...d, columns: d.columns.map((c) => (c.id === col.id ? { ...c, title: e.target.value } : c)) }))} />
                        <span className="kb-count mono">{col.cards.length}</span>
                        <button type="button" className="cv-tool kb-col-del" aria-label={`Delete column ${col.title}`} title="Delete column" onClick={() => removeColumn(col.id)}><Icon name="trash" size={12} /></button>
                      </header>
                      <ul className="kb-cards">
                        {cards.map((k) => {
                          const i = col.cards.indexOf(k)
                          return (
                            <li key={k.id} onDragOver={(e) => { const r = e.currentTarget.getBoundingClientRect(); overCards(e, col.id, e.clientY < r.top + r.height / 2 ? i : i + 1) }}>
                              {dragOver?.col === col.id && dragOver.index === i && <div className="kb-drop" />}
                              <button type="button" className={'kb-card' + (open === k.id ? ' on' : '')} draggable onDragStart={(e) => onCardDragStart(e, k.id, col.id)} onClick={() => setOpen(k.id)}>
                                {k.labels.length > 0 && (
                                  <span className="kb-labels">
                                    {labels.filter((l) => k.labels.includes(l.id)).map((l) => <span key={l.id} className="kb-label" style={{ background: ORG_COLORS[l.color].fill }}>{l.name}</span>)}
                                  </span>
                                )}
                                <strong>{k.title}</strong>
                                <span className="kb-meta">
                                  {k.due && <span className={'mono' + (k.due < today() && ci < doc.columns.length - 1 ? ' kb-late' : '')}><Icon name="clock" size={11} /> {k.due}</span>}
                                  {k.agentId && <span><Icon name="agents" size={11} /> {agentName(k.agentId)}</span>}
                                  {running[k.id] && <span className="kb-running">Working…</span>}
                                  {!running[k.id] && k.result && <span className="kb-done"><Icon name="check" size={11} /> Result</span>}
                                </span>
                              </button>
                            </li>
                          )
                        })}
                        {dragOver?.col === col.id && dragOver.index >= col.cards.length && <li className="kb-drop" aria-hidden="true" />}
                      </ul>
                      {adding === col.id ? (
                        <form className="kb-add" onSubmit={(e) => { e.preventDefault(); addCard(col.id) }}>
                          <textarea className="textarea" autoFocus rows={2} value={draft} placeholder="Card title" aria-label="Card title" onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addCard(col.id) } if (e.key === 'Escape') { setAdding(null); setDraft('') } }} />
                          <div className="row" style={{ gap: 6 }}>
                            <button type="submit" className="btn btn-sm btn-primary">Add card</button>
                            <button type="button" className="btn btn-sm" onClick={() => { setAdding(null); setDraft('') }}>Cancel</button>
                          </div>
                        </form>
                      ) : (
                        <button type="button" className="kb-add-btn" onClick={() => { setAdding(col.id); setDraft('') }}><Icon name="plus" size={12} /> Add a card</button>
                      )}
                    </section>
                  )
                })}
                <button type="button" className="kb-col kb-new-col" onClick={addColumn}><Icon name="plus" size={14} /> Add column</button>
              </div>
              {sel && (
                <aside className="studio-side kb-side" aria-label="Card">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="section-label" style={{ padding: 0 }}>Card</span>
                    <button type="button" className="cv-tool" aria-label="Close card" onClick={() => setOpen(null)}><Icon name="close" size={13} /></button>
                  </div>
                  <textarea className="kb-title-edit" rows={2} value={sel.card.title} aria-label="Card title" onChange={(e) => patchCard(sel.card.id, { title: e.target.value })} />
                  <label className="field" style={{ gap: 4 }}><span className="label">Notes</span>
                    <textarea className="textarea" rows={5} value={sel.card.notes} placeholder="What needs doing, links, acceptance criteria…" onChange={(e) => patchCard(sel.card.id, { notes: e.target.value })} />
                  </label>
                  <div className="field" style={{ gap: 6 }}>
                    <span className="label">Labels</span>
                    <div className="kb-label-pick">
                      {labels.map((l) => {
                        const on = sel.card.labels.includes(l.id)
                        return (
                          <button key={l.id} type="button" className={'kb-label kb-label-btn' + (on ? ' on' : '')} aria-pressed={on} style={{ background: on ? ORG_COLORS[l.color].fill : undefined, borderColor: ORG_COLORS[l.color].fill }}
                            onClick={() => patchCard(sel.card.id, { labels: on ? sel.card.labels.filter((x) => x !== l.id) : [...sel.card.labels, l.id] })}>{l.name}</button>
                        )
                      })}
                      <button type="button" className="kb-label kb-label-btn" onClick={() => {
                        const name = window.prompt('Label name')?.trim()
                        if (!name) return
                        const label = { id: uid(), name: name.slice(0, 24), color: COLORS[labels.length % COLORS.length] }
                        change((d) => ({ ...d, labels: [...d.labels, label] }))
                        patchCard(sel.card.id, { labels: [...sel.card.labels, label.id] })
                      }}><Icon name="plus" size={10} /> Label</button>
                    </div>
                  </div>
                  <div className="cv-grid">
                    <label className="cv-num"><span>Due</span><input className="input mono" type="date" value={sel.card.due ?? ''} onChange={(e) => patchCard(sel.card.id, { due: e.target.value || undefined })} /></label>
                    <label className="cv-num"><span>Column</span>
                      <select className="select" value={sel.col.id} onChange={(e) => moveCard(sel.card.id, e.target.value, doc.columns.find((c) => c.id === e.target.value)?.cards.length ?? 0)}>
                        {doc.columns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                      </select>
                    </label>
                  </div>
                  <label className="field" style={{ gap: 4 }}><span className="label">Assigned to</span>
                    <AgentSelect agents={agencyId ? agents.filter((a) => a.agency === agencyId) : agents} value={sel.card.assignee || sel.card.agentId || DEFAULT_MODEL_AGENT}
                      onChange={(v) => patchCard(sel.card.id, agencyId ? { assignee: v === DEFAULT_MODEL_AGENT ? undefined : v, agentId: v === DEFAULT_MODEL_AGENT ? undefined : v } : { agentId: v })} />
                  </label>
                  <button type="button" className="btn btn-primary" disabled={!!running[sel.card.id]} onClick={() => void runCard(sel.card.id)}>
                    <Icon name="play" size={12} /> {running[sel.card.id] ? 'Working…' : sel.card.result ? 'Run again' : agencyId ? 'Run card' : 'Run with agent'}
                  </button>
                  {agencyId && (sel.card.status || sel.card.cost !== undefined) && (
                    <p className="hint mono" style={{ margin: 0 }}>
                      {sel.card.status === 'running' ? 'Running' : sel.card.status === 'failed' ? 'Last run failed' : sel.card.status === 'done' ? 'Finished' : ''}
                      {sel.card.cost !== undefined ? ` · cost ${sel.card.cost.toFixed(4)} (estimate)` : sel.card.status === 'done' ? ' · cost not reported' : ''}
                    </p>
                  )}
                  {errors[sel.card.id] && <p className="hint account-error" role="alert">{errors[sel.card.id]}</p>}
                  {sel.card.result && (
                    <div className="au-output">
                      <span className="section-label" style={{ padding: 0 }}>Result</span>
                      <pre>{sel.card.result}</pre>
                    </div>
                  )}
                  {sel.card.sessionId && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => onOpenChat(sel.card.agentId || DEFAULT_MODEL_AGENT, projectId, sel.card.sessionId)}>Open chat</button>}
                  {!!sel.card.log?.length && (
                    <div className="kb-log">
                      <span className="section-label" style={{ padding: 0 }}>Log</span>
                      {sel.card.log.slice(-8).map((l, i) => <span key={i} className="hint"><span className="mono">{new Date(l.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span> {l.text}</span>)}
                    </div>
                  )}
                  <div className="cv-actions">
                    <button type="button" className="btn btn-sm cv-danger" onClick={() => { if (window.confirm(`Delete "${sel.card.title}"?`)) removeCard(sel.card.id) }}><Icon name="trash" size={12} /> Delete card</button>
                  </div>
                </aside>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
