import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Agency, Agent, ChannelMessage } from '@shared/types'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Pose } from '../components/Pose'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'needs' | 'review' | 'brief' | 'digest'
const KIND: Record<ChannelMessage['kind'], string> = { brief: 'brief', question: 'question', review: 'review', digest: 'digest' }
const FILTERS: [Filter, string][] = [['all', 'All'], ['needs', 'Needs you'], ['review', 'Reviews'], ['brief', 'Briefs'], ['digest', 'Digests']]

/** Waiting on the boss: a question or review not answered yet. */
export const needsYou = (m: ChannelMessage): boolean => (m.kind === 'question' || m.kind === 'review') && !m.reply

const when = (t: number): string => {
  const d = new Date(t)
  const today = new Date()
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/**
 * An agency's Inbox: what its Lead sent you (briefs, questions, reviews, digests) as a list with filters,
 * the open message with its quick answers and reply box, and New brief, which puts a card in the board's
 * Inbox column and starts the Lead's planning run (agencies.brief).
 */
export function InboxPage({ agency: scope, agencies, agents, focusId, onOpenBoard, onOpenChannel, onCountChange }: {
  /** The agency whose Inbox this is: only its messages show. */
  agency: Agency
  agencies: Agency[]
  agents: Agent[]
  focusId?: string
  onOpenBoard: (projectId: string) => void
  onOpenChannel: (projectId: string) => void
  /** Read or answered: the toolbar count changes. */
  onCountChange: () => void
}): JSX.Element {
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | null>(focusId ?? null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  /** New brief open in the right pane instead of a message. */
  const [briefing, setBriefing] = useState(false)
  const [brief, setBrief] = useState('')
  const [note, setNote] = useState('')

  const load = (): void => { void window.tyslin.channels.list(scope.id).then(setMessages) }
  useEffect(() => { load(); return window.tyslin.channels.onMessage((m) => { if (m.agencyId === scope.id) load() }) }, [scope.id])
  useEffect(() => { if (focusId) setSelected(focusId) }, [focusId])

  const agencyById = useMemo(() => new Map(agencies.map((a) => [a.id, a])), [agencies])
  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents])
  const counts = useMemo(() => ({
    all: messages.length,
    needs: messages.filter(needsYou).length,
    review: messages.filter((m) => m.kind === 'review').length,
    brief: messages.filter((m) => m.kind === 'brief').length,
    digest: messages.filter((m) => m.kind === 'digest').length
  }), [messages])
  const shown = messages.filter((m) => filter === 'all' ? true : filter === 'needs' ? needsYou(m) : m.kind === filter)
  const current = messages.find((m) => m.id === selected) ?? shown[0] ?? null

  // Opening a message marks it read.
  useEffect(() => {
    if (current && !current.readAt) void window.tyslin.channels.markRead([current.id]).then(() => { load(); onCountChange() })
    setDraft('')
    setError('')
  }, [current?.id])

  const send = async (text: string): Promise<void> => {
    if (!current || !text.trim()) return
    setSending(true)
    setError('')
    try { await window.tyslin.channels.reply(current.id, text); setDraft(''); load() } catch (err) { setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)) } finally { setSending(false) }
  }

  const agency = current ? agencyById.get(current.agencyId) : undefined
  const lead = current ? agentById.get(current.agentId) : undefined
  const scopeLead = scope.leadId ? agentById.get(scope.leadId) : undefined
  const leadFirst = scopeLead?.name.replace(/\s*\(Lead\)$/, '') ?? 'the Lead'

  const sendBrief = async (): Promise<void> => {
    if (!brief.trim()) return
    setSending(true); setError(''); setNote('')
    try {
      const r = await window.tyslin.agencies.brief(scope.id, brief)
      setBrief('')
      setNote(r.planned ? `Added to Inbox on the board. ${leadFirst} is planning it.` : scope.paused ? `Added to Inbox on the board. ${leadFirst} plans it when you resume ${scope.name}.` : `Added to Inbox on the board. ${leadFirst} plans it on the next run.`)
    } catch (err) { setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)) } finally { setSending(false) }
  }

  return (
    <div className="tw flex h-full min-h-0 text-foreground">
      <aside className="flex w-[300px] flex-none flex-col border-r border-border min-[901px]:w-[380px]" aria-label="Messages">
        <div className="flex flex-col gap-3 border-b border-border px-4 pt-5 pb-3">
          <span className="font-mono text-xs tracking-[0.08em] text-green uppercase">{scope.name}</span>
          <div className="flex items-center justify-between gap-2.5">
            <h1 className="text-[26px] font-semibold tracking-tight">Inbox</h1>
            <Button size="sm" variant={briefing ? 'default' : 'outline'} disabled={!scopeLead} onClick={() => { setBriefing(true); setNote(''); setError('') }}><Icon name="plus" size={12} /> New brief</Button>
          </div>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Show">
            {FILTERS.map(([id, label]) => {
              const on = filter === id
              return (
                <button key={id} type="button" role="tab" aria-selected={on} onClick={() => setFilter(id)}
                  className={cn('inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                    on ? 'border-primary bg-primary text-primary-foreground' : id === 'needs' && counts.needs ? 'border-green bg-card text-green hover:bg-accent' : 'border-border bg-card text-foreground hover:bg-accent')}>
                  {label}{counts[id] ? <span className="font-mono">{counts[id]}</span> : null}
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {shown.length === 0 && (
            <p className="p-4 text-[13px] text-muted-foreground">{messages.length ? 'Nothing here.' : `When ${leadFirst} has a question, work to review or a digest, it lands here.`}</p>
          )}
          {shown.map((m) => {
            const a = agentById.get(m.agentId)
            const on = current?.id === m.id
            return (
              <button key={m.id} type="button" onClick={() => { setSelected(m.id); setBriefing(false) }}
                className={cn('flex w-full flex-col gap-1.5 border-b border-border px-4 py-3 text-left text-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-inset',
                  on && 'bg-accent shadow-[inset_3px_0_0_var(--color-lime)]')}>
                <span className="flex items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={needsYou(m) ? 'lime' : 'secondary'} className="capitalize">{KIND[m.kind]}</Badge>
                    {m.reply && <Badge variant="outline" className="text-muted-foreground"><Icon name="check" size={10} /> answered</Badge>}
                  </span>
                  <span className="flex-none font-mono text-[11px] text-muted-foreground">{when(m.createdAt)}</span>
                </span>
                <span className="flex items-center gap-2 text-sm">
                  {!m.readAt && <span className="size-[7px] flex-none rounded-full bg-lime" aria-hidden="true" />}
                  <strong className={m.readAt ? 'font-medium' : 'font-semibold'}>{a?.name.replace(/\s*\(Lead\)$/, '') ?? 'Lead'}</strong>
                </span>
                <span className="line-clamp-2 text-[13px] text-muted-foreground">{m.text}</span>
              </button>
            )
          })}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col gap-[18px] overflow-y-auto px-6 py-6 min-[901px]:px-8 min-[901px]:py-7" aria-label={briefing ? 'New brief' : 'Message'}>
        {briefing ? (
          <div className="flex w-full max-w-[760px] flex-col gap-[18px]">
            <header className="flex items-center gap-3">
              {scopeLead ? <Avatar shape={scopeLead.shape} tone={scopeLead.tone} head={scopeLead.head} size={44} /> : <LeadIcon />}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <strong className="text-base font-semibold">New brief for {scopeLead?.name ?? 'the Lead'}</strong>
                <span className="text-[13px] text-muted-foreground">It goes into Inbox on {scope.name}&apos;s board, and {leadFirst} turns it into cards.</span>
              </span>
            </header>
            <Card className="gap-2 px-3 py-2.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
              <Label htmlFor="inbox-brief" className="text-[13px]">What do you need?</Label>
              <Textarea id="inbox-brief" rows={6} autoFocus value={brief} onChange={(e) => setBrief(e.target.value)} className="resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                placeholder="The work, what done looks like, and anything to avoid."
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void sendBrief() }} />
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="outline" className="min-h-11" onClick={() => setBriefing(false)}>{note ? 'Back to messages' : 'Cancel'}</Button>
                <Button className="min-h-11" disabled={sending || !brief.trim()} onClick={() => void sendBrief()}>
                  <Icon name="send" size={13} /> {sending ? 'Sending…' : 'Send brief'}
                </Button>
              </div>
            </Card>
            {error && <ErrorLine>{error}</ErrorLine>}
            {note && <p className="text-[13px] text-green" role="status">{note}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="min-h-10" onClick={() => onOpenBoard(scope.projectId)}><Icon name="kanban" size={14} /> Open the board</Button>
            </div>
          </div>
        ) : !current ? (
          <div className="m-auto flex max-w-[360px] flex-col items-center gap-2 text-center">
            <Pose pose={3} height={170} />
            <strong className="text-base font-semibold">No messages yet</strong>
            <span className="text-[13px] text-muted-foreground">{leadFirst} writes here when there&apos;s no channel, and as well as Telegram or Slack when there is. Use New brief to give {leadFirst} work.</span>
          </div>
        ) : (
          <div className="flex w-full max-w-[760px] flex-1 flex-col gap-[18px]">
            <header className="flex items-center gap-3">
              {lead ? <Avatar shape={lead.shape} tone={lead.tone} head={lead.head} size={44} /> : <LeadIcon />}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <strong className="text-base font-semibold">{lead?.name ?? 'Lead'}</strong>
                <span className="text-[13px] text-muted-foreground">{agency?.name ?? 'Agency'} · {new Date(current.createdAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}{current.delivered ? ` · also sent on ${current.via === 'telegram' ? 'Telegram' : 'Slack'}` : ''}</span>
              </span>
              <Badge variant={needsYou(current) ? 'lime' : 'secondary'} className="capitalize">{KIND[current.kind]}</Badge>
            </header>

            <Card className="px-6 py-5 text-[15px] leading-relaxed whitespace-pre-wrap">{current.text}</Card>

            {current.reply ? (
              <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-lime-soft px-5 py-4 text-sm leading-normal">
                <span className="text-[13px] font-medium">Your answer · {current.repliedAt ? when(current.repliedAt) : ''}</span>
                <span>{current.reply}</span>
                <span className="text-[13px] text-muted-foreground">Sent to {lead?.name ?? 'the Lead'}{current.cardId ? ' and noted on the card' : ''}.</span>
              </div>
            ) : (
              <>
                {current.options.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {current.options.map((o) => <Button key={o} variant="outline" className="min-h-10" disabled={sending} onClick={() => void send(o)}>{o}</Button>)}
                  </div>
                )}
                <Card className="gap-2 px-3 py-2.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
                  <Label htmlFor="inbox-reply" className="text-[13px]">Reply to {lead?.name.replace(/\s*\(Lead\)$/, '') ?? 'the Lead'}</Label>
                  <Textarea id="inbox-reply" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} className="resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                    placeholder={current.kind === 'question' ? 'Your answer' : current.kind === 'review' ? 'Approve, or say what to change' : `Reply to ${leadFirst}`}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send(draft) }} />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-[13px] text-muted-foreground">Your answer goes to {lead?.name.replace(/\s*\(Lead\)$/, '') ?? 'the Lead'}{current.cardId ? ' and onto the card' : ''}.</span>
                    <Button className="min-h-11" disabled={sending || !draft.trim()} onClick={() => void send(draft)}>
                      <Icon name="send" size={13} /> {sending ? 'Sending…' : 'Send'}
                    </Button>
                  </div>
                </Card>
                {error && <ErrorLine>{error}</ErrorLine>}
              </>
            )}

            <div className="flex gap-2">
              {agency && <Button variant="outline" className="min-h-10" onClick={() => onOpenBoard(agency.projectId)}><Icon name="kanban" size={14} /> Open the board</Button>}
            </div>

            {agency && agency.channel.kind === 'none' && (
              <div className="mt-auto flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted px-4 py-3.5">
                <span className="min-w-0 flex-1 text-[13px] text-muted-foreground">No channel is set up for {agency.name}, so {lead?.name.replace(/\s*\(Lead\)$/, '') ?? 'the Lead'} writes here. Add Telegram or Slack to get these on your phone.</span>
                <Button variant="link" className="h-auto px-0" onClick={() => onOpenChannel(agency.projectId)}>Set up a channel</Button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

/** Stands in for the Lead's head when the Lead is gone. */
function LeadIcon(): JSX.Element {
  return <span className="flex size-10 flex-none items-center justify-center rounded-[10px] bg-muted text-foreground"><Icon name="agency" size={16} /></span>
}

function ErrorLine({ children }: { children: ReactNode }): JSX.Element {
  return <p className="rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive" role="alert">{children}</p>
}
