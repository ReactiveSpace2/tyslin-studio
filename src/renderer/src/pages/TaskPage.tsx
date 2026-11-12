import { useEffect, useRef, useState } from 'react'
import type { Agent, Attachment, Session } from '@shared/types'
import type { AgencyView } from '../agencies'
import { firstName } from '../boardStats'
import { Avatar } from '../components/Avatar'
import { Composer } from '../components/Composer'
import { Icon } from '../components/Icon'
import { ChangesPanel, type Review } from '../task/ChangesPanel'
import { DetailsPanel } from '../task/DetailsPanel'
import { AgencyPageView, shownPages } from '../agency/pages'
import { PreviewPanel } from '../task/PreviewPanel'
import { TaskHeader, type Pane } from '../task/TaskHeader'
import { Thread } from '../task/Thread'
import { ToolsPill } from '../task/ToolsPill'
import type { ToolDef } from '@shared/toolCatalog'
import type { McpServerInfo, Skill } from '@shared/types'
import { useTask } from '../task/useTask'
import { Button } from '@/components/ui/button'

const PANE_TITLE: Record<'details' | 'changes' | 'preview' | '', string> = { details: 'Details', changes: 'Changes', preview: 'Preview', '': '' }

interface Props {
  sessionId: string
  agent: Agent
  view: AgencyView | null
  sessions: Session[]
  focus?: string
  /** Slot in the window's header for the title menu and panel switches. */
  setHeader: (node: JSX.Element | null) => void
  onSessionsChanged: () => void
  /** Agents changed from the task (a skill attached): App reloads them. */
  onAgentsChanged: () => void
  onOpenAgency: () => void
  onOpenAgent: (a: Agent) => void
  onConnectors: () => void
  onFiles: () => void
  onSettings: () => void
  onTalkTo: (a: Agent) => void
  onBackToLead: (() => void) | null
  onDeleted: () => void
}

/** A task: the conversation in the middle, the composer under it, and one right panel (Details, Changes or Preview). */
export function TaskPage({ sessionId, agent, view, sessions, focus, setHeader, onSessionsChanged, onAgentsChanged, onOpenAgency, onOpenAgent, onConnectors, onFiles, onSettings, onTalkTo, onBackToLead, onDeleted }: Props): JSX.Element {
  const task = useTask(sessionId, agent, view, sessions, onSessionsChanged)
  const [text, setText] = useState('')
  const [attached, setAttached] = useState<Attachment[]>([])
  const [pane, setPane] = useState<Pane>('')
  const agencyPage = pane.startsWith('page:') ? shownPages(view).find((p) => `page:${p.id}` === pane) : undefined
  const paneTitle = agencyPage ? agencyPage.title : PANE_TITLE[pane as keyof typeof PANE_TITLE] ?? ''
  const [review, setReview] = useState<Review | null>(null)
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  // Expand (Claude's artifact panel): Preview takes the whole task; the conversation comes back with collapse or close.
  const [wide, setWide] = useState(false)
  const expanded = wide && pane === 'preview'
  const openPreview = (p: string): void => { setPreviewPath(p); setPane('preview') }
  // A file's card in the conversation opens it full screen; the panel's close button brings the conversation back.
  const openPreviewFull = (p: string): void => { openPreview(p); setWide(true) }
  // The agency's next task after this one: files changed from then on belong to it, not to this conversation.
  const started = task.session?.createdAt ?? 0
  const nextTask = sessions.filter((s) => s.projectId === task.session?.projectId && s.id !== sessionId && !s.title.startsWith('Card: ') && s.messageCount > 0 && s.createdAt > started).reduce<number | null>((min, s) => (min === null || s.createdAt < min ? s.createdAt : min), null)
  const composerRef = useRef<HTMLDivElement>(null)
  // Tools from the chat (owner, 12 Nov 2026: B + C + D on the canvas): the organization's connectors, a setup card
  // in the thread, and the "Tools · n" overview under the box.
  const [servers, setServers] = useState<McpServerInfo[]>([])
  const [toolSetup, setToolSetup] = useState<{ tool: ToolDef; agentIds: string[] } | null>(null)
  const loadServers = (): void => { void window.tyslin.integrations.list().then(setServers).catch(() => undefined) }
  useEffect(loadServers, [sessionId])
  const [skills, setSkills] = useState<Skill[]>([])
  useEffect(() => { void window.tyslin.skills.list().then(setSkills).catch(() => undefined) }, [sessionId])
  const testServer = async (id: string): Promise<void> => { try { const r = await window.tyslin.integrations.test(id); setServers((l) => l.map((x) => (x.id === r.id ? r : x))) } catch { /* shown as not tested */ } }
  const team = view ? [view.lead, ...view.workers].filter((a): a is Agent => !!a) : [agent]
  const running = task.streaming !== null
  const pendingOwn = task.changes.filter((c) => c.status === 'pending')

  const openReview = (changes: Review['changes'], from: { agent: Agent | null; card: Review['card']; message: Review['message']; sessionId: string }): void => {
    setReview({ changes, ...from })
    setPane('changes')
  }
  // Workers' changes waiting for review (an adapter's run stays open until they are answered), so Changes and its
  // count show them without opening the worker's fold first (QA, 10 Nov 2026).
  const [workerReview, setWorkerReview] = useState<Review | null>(null)
  const stagedKey = task.cards.map((c) => `${c.id}:${c.sessionId ?? ''}:${c.status ?? ''}:${task.workerRuns[c.id]?.staged ?? 0}`).join(',')
  useEffect(() => {
    let live = true
    const withChat = task.cards.filter((c) => c.sessionId)
    void Promise.all(withChat.map((c) => window.tyslin.changes.list(c.sessionId!).then((list) => ({ c, list })))).then((all) => {
      if (!live) return
      const hit = all.find(({ list }) => list.some((x) => x.status === 'pending'))
      if (!hit) { setWorkerReview(null); return }
      const who = [view?.lead, ...(view?.workers ?? [])].find((a) => a && a.id === (hit.c.assignee || hit.c.agentId)) ?? null
      setWorkerReview({ changes: hit.list, sessionId: hit.c.sessionId!, agent: who, card: hit.c, message: task.channel.find((m) => m.kind === 'review' && m.cardId === hit.c.id && !m.reply) ?? null })
    }).catch(() => undefined)
    return () => { live = false }
  }, [stagedKey])
  const pendingWorkers = workerReview?.changes.filter((c) => c.status === 'pending').length ?? 0
  // Changes with nothing picked: this task's own pending changes, else a worker's.
  const shownReview: Review | null = review ?? (pendingOwn.length ? { changes: task.changes.filter((c) => c.runId === pendingOwn[0].runId), sessionId, agent, card: null, message: null } : workerReview)
  const refreshReview = async (): Promise<void> => {
    const r0 = review ?? (pendingOwn.length ? null : workerReview)
    if (!r0) { await task.reloadChanges(); return }
    const c = await window.tyslin.changes.list(r0.sessionId)
    if (!review) { setWorkerReview((r) => (r ? { ...r, changes: c } : r)); task.reloadChannel(); return }
    setReview((r) => (r ? { ...r, changes: c } : r))
    if (review.sessionId === sessionId) await task.reloadChanges()
    task.reloadChannel()
  }

  useEffect(() => {
    setHeader(
      <TaskHeader session={task.session} agent={agent} view={view} running={running} pane={pane} pendingChanges={pendingOwn.length + pendingWorkers}
        onPane={setPane} onRenamed={onSessionsChanged} onOpenAgency={onOpenAgency} onTalkTo={onTalkTo} onDeleted={onDeleted} />
    )
    return () => setHeader(null)
  }, [task.session?.id, task.session?.title, agent.id, view?.agency.id, running, pane, pendingOwn.length, pendingWorkers])

  const send = async (): Promise<void> => {
    const t = text, a = attached
    setText(''); setAttached([])
    try { await task.send(t, a) } catch { setText((cur) => cur || t); setAttached((cur) => (cur.length ? cur : a)) }
  }
  const isLead = !!view && view.lead?.id === agent.id

  return (
    <div className="flex h-full min-h-0">
      <section className={expanded ? 'hidden' : 'flex min-w-0 flex-1 flex-col'} aria-label="Conversation">
        {!isLead && view && (
          <div className="flex flex-none items-center gap-2.5 border-b border-border bg-lime-soft px-5 py-2 text-[13px]">
            <Avatar shape={agent.shape} tone={agent.tone} head={agent.head} size={20} />
            {/* A card chat (cards.ts titles them "Card: …") is the Lead's hand-out, not a direct chat (QA, 10 Nov 2026). */}
            {task.session?.title.startsWith('Card: ')
              ? <span className="min-w-0 flex-1"><strong>{firstName(agent.name)}</strong>'s work on a card {view.lead ? `${firstName(view.lead.name)} handed out` : 'from the plan'}. File changes come to you for review.</span>
              : <span className="min-w-0 flex-1">You're talking to <strong>{firstName(agent.name)}</strong> directly. {view.lead ? `${firstName(view.lead.name)} isn't planning this;` : ''} file changes still come to you for review.</span>}
            {onBackToLead && view.lead && <Button variant="ghost" size="sm" className="h-8" onClick={onBackToLead}>Back to {firstName(view.lead.name)}</Button>}
          </div>
        )}
        <Thread task={task} agent={agent} view={view} sessionId={sessionId} focus={focus} until={nextTask} onPreview={openPreviewFull} servers={servers} toolSetup={toolSetup} onToolSetup={setToolSetup} onToolConnected={(s) => { setServers((l) => [...l.filter((x) => x.id !== s.id), s]); onSessionsChanged() }} skills={skills} onAgentsChanged={onAgentsChanged} onConnectors={onConnectors} onReview={openReview}
          onAskLead={() => { composerRef.current?.querySelector('textarea')?.focus(); setText((t) => t || `${firstName(agent.name)}, change the plan: `) }}
          onOpenAgency={onOpenAgency} onSettings={onSettings} onChanged={onSessionsChanged} />
        <div ref={composerRef} className="mx-auto w-full max-w-[760px] flex-none px-6 pt-2 pb-4">
          <Composer agencies={view ? [view] : []} agencyId={view?.agency.id ?? null} onOpenAgency={view ? onOpenAgency : undefined} agent={agent}
            footer={view ? <ToolsPill agencyName={view.agency.name} team={team} servers={servers} onTest={testServer} onAdd={(tool) => setToolSetup({ tool, agentIds: team.filter((a) => a.engine !== 'builtin').map((a) => a.id) })} onMore={onConnectors} className="h-8 gap-1.5 px-2 font-mono text-xs text-muted-foreground has-[>svg]:px-2" /> : undefined} value={text} onChange={setText} attached={attached} onAttached={setAttached}
            running={running} onSend={() => void send()} onStop={() => void task.stop()} placeholder={`Message ${firstName(agent.name)}…`} label={`Message ${agent.name}`} />
        </div>
      </section>
      {pane && (
        <aside className={expanded ? 'flex min-w-0 flex-1 flex-col overflow-hidden bg-background' : pane === 'preview' || pane.startsWith('page:') ? 'flex w-[min(640px,52%)] min-w-[420px] flex-none flex-col overflow-hidden border-l border-border bg-background' : 'flex w-[380px] min-w-[300px] max-w-[480px] flex-none flex-col overflow-hidden border-l border-border bg-background'} aria-label={paneTitle}>
          <div className="flex h-10 flex-none items-center justify-between border-b border-border pr-1 pl-4">
            <span className="text-[13px] font-semibold">{paneTitle}</span>
            <Button variant="ghost" size="icon" className="size-8" aria-label="Close panel" onClick={() => { setPane(''); setWide(false) }}><Icon name="close" size={14} /></Button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {pane === 'details' && <DetailsPanel view={view} agent={agent} taskId={sessionId} cards={task.cards} channel={task.channel} onOpenAgency={onOpenAgency} onOpenAgent={onOpenAgent} onConnectors={onConnectors} onFiles={onFiles} onPreview={openPreview} />}
            {agencyPage && view && <div className="flex flex-col gap-3 p-4"><AgencyPageView view={view} page={agencyPage} /></div>}
            {pane === 'preview' && view && <PreviewPanel view={view} agent={agent} path={previewPath} onPath={setPreviewPath} onSend={task.send} expanded={expanded} onExpand={() => setWide((w) => !w)} />}
            {pane === 'changes' && (shownReview
              ? <ChangesPanel key={shownReview.sessionId + shownReview.changes.map((c) => c.id + c.status).join(',')} review={shownReview} taskSessionId={sessionId} onResolved={() => void refreshReview()} onPreview={openPreview} />
              : <p className="p-4 text-[13px] text-muted-foreground">No changes to review in this task yet. When a worker finishes, its changes show here.</p>)}
          </div>
        </aside>
      )}
    </div>
  )
}
