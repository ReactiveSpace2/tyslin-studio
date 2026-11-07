import { useCurrentProject } from '../currentProject'
import { useEffect, useRef, useState } from 'react'
import type { Agent, KanbanCard, KanbanColumn, KanbanDoc, OrgColor, Project, StudioFile } from '@shared/types'
import { ORG_COLORS } from '@shared/types'
import { DEFAULT_MODEL_AGENT } from '@shared/models'
import { Icon } from '../components/Icon'
import { AgentSelect } from '../components/AgentSelect'
import { SAVE_LABEL, StudioFiles, StudioOverview, useAutosave } from '../components/StudioFiles'
import { modelLabel, useDefaultModel } from '../defaultModel'
import { firstName } from '../boardStats'
import { Pose } from '../components/Pose'
import { Avatar } from '../components/Avatar'
import { WorkingBorder, WorkingDots } from '../components/Working'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/** Label fills are the fixed organization colours (not themed), so their text stays ink in both themes. */
const LABEL_INK = '#0F0F0D'
/** Small mono caption used for the sheet's sections. */
const CAPTION = 'font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase'

interface Props {
  agents: Agent[]
  projects: Project[]
  onOpenChat: (agentId: string, projectId: string | null, sessionId?: string) => void
  /** A file to open straight away (from Drive). */
  initial?: { projectId: string; path: string }
  /** Inside an agency tab: cards run through the agency (assignee, cost, Review), not a plain chat. */
  agencyId?: string
  /** The agency's Lead, for the empty board's hint. */
  leadName?: string
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
export function KanbanPage({ agents, projects, onOpenChat, initial, agencyId, leadName }: Props): JSX.Element {
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

  const agentOf = (id?: string): Agent | undefined => (id && id !== DEFAULT_MODEL_AGENT ? agents.find((a) => a.id === id) : undefined)

  return (
    <div className="tw flex h-full text-foreground">
      <StudioFiles kind="board" title="Kanban" newLabel="New board" allLabel="All boards" projects={projects} projectId={projectId}
        selected={file?.path ?? null} onSelect={(f) => void openFile(f)} refreshKey={refresh}
        onNew={(n) => void create(n)} onDelete={async (f) => { await window.tyslin.studio.remove(projectId, f.path); if (file?.path === f.path) void openFile(null); setRefresh((r) => r + 1) }} />
      <div className="flex min-w-0 flex-1 flex-col">
        {!doc ? (
          <StudioOverview kind="board" title="Kanban" newLabel="New board" projectId={projectId} refreshKey={refresh}
            intro={<>Your agency works from a board. Drop a brief in Inbox; the Lead turns it into cards and workers run them. Finished work waits in Review for you. Boards are saved in the agency's folder under <code className="font-mono">boards/</code>.</>}
            onOpen={(f) => void openFile(f)} onNew={(n) => void create(n)} />
        ) : (
          <>
            <header className="flex min-h-14 flex-none flex-wrap items-center gap-3 border-b border-border px-6 py-2.5">
              <h1 className="max-w-[320px] truncate text-lg font-semibold">{file?.name}</h1>
              <span className="text-xs text-muted-foreground">{SAVE_LABEL[save]}</span>
              <span className="font-mono text-xs text-muted-foreground">{total} {total === 1 ? 'card' : 'cards'}</span>
              <span className="flex-1" />
              <Input className="w-[220px]" type="search" placeholder="Filter cards" aria-label="Filter cards" value={q} onChange={(e) => setQ(e.target.value)} />
              <Button variant="outline" onClick={addColumn}><Icon name="plus" size={12} /> Column</Button>
            </header>
            <div className="flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 items-start gap-3.5 overflow-auto px-6 py-5" onDragOver={(e) => { if (dragItem.current) e.preventDefault() }} onDrop={dropCard} onDragEnd={() => { dragItem.current = null; setDragOver(null) }}>
                {doc.columns.map((col, ci) => {
                  const cards = col.cards.filter(match)
                  return (
                    <section key={col.id} className="flex max-h-full w-[280px] flex-none flex-col gap-2.5 rounded-xl border border-border bg-muted p-2.5" aria-label={col.title}
                      onDragOver={(e) => {
                        if (dragItem.current?.kind === 'column') { e.preventDefault(); return }
                        overCards(e, col.id, col.cards.length)
                      }}
                      onDrop={(e) => {
                        const d = dragItem.current
                        if (d?.kind === 'column') { e.preventDefault(); e.stopPropagation(); moveColumn(d.id, ci); dragItem.current = null }
                      }}>
                      <header className="group flex cursor-grab items-center gap-1.5 px-0.5 pt-0.5" draggable onDragStart={(e) => { dragItem.current = { kind: 'column', id: col.id }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', col.id) }}>
                        <Input className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-1.5 text-sm font-semibold shadow-none hover:border-border focus-visible:bg-card dark:bg-transparent" value={col.title} aria-label="Column name"
                          onChange={(e) => change((d) => ({ ...d, columns: d.columns.map((c) => (c.id === col.id ? { ...c, title: e.target.value } : c)) }))} />
                        <Badge variant="outline" className="bg-card font-mono text-muted-foreground">{col.cards.length}</Badge>
                        <Button variant="ghost" size="icon" className="size-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Delete column ${col.title}`} title="Delete column" onClick={() => removeColumn(col.id)}><Icon name="trash" size={12} /></Button>
                      </header>
                      <ul className="flex min-h-2 flex-col gap-2.5 overflow-y-auto p-0.5">
                        {agencyId && total === 0 && ci === 0 && (
                          <li className="flex flex-col items-center gap-2 px-1 py-2.5 text-center text-[13px] leading-snug text-muted-foreground">
                            <Pose pose={5} height={110} />Drop a brief in Inbox and {leadName ? firstName(leadName) : 'your Lead'} will plan it.
                          </li>
                        )}
                        {cards.map((k) => {
                          const i = col.cards.indexOf(k)
                          const who = agentOf(k.assignee || k.agentId)
                          return (
                            <li key={k.id} onDragOver={(e) => { const r = e.currentTarget.getBoundingClientRect(); overCards(e, col.id, e.clientY < r.top + r.height / 2 ? i : i + 1) }}>
                              {dragOver?.col === col.id && dragOver.index === i && <div className="-mt-0.5 mb-1.5 h-1 rounded bg-green" />}
                              <button type="button"
                                className={cn('relative flex w-full cursor-grab flex-col gap-2.5 rounded-xl border border-border bg-card p-3 text-left text-foreground shadow-xs transition-colors outline-none hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/40',
                                  open === k.id && 'border-foreground ring-1 ring-foreground')}
                                draggable onDragStart={(e) => onCardDragStart(e, k.id, col.id)} onClick={() => setOpen(k.id)}>
                                {running[k.id] && <WorkingBorder />}
                                {k.labels.length > 0 && (
                                  <span className="flex flex-wrap gap-1">
                                    {labels.filter((l) => k.labels.includes(l.id)).map((l) => <span key={l.id} className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: ORG_COLORS[l.color].fill, color: LABEL_INK }}>{l.name}</span>)}
                                  </span>
                                )}
                                <strong className="text-sm leading-snug font-semibold [overflow-wrap:anywhere]">{k.title}</strong>
                                {k.notes.trim() && <span className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">{k.notes.trim()}</span>}
                                <span className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                                    {k.agentId && (
                                      <span className="inline-flex min-w-0 items-center gap-1.5 text-foreground">
                                        {who ? <Avatar shape={who.shape} tone={who.tone} head={who.head} size={22} /> : <Icon name="agents" size={11} />}
                                        <span className="truncate">{agentName(k.agentId)}</span>
                                      </span>
                                    )}
                                    {k.due && <span className={cn('inline-flex items-center gap-1 font-mono', k.due < today() && ci < doc.columns.length - 1 && 'text-destructive')}><Icon name="clock" size={11} /> {k.due}</span>}
                                  </span>
                                  {running[k.id] && <Badge variant="soft">Working…<WorkingDots /></Badge>}
                                  {!running[k.id] && k.result && <Badge variant="secondary"><Icon name="check" size={11} /> Result</Badge>}
                                </span>
                              </button>
                            </li>
                          )
                        })}
                        {dragOver?.col === col.id && dragOver.index >= col.cards.length && <li className="-mt-0.5 mb-1.5 h-1 list-none rounded bg-green" aria-hidden="true" />}
                      </ul>
                      {adding === col.id ? (
                        <form className="flex flex-col gap-1.5" onSubmit={(e) => { e.preventDefault(); addCard(col.id) }}>
                          <Textarea autoFocus rows={2} value={draft} placeholder="Card title" aria-label="Card title" onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addCard(col.id) } if (e.key === 'Escape') { setAdding(null); setDraft('') } }} />
                          <div className="flex gap-1.5">
                            <Button type="submit" size="sm">Add card</Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => { setAdding(null); setDraft('') }}>Cancel</Button>
                          </div>
                        </form>
                      ) : (
                        <Button variant="ghost" className="h-9 justify-start px-2 font-normal text-muted-foreground hover:bg-card" onClick={() => { setAdding(col.id); setDraft('') }}><Icon name="plus" size={12} /> Add a card</Button>
                      )}
                    </section>
                  )
                })}
                <button type="button" className="flex min-h-[52px] w-[220px] flex-none items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-strong text-[13px] text-muted-foreground transition-colors outline-none hover:bg-card hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40" onClick={addColumn}><Icon name="plus" size={14} /> Add column</button>
              </div>
              {sel && (
                <aside className="flex w-[400px] max-w-full flex-none flex-col gap-4 overflow-y-auto border-l border-border bg-card p-6 shadow-lg [&>*]:flex-none" aria-label="Card">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex flex-col gap-2">
                      <span className={CAPTION}>Card</span>
                      <Badge variant="secondary">{sel.col.title}</Badge>
                    </span>
                    <Button variant="ghost" size="icon" aria-label="Close card" onClick={() => setOpen(null)}><Icon name="close" size={13} /></Button>
                  </div>
                  <Textarea className="min-h-0 w-full resize-none border-transparent bg-transparent px-1.5 py-1 text-xl leading-snug font-semibold tracking-tight shadow-none hover:border-border md:text-xl dark:bg-transparent" rows={2} value={sel.card.title} aria-label="Card title" onChange={(e) => patchCard(sel.card.id, { title: e.target.value })} />
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="kb-notes" className="text-[13px] text-muted-foreground">Notes</Label>
                    <Textarea id="kb-notes" rows={5} value={sel.card.notes} placeholder="What needs doing, links, acceptance criteria…" onChange={(e) => patchCard(sel.card.id, { notes: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span id="kb-labels" className="text-[13px] font-medium text-muted-foreground">Labels</span>
                    <div className="flex flex-wrap items-center gap-1.5" aria-labelledby="kb-labels" role="group">
                      {labels.filter((l) => sel.card.labels.includes(l.id)).map((l) => (
                        <span key={l.id} className="inline-flex min-h-7 items-center rounded-full border-[1.5px] px-2.5 text-[11px] font-semibold"
                          style={{ background: ORG_COLORS[l.color].fill, borderColor: ORG_COLORS[l.color].fill, color: LABEL_INK }}>{l.name}</span>
                      ))}
                      <LabelPicker labels={labels} chosen={sel.card.labels}
                        onToggle={(id) => patchCard(sel.card.id, { labels: sel.card.labels.includes(id) ? sel.card.labels.filter((x) => x !== id) : [...sel.card.labels, id] })}
                        onCreate={(name) => {
                          const label = { id: uid(), name: name.slice(0, 24), color: COLORS[labels.length % COLORS.length] }
                          change((d) => ({ ...d, labels: [...d.labels, label] }))
                          patchCard(sel.card.id, { labels: [...sel.card.labels, label.id] })
                        }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="kb-due" className="text-xs font-normal text-muted-foreground">Due</Label>
                      <Input id="kb-due" className="px-2 font-mono" type="date" value={sel.card.due ?? ''} onChange={(e) => patchCard(sel.card.id, { due: e.target.value || undefined })} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="kb-col" className="text-xs font-normal text-muted-foreground">Column</Label>
                      <Select value={sel.col.id} onValueChange={(v) => moveCard(sel.card.id, v, doc.columns.find((c) => c.id === v)?.cards.length ?? 0)}>
                        <SelectTrigger id="kb-col" className="w-full min-w-0 bg-card"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {doc.columns.map((c) => <SelectItem key={c.id} value={c.id}>{c.title || 'Untitled column'}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="kb-assignee" className="text-[13px] text-muted-foreground">Assigned to</Label>
                    <AgentSelect id="kb-assignee" agents={agencyId ? agents.filter((a) => a.agency === agencyId) : agents} value={sel.card.assignee || sel.card.agentId || DEFAULT_MODEL_AGENT}
                      onChange={(v) => patchCard(sel.card.id, agencyId ? { assignee: v === DEFAULT_MODEL_AGENT ? undefined : v, agentId: v === DEFAULT_MODEL_AGENT ? undefined : v } : { agentId: v })} />
                  </div>
                  <Button disabled={!!running[sel.card.id]} onClick={() => void runCard(sel.card.id)}>
                    <Icon name="play" size={12} /> {running[sel.card.id] ? 'Working…' : sel.card.result ? 'Run again' : agencyId ? 'Run card' : 'Run with agent'}
                  </Button>
                  {agencyId && (sel.card.status || sel.card.cost !== undefined) && (
                    <p className="font-mono text-xs text-muted-foreground">
                      {sel.card.status === 'running' ? 'Running' : sel.card.status === 'failed' ? 'Last run failed' : sel.card.status === 'done' ? 'Finished' : ''}
                      {sel.card.cost !== undefined ? ` · cost ${sel.card.cost.toFixed(4)} (estimate)` : sel.card.status === 'done' ? ' · cost not reported' : ''}
                    </p>
                  )}
                  {errors[sel.card.id] && <p className="rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive" role="alert">{errors[sel.card.id]}</p>}
                  {sel.card.result && (
                    <div className="flex flex-col gap-2 border-t border-border pt-3">
                      <span className={CAPTION}>Result</span>
                      <pre className="max-h-[320px] overflow-auto rounded-lg border border-border bg-muted p-3 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap">{sel.card.result}</pre>
                    </div>
                  )}
                  {sel.card.sessionId && <Button variant="link" className="h-auto self-start px-0" onClick={() => onOpenChat(sel.card.agentId || DEFAULT_MODEL_AGENT, projectId, sel.card.sessionId)}>Open chat</Button>}
                  {!!sel.card.log?.length && (
                    <div className="flex flex-col gap-2 border-t border-border pt-3">
                      <span className={CAPTION}>Log</span>
                      <ol className="flex list-none flex-col gap-1.5 p-0 text-[13px] text-muted-foreground">
                        {sel.card.log.slice(-8).map((l, i) => <li key={i}><span className="font-mono text-xs">{new Date(l.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span> {l.text}</li>)}
                      </ol>
                    </div>
                  )}
                  <div className="mt-auto flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                    <Button variant="outline" size="sm" className="hover:border-destructive hover:text-destructive" onClick={() => { if (window.confirm(`Delete "${sel.card.title}"?`)) removeCard(sel.card.id) }}><Icon name="trash" size={12} /> Delete card</Button>
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

/** The card's label picker: every board label as a toggle, plus a new label by name. */
function LabelPicker({ labels, chosen, onToggle, onCreate }: { labels: KanbanDoc['labels']; chosen: string[]; onToggle: (id: string) => void; onCreate: (name: string) => void }): JSX.Element {
  const [name, setName] = useState('')
  return (
    <Popover onOpenChange={(o) => { if (!o) setName('') }}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex min-h-7 items-center gap-1 rounded-full border-[1.5px] border-border bg-card px-2.5 text-[11px] font-semibold text-foreground outline-none hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/40">
          <Icon name="plus" size={10} /> Label
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-60 flex-col gap-1 p-1.5">
        {labels.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0" aria-label="Board labels">
            {labels.map((l) => {
              const on = chosen.includes(l.id)
              return (
                <li key={l.id}>
                  <button type="button" aria-pressed={on} onClick={() => onToggle(l.id)}
                    className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40">
                    <span className="size-3 flex-none rounded-full" style={{ background: ORG_COLORS[l.color].fill }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{l.name}</span>
                    {on && <Icon name="check" size={12} />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <form className="flex items-center gap-1.5 border-t border-border p-1 pt-2 first:border-t-0 first:pt-1" onSubmit={(e) => { e.preventDefault(); const n = name.trim(); if (n) { onCreate(n); setName('') } }}>
          <Input className="h-8 min-w-0 flex-1" value={name} maxLength={24} placeholder="New label" aria-label="Label name" onChange={(e) => setName(e.target.value)} />
          <Button type="submit" size="sm" disabled={!name.trim()}>Add</Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
