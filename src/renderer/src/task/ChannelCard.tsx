import { useEffect, useState } from 'react'
import type { Agent, ChannelMessage, KanbanCard, KanbanDoc, PendingChange } from '@shared/types'
import { BRIEF_LOG } from '@shared/agencies'
import { firstName, money } from '../boardStats'
import { Icon } from '../components/Icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

/** Waiting on you: a question or review not answered yet. */
export const needsYou = (m: ChannelMessage): boolean => (m.kind === 'question' || m.kind === 'review' || m.kind === 'budget') && !m.reply

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
const clock = (t: number): string => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

export const findCard = (board: KanbanDoc | null, id: string | null | undefined): KanbanCard | undefined =>
  id ? board?.columns.flatMap((c) => c.cards).find((c) => c.id === id) : undefined

/**
 * One message from the Lead in the task thread, drawn by kind: a question with quick answers, a review
 * with its changed files (Review the changes opens the Changes panel), a brief, or a folded digest.
 * Answers go back to the Lead in this task (`channels.reply` with the task's chat id).
 */
export function ChannelCard({ m, lead, board, sessionId, onAnswered, onReview }: {
  m: ChannelMessage
  lead: Agent | null
  board: KanbanDoc | null
  /** The task this is answered from, so the Lead's follow-up lands here. */
  sessionId: string
  onAnswered: () => void
  onReview: (changes: PendingChange[], card: KanbanCard, message: ChannelMessage) => void
}): JSX.Element {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
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
    try { await window.tyslin.channels.reply(m.id, text.trim(), sessionId); setDraft(''); onAnswered() } catch (err) { setError(errorText(err)) } finally { setBusy(false) }
  }

  const head = (label: string, tone: 'lime' | 'secondary'): JSX.Element => (
    <span className="flex items-center gap-2 text-[13px]">
      <Badge variant={tone}>{label}</Badge>
      <span className="text-muted-foreground">{lead?.name ?? 'Lead'} · {clock(m.createdAt)}{m.delivered ? ` · also on ${m.via === 'telegram' ? 'Telegram' : 'Slack'}` : ''}</span>
    </span>
  )
  const answered = m.reply && <p className="rounded-md bg-lime-soft px-3 py-2 text-[13.5px]"><span className="font-medium">You:</span> {m.reply}</p>
  const errorLine = error && <p className="text-[13px] text-destructive" role="alert">{error}</p>

  if (m.kind === 'digest') {
    return (
      <Collapsible className="w-full">
        <Card className="gap-2 px-4 py-3">
          <CollapsibleTrigger className="flex min-h-9 w-full items-center justify-between gap-2 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
            <span className="flex min-w-0 items-center gap-2 text-[13px]"><Badge variant="secondary">Digest</Badge><span className="truncate text-muted-foreground">{clock(m.createdAt)} · {m.text.split('\n')[0]}</span></span>
            <span className="flex-none text-muted-foreground" aria-hidden="true"><Icon name="updown" size={14} /></span>
          </CollapsibleTrigger>
          <CollapsibleContent><p className="pt-1 text-[14px] leading-relaxed whitespace-pre-wrap">{m.text}</p></CollapsibleContent>
        </Card>
      </Collapsible>
    )
  }

  if (m.kind === 'budget') return <BudgetCard m={m} lead={lead} head={head} answered={answered} errorLine={errorLine} busy={busy} reply={reply} />

  if (m.kind === 'brief') {
    // The boss's brief is the Inbox card logged as such; Leads often name their first planned card instead, so
    // find it by its log. Planned = cards linked to it, else cards the Lead added, assigned or edited since the
    // brief arrived (the Lead plans first and sends this message after, so count from the brief, not the message).
    const all = board?.columns.flatMap((col) => col.cards.map((c) => ({ c, col: col.title }))) ?? []
    const isBrief = (c: KanbanCard): boolean => (c.log ?? []).some((l) => l.text === BRIEF_LOG)
    const brief = card && isBrief(card) ? card : all.map(({ c }) => c).filter((c) => isBrief(c) && c.createdAt <= m.createdAt + 1000).sort((a, b) => b.createdAt - a.createdAt)[0]
    const since = (brief?.createdAt ?? m.createdAt) - 1000
    const linked = brief ? all.filter(({ c }) => c.parentCard === brief.id) : []
    const after = all.filter(({ c, col }) => c.id !== brief?.id && col !== 'Inbox' && (c.log ?? []).some((l) => l.at >= since && /^(Added by|Assigned to|Edited by|Reassigned to)/.test(l.text)))
    const planned = linked.length || after.length
    return (
      <Card className="gap-2.5 px-4 py-3.5">
        {head('Brief', 'secondary')}
        {brief && <p className="rounded-md bg-muted px-3 py-2 text-[13.5px]"><span className="font-medium">Your brief:</span> {brief.title}</p>}
        <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{m.text}</p>
        {(brief || card) && <span className="font-mono text-xs text-muted-foreground">{planned ? `Planned into ${planned} card${planned === 1 ? '' : 's'}` : 'Not planned into cards yet'}</span>}
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
              {card?.sessionId && changes.length > 0 && (
                <Button variant={pending.length ? 'lime' : 'outline'} size="sm" className={cn('min-h-9', pending.length && 'font-semibold')} onClick={() => onReview(changes, card, m)}>
                  {pending.length ? `Review the changes (${pending.length})` : 'See the changes'}
                </Button>
              )}
              {pending.length === 0 && <Button variant="outline" size="sm" className="min-h-9" disabled={busy} onClick={() => void reply('Looks good.')}>Looks good</Button>}
            </span>
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

/**
 * The monthly cap message (budget.ts): raise the cap (an amount above this month's spend) or keep the agency paused
 * until the month ends. Answered in main without waking the Lead; cards already running were never stopped.
 */
function BudgetCard({ m, head, answered, errorLine, busy, reply }: {
  m: ChannelMessage
  lead: Agent | null
  head: (label: string, tone: 'lime' | 'secondary') => JSX.Element
  answered: JSX.Element | '' | null
  errorLine: JSX.Element | '' | false
  busy: boolean
  reply: (text: string) => Promise<void>
}): JSX.Element {
  const [cap, setCap] = useState('')
  const [agency, setAgency] = useState<{ budget: number | null; spent: number; resetsAt: number } | null>(null)
  useEffect(() => { void window.tyslin.agencies.list().then((g) => { const a = g.find((x) => x.id === m.agencyId); if (a) { setAgency(a); setCap(String(Math.ceil(Math.max(a.spent, a.budget ?? 0) * 1.5))) } }) }, [m.agencyId])
  const n = Number(cap)
  const ok = cap.trim() !== '' && Number.isFinite(n) && (!agency || n > agency.spent)
  const until = agency ? new Date(agency.resetsAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : 'the month ends'
  return (
    <Card className={cn('gap-2.5 px-4 py-3.5', !m.reply && 'border-green')}>
      {head('Budget', m.reply ? 'secondary' : 'lime')}
      <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{m.text}</p>
      {m.reply ? answered : (
        <>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (ok) void reply(`Raise the cap to $${n}`) }}>
            <span className="flex flex-col gap-1.5">
              <Label htmlFor={`cap-${m.id}`} className="text-xs">New monthly cap</Label>
              <span className="flex items-center gap-1.5"><span className="text-muted-foreground">$</span><Input id={`cap-${m.id}`} value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" className="w-28 font-mono" aria-invalid={(cap.trim() !== '' && !ok) || undefined} /></span>
            </span>
            <Button type="submit" size="sm" variant="lime" className="min-h-9 font-semibold" disabled={busy || !ok}>Raise the cap</Button>
            <Button type="button" size="sm" variant="outline" className="min-h-9" disabled={busy} onClick={() => void reply(`Keep it paused until ${until}`)}>Keep paused until {until}</Button>
          </form>
          {cap.trim() !== '' && !ok && agency && <span className="text-xs text-destructive">Raise it above what's spent this month (${agency.spent.toFixed(2)}).</span>}
          {errorLine}
        </>
      )}
    </Card>
  )
}
