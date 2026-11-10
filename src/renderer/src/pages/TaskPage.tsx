import { useEffect, useRef, useState } from 'react'
import type { Agent, Attachment, Session } from '@shared/types'
import type { AgencyView } from '../agencies'
import { firstName } from '../boardStats'
import { Avatar } from '../components/Avatar'
import { Composer } from '../components/Composer'
import { Icon } from '../components/Icon'
import { ChangesPanel, type Review } from '../task/ChangesPanel'
import { DetailsPanel } from '../task/DetailsPanel'
import { TaskHeader, type Pane } from '../task/TaskHeader'
import { Thread } from '../task/Thread'
import { useTask } from '../task/useTask'
import { Button } from '@/components/ui/button'

interface Props {
  sessionId: string
  agent: Agent
  view: AgencyView | null
  sessions: Session[]
  focus?: string
  /** Slot in the window's header for the title menu and panel switches. */
  setHeader: (node: JSX.Element | null) => void
  onSessionsChanged: () => void
  onOpenAgency: () => void
  onOpenAgent: (a: Agent) => void
  onConnectors: () => void
  onFiles: () => void
  onSettings: () => void
  onTalkTo: (a: Agent) => void
  onBackToLead: (() => void) | null
  onDeleted: () => void
}

/** A task: the conversation in the middle, the composer under it, and one right panel (Details or Changes). */
export function TaskPage({ sessionId, agent, view, sessions, focus, setHeader, onSessionsChanged, onOpenAgency, onOpenAgent, onConnectors, onFiles, onSettings, onTalkTo, onBackToLead, onDeleted }: Props): JSX.Element {
  const task = useTask(sessionId, agent, view, sessions, onSessionsChanged)
  const [text, setText] = useState('')
  const [attached, setAttached] = useState<Attachment[]>([])
  const [pane, setPane] = useState<Pane>('')
  const [review, setReview] = useState<Review | null>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const running = task.streaming !== null
  const pendingOwn = task.changes.filter((c) => c.status === 'pending')

  const openReview = (changes: Review['changes'], from: { agent: Agent | null; card: Review['card']; message: Review['message']; sessionId: string }): void => {
    setReview({ changes, ...from })
    setPane('changes')
  }
  // Changes with nothing picked: this task's own pending changes, if any.
  const shownReview: Review | null = review ?? (pendingOwn.length ? { changes: task.changes.filter((c) => c.runId === pendingOwn[0].runId), sessionId, agent, card: null, message: null } : null)
  const refreshReview = async (): Promise<void> => {
    if (!review) { await task.reloadChanges(); return }
    const c = await window.tyslin.changes.list(review.sessionId)
    setReview((r) => (r ? { ...r, changes: c } : r))
    if (review.sessionId === sessionId) await task.reloadChanges()
    task.reloadChannel()
  }

  useEffect(() => {
    setHeader(
      <TaskHeader session={task.session} agent={agent} view={view} running={running} pane={pane} pendingChanges={pendingOwn.length}
        onPane={setPane} onRenamed={onSessionsChanged} onOpenAgency={onOpenAgency} onTalkTo={onTalkTo} onDeleted={onDeleted} />
    )
    return () => setHeader(null)
  }, [task.session?.id, task.session?.title, agent.id, view?.agency.id, running, pane, pendingOwn.length])

  const send = async (): Promise<void> => {
    const t = text, a = attached
    setText(''); setAttached([])
    try { await task.send(t, a) } catch { setText((cur) => cur || t); setAttached((cur) => (cur.length ? cur : a)) }
  }
  const isLead = !!view && view.lead?.id === agent.id

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col" aria-label="Conversation">
        {!isLead && view && (
          <div className="flex flex-none items-center gap-2.5 border-b border-border bg-lime-soft px-5 py-2 text-[13px]">
            <Avatar shape={agent.shape} tone={agent.tone} head={agent.head} size={20} />
            <span className="min-w-0 flex-1">You're talking to <strong>{firstName(agent.name)}</strong> directly. {view.lead ? `${firstName(view.lead.name)} isn't planning this;` : ''} file changes still come to you for review.</span>
            {onBackToLead && view.lead && <Button variant="ghost" size="sm" className="h-8" onClick={onBackToLead}>Back to {firstName(view.lead.name)}</Button>}
          </div>
        )}
        <Thread task={task} agent={agent} view={view} sessionId={sessionId} focus={focus} onReview={openReview}
          onAskLead={() => { composerRef.current?.querySelector('textarea')?.focus(); setText((t) => t || `${firstName(agent.name)}, change the plan: `) }}
          onOpenAgency={onOpenAgency} onSettings={onSettings} onChanged={onSessionsChanged} />
        <div ref={composerRef} className="mx-auto w-full max-w-[760px] flex-none px-6 pt-2 pb-4">
          <Composer agencies={view ? [view] : []} agencyId={view?.agency.id ?? null} agent={agent} value={text} onChange={setText} attached={attached} onAttached={setAttached}
            running={running} onSend={() => void send()} onStop={() => void task.stop()} placeholder={`Message ${firstName(agent.name)}…`} label={`Message ${agent.name}`} />
        </div>
      </section>
      {pane && (
        <aside className="flex w-[380px] min-w-[300px] max-w-[480px] flex-none flex-col overflow-hidden border-l border-border bg-background" aria-label={pane === 'details' ? 'Details' : 'Changes'}>
          <div className="flex h-10 flex-none items-center justify-between border-b border-border pr-1 pl-4">
            <span className="text-[13px] font-semibold">{pane === 'details' ? 'Details' : 'Changes'}</span>
            <Button variant="ghost" size="icon" className="size-8" aria-label="Close panel" onClick={() => setPane('')}><Icon name="close" size={14} /></Button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {pane === 'details' && <DetailsPanel view={view} agent={agent} cards={task.cards} channel={task.channel} cost={task.cost} onOpenAgency={onOpenAgency} onOpenAgent={onOpenAgent} onConnectors={onConnectors} onFiles={onFiles} />}
            {pane === 'changes' && (shownReview
              ? <ChangesPanel key={shownReview.sessionId + shownReview.changes.map((c) => c.id + c.status).join(',')} review={shownReview} taskSessionId={sessionId} onResolved={() => void refreshReview()} />
              : <p className="p-4 text-[13px] text-muted-foreground">No changes to review in this task yet. When a worker finishes, its changes show here.</p>)}
          </div>
        </aside>
      )}
    </div>
  )
}
