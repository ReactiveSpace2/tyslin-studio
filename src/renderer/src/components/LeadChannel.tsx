import { useEffect, useState } from 'react'
import type { Agency, Agent, ChannelMessage, KanbanCard, KanbanDoc, PendingChange } from '@shared/types'
import { diffHunks } from '@shared/diff'
import { firstName, money } from '../boardStats'
import { AgencyChannelBar } from './AgencyChannelBar'
import { Icon } from './Icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

/**
 * The Lead's side of an agency chat (ChatPage, when the agent is an agency's Lead): what it sent the boss
 * (channel_messages: briefs, questions, reviews, digests) shown as cards in the thread, the board beside it,
 * and the Channel sheet. Replaces the old Inbox screen (archive/renderer/pages/InboxPage.tsx).
 */

/** Waiting on the boss: a question or review not answered yet. */
export const needsYou = (m: ChannelMessage): boolean => (m.kind === 'question' || m.kind === 'review') && !m.reply

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
const clock = (t: number): string => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export interface LeadChannel {
  messages: ChannelMessage[]
  board: KanbanDoc | null
  reload: () => void
}

/** An agency's Lead messages (oldest first) and its board; opening it marks the messages read. */
export function useLeadChannel(agency: Agency | null, onCountChange?: () => void): LeadChannel {
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [board, setBoard] = useState<KanbanDoc | null>(null)
  const [tick, setTick] = useState(0)
  const reload = (): void => setTick((t) => t + 1)
  useEffect(() => {
    if (!agency) { setMessages([]); setBoard(null); return }
    let live = true
    void window.tyslin.channels.list(agency.id).then((ms) => {
      if (!live) return
      setMessages([...ms].sort((a, b) => a.createdAt - b.createdAt))
      const unread = ms.filter((m) => !m.readAt).map((m) => m.id)
      if (unread.length) void window.tyslin.channels.markRead(unread).then(() => onCountChange?.())
    })
    void window.tyslin.studio.read(agency.projectId, agency.boardPath)
      .then((t) => { if (live) setBoard(JSON.parse(t) as KanbanDoc) })
      .catch(() => { if (live) setBoard(null) })
    return () => { live = false }
  }, [agency?.id, agency?.boardPath, tick])
  useEffect(() => {
    if (!agency) return
    const offMsg = window.tyslin.channels.onMessage((m) => { if (m.agencyId === agency.id) reload() })
    const offBoard = window.tyslin.cards.onBoardChanged((p) => { if (p.projectId === agency.projectId) reload() })
    return () => { offMsg(); offBoard() }
  }, [agency?.id])
  return { messages, board, reload }
}

const findCard = (board: KanbanDoc | null, id: string | null): KanbanCard | undefined =>
  id ? board?.columns.flatMap((c) => c.cards).find((c) => c.id === id) : undefined

/** One Lead message in the thread, drawn by kind. `onReview` opens the existing diff dialog. */
export function ChannelCard({ m, lead, board, onAnswered, onReview }: {
  m: ChannelMessage
  lead: Agent | null
  board: KanbanDoc | null
  onAnswered: () => void
  onReview: (changes: PendingChange[], sessionId: string) => void
}): JSX.Element {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sendingBack, setSendingBack] = useState(false)
  const [changes, setChanges] = useState<PendingChange[]>([])
  const card = findCard(board, m.cardId)
  const who = lead ? firstName(lead.name) : 'the Lead'

  // A review's changed files come from the card's chat.
  useEffect(() => {
    if (m.kind !== 'review' || !card?.sessionId) { setChanges([]); return }
    let live = true
    void window.tyslin.changes.list(card.sessionId).then((c) => { if (live) setChanges(c) })
    return () => { live = false }
  }, [m.kind, card?.sessionId, m.reply])
  const pending = changes.filter((c) => c.status === 'pending')

  const reply = async (text: string): Promise<void> => {
    if (!text.trim()) return
    setBusy(true); setError('')
    try { await window.tyslin.channels.reply(m.id, text.trim()); setDraft(''); onAnswered() } catch (err) { setError(errorText(err)) } finally { setBusy(false) }
  }
  /** Accept every hunk of every pending change (or reject them all, with the note), then answer the Lead. */
  const resolveAll = async (accept: boolean, note: string): Promise<void> => {
    setBusy(true); setError('')
    try {
      for (const c of pending) {
        const n = diffHunks(c.original ?? '', c.proposed).hunkCount
        await window.tyslin.changes.resolve(c.id, accept ? Array.from({ length: n }, (_, i) => i) : [], accept ? '' : note)
      }
      await window.tyslin.channels.reply(m.id, accept ? 'Accepted.' : `Sent back: ${note.trim() || 'needs changes.'}`)
      setDraft(''); setSendingBack(false); onAnswered()
    } catch (err) { setError(errorText(err)) } finally { setBusy(false) }
  }

  const head = (label: string, tone: 'lime' | 'secondary'): JSX.Element => (
    <span className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-[13px]">
        <Badge variant={tone}>{label}</Badge>
        <span className="text-muted-foreground">{lead?.name ?? 'Lead'} · {clock(m.createdAt)}{m.delivered ? ` · also on ${m.via === 'telegram' ? 'Telegram' : 'Slack'}` : ''}</span>
      </span>
    </span>
  )
  const answered = m.reply && (
    <p className="rounded-md bg-lime-soft px-3 py-2 text-[13.5px]"><span className="font-medium">You:</span> {m.reply}</p>
  )
  const errorLine = error && <p className="text-[13px] text-destructive" role="alert">{error}</p>

  if (m.kind === 'digest') {
    return (
      <Collapsible className="w-full">
        <Card className="gap-2 px-4 py-3">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
            <span className="flex min-w-0 items-center gap-2 text-[13px]">
              <Badge variant="secondary">Digest</Badge>
              <span className="truncate text-muted-foreground">{clock(m.createdAt)} · {m.text.split('\n')[0]}</span>
            </span>
            <span className="flex-none text-muted-foreground" aria-hidden="true"><Icon name="updown" size={14} /></span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <p className="pt-1 text-[14px] leading-relaxed whitespace-pre-wrap">{m.text}</p>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    )
  }

  if (m.kind === 'brief') {
    const planned = card ? board?.columns.flatMap((c) => c.cards).filter((c) => c.parentCard === card.id).length ?? 0 : 0
    return (
      <Card className="gap-2.5 px-4 py-3.5">
        {head('Brief', 'secondary')}
        {card && <p className="rounded-md bg-muted px-3 py-2 text-[13.5px]"><span className="font-medium">Your brief:</span> {card.title}</p>}
        <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{m.text}</p>
        {card && <span className="font-mono text-xs text-muted-foreground">{planned ? `Planned into ${planned} card${planned === 1 ? '' : 's'}` : 'Not planned into cards yet'}</span>}
      </Card>
    )
  }

  if (m.kind === 'review') {
    return (
      <Card className={cn('gap-2.5 px-4 py-3.5', !m.reply && 'border-green')}>
        {head('Review', m.reply ? 'secondary' : 'lime')}
        {card && (
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <strong className="text-sm font-semibold">{card.title}</strong>
            {card.cost !== undefined && <span className="font-mono text-xs text-muted-foreground">{money(card.cost)} est.</span>}
          </span>
        )}
        <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{m.text}</p>
        {changes.length > 0 && (
          <ul className="flex flex-col gap-0.5" aria-label="Changed files">
            {changes.map((c) => (
              <li key={c.id} className="flex min-w-0 items-center gap-2 text-[13px]">
                <span className="flex-none text-muted-foreground"><Icon name="file" size={12} /></span>
                <span className="truncate font-mono">{c.filePath}</span>
                {c.status !== 'pending' && <span className="flex-none text-xs text-muted-foreground">{c.status}</span>}
              </li>
            ))}
          </ul>
        )}
        {m.reply ? answered : (
          <>
            <span className="flex flex-wrap gap-2">
              {changes.length > 0 && card?.sessionId && (
                <Button variant="outline" size="sm" className="min-h-9" onClick={() => onReview(changes, card.sessionId!)}>Open review</Button>
              )}
              <Button variant="lime" size="sm" className="min-h-9 font-semibold" disabled={busy} onClick={() => void resolveAll(true, '')}>Accept all</Button>
              <Button variant="outline" size="sm" className="min-h-9" disabled={busy} onClick={() => setSendingBack((v) => !v)}>Send back</Button>
            </span>
            {sendingBack && (
              <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void resolveAll(false, draft) }}>
                <span className="flex min-w-[220px] flex-1 flex-col gap-1.5">
                  <Label htmlFor={`sb-${m.id}`} className="text-[13px]">What should {who} change?</Label>
                  <Input id={`sb-${m.id}`} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="What to fix" />
                </span>
                <Button type="submit" size="sm" className="min-h-9" disabled={busy || !draft.trim()}>Send back</Button>
              </form>
            )}
            {errorLine}
          </>
        )}
      </Card>
    )
  }

  // Question.
  return (
    <Card className={cn('gap-2.5 px-4 py-3.5', !m.reply && 'border-green')}>
      {head('Question', m.reply ? 'secondary' : 'lime')}
      {card && <span className="text-[13px] text-muted-foreground">About: {card.title}</span>}
      <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{m.text}</p>
      {m.reply ? answered : (
        <>
          {m.options.length > 0 && (
            <span className="flex flex-wrap gap-2">
              {m.options.map((o) => <Button key={o} variant="outline" size="sm" className="min-h-9" disabled={busy} onClick={() => void reply(o)}>{o}</Button>)}
            </span>
          )}
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void reply(draft) }}>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label htmlFor={`q-${m.id}`} className="sr-only">Answer {who}</Label>
              <Input id={`q-${m.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Answer ${who}`} />
            </span>
            <Button type="submit" size="sm" className="min-h-9" disabled={busy || !draft.trim()}><Icon name="send" size={12} /> Send</Button>
          </form>
          {errorLine}
        </>
      )}
    </Card>
  )
}

/** Side panel: open cards per column, and a way to the Kanban. */
export function BoardPanel({ board, onOpenKanban }: { board: KanbanDoc | null; onOpenKanban?: () => void }): JSX.Element {
  const cols = (board?.columns ?? []).filter((c) => c.title.trim().toLowerCase() !== 'done')
  return (
    <section className="flex flex-col gap-2" aria-labelledby="ctx-board">
      <h3 id="ctx-board" className="text-[13px] font-semibold">Board</h3>
      <Card className="gap-0 py-1">
        {!board && <span className="px-4 py-2.5 text-[13px] text-muted-foreground">The board file is missing.</span>}
        {cols.map((c) => (
          <span key={c.id} className="flex items-center justify-between px-4 py-1.5 text-[13px]">
            <span>{c.title}</span><span className="font-mono text-muted-foreground">{c.cards.length}</span>
          </span>
        ))}
      </Card>
      {onOpenKanban && (
        <Button variant="link" size="sm" className="h-8 self-start px-0 has-[>svg]:px-0" onClick={onOpenKanban}><Icon name="kanban" size={13} /> Open Kanban</Button>
      )}
    </section>
  )
}

/** The agency's channel settings (what used to be the Channel screen's side card), in a sheet. */
export function ChannelSheet({ open, onOpenChange, agency, lead, onChanged, onSetup }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  agency: Agency
  lead: Agent | null
  onChanged: () => void
  /** Opens the Telegram / Slack bot setup. */
  onSetup?: () => void
}): JSX.Element {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-[440px]">
        <SheetHeader>
          <SheetTitle>Channel</SheetTitle>
          <SheetDescription>Where {lead ? firstName(lead.name) : 'the Lead'} reaches you, and what it sends.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          <AgencyChannelBar agency={agency} lead={lead} onChanged={onChanged} />
          {onSetup && (
            <Card className="flex-row flex-wrap items-center gap-3 px-4 py-3.5">
              <span className="min-w-0 flex-1 text-[13px] text-muted-foreground">Connect your Telegram bot or Slack workspace and link your account.</span>
              <Button variant="outline" size="sm" className="min-h-9" onClick={onSetup}>Set up Telegram or Slack</Button>
            </Card>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
