import { useEffect, useRef, useState } from 'react'
import type { AgencyView } from '../agencies'
import { useAgencyLive, KIND_LABEL, KIND_TONE, type LiveAgent, type LiveEvent } from '../live'
import { firstName, money, useBoardStats } from '../boardStats'
import { LiveMap } from '../components/LiveMap'
import { Avatar } from '../components/Avatar'
import { runsOnLabel } from '../components/RunsOnBadge'
import { WorkingBorder } from '../components/Working'
import { Icon } from '../components/Icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

/**
 * Agency → Live (owner's pick "Orbit + Conversation", 9 Nov 2026, canvas page "Activity (live)"): the
 * communication map with speech bubbles (LiveMap), the agency's messages as a read-only chat with a brief
 * box to the Lead, and a card per agent. Everything comes from live.ts (card logs, Lead messages, run events).
 */

const hhmmss = (t: number): string => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const startOfDay = (): number => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }

function Stat({ label, value, attention }: { label: string; value: string | number; attention?: boolean }): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[11px] tracking-[1.2px] text-muted-foreground uppercase">{label}</span>
      <span className={cn('font-mono text-lg', attention && 'text-green')}>{value}</span>
    </div>
  )
}

function YouDot({ name, size = 30 }: { name: string; size?: number }): JSX.Element {
  return (
    <span className="inline-flex flex-none items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground" style={{ width: size, height: size }}>
      {name.slice(0, 2).toUpperCase()}
    </span>
  )
}

function ChatLine({ e, fresh, nameOf, avatarOf, youName }: { e: LiveEvent; fresh: boolean; nameOf: (id: string) => string; avatarOf: (id: string) => LiveAgent | undefined; youName: string }): JSX.Element {
  const a = e.from === 'you' ? undefined : avatarOf(e.from)
  const to = e.to ? `to ${nameOf(e.to)}` : e.kind === 'tool' ? 'tool call' : ''
  return (
    <li className={cn('flex gap-2.5 px-4 py-2', fresh && 'animate-live-rise')}>
      {e.from === 'you' ? <YouDot name={youName} /> : a ? <span className="flex size-[30px] flex-none items-center justify-center overflow-hidden rounded-full bg-panel"><Avatar shape={a.agent.shape} tone={a.agent.tone} head={a.agent.head} mascot={a.agent.isMascot} size={28} /></span> : <span className="size-[30px] flex-none rounded-full bg-panel" />}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-baseline gap-1.5">
          <strong className="text-[13px] font-semibold">{nameOf(e.from)}</strong>
          {to && <span className="text-xs text-muted-foreground">{to}</span>}
          <Badge variant={KIND_TONE[e.kind]} className="h-[18px] px-1.5 font-mono text-[10px] tracking-wide">{KIND_LABEL[e.kind]}</Badge>
          <span className={cn('font-mono text-[10.5px]', fresh ? 'text-green' : 'text-muted-foreground')}>{hhmmss(e.at)}</span>
        </span>
        <span className={cn('rounded-[4px_12px_12px_12px] border px-3 py-2 text-[13px] leading-snug break-words',
          e.from === 'you' ? 'border-transparent bg-lime-soft' : e.kind === 'tool' ? 'border-border bg-panel font-mono text-xs' : 'border-border bg-card',
          fresh && 'border-[1.5px] border-green')}>{e.text}</span>
      </div>
    </li>
  )
}

function AgentCard({ a, lead }: { a: LiveAgent; lead: boolean }): JSX.Element {
  const job = lead ? 'Lead' : a.agent.description.split(/[.,;]/)[0].trim() || 'Worker'
  const state = a.working ? 'Working' : a.done ? 'Done' : a.doing
  return (
    <Card className={cn('relative gap-3 px-4 py-4', a.working && 'border-green')}>
      {a.working && <WorkingBorder />}
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 flex-none items-center justify-center overflow-hidden rounded-full bg-panel"><Avatar shape={a.agent.shape} tone={a.agent.tone} head={a.agent.head} mascot={a.agent.isMascot} size={34} /></span>
        <div className="flex min-w-0 flex-1 flex-col">
          <strong className="truncate text-sm font-semibold">{firstName(a.agent.name)}</strong>
          <span className="flex min-w-0 font-mono text-[11px] text-muted-foreground">
            <span className="truncate">{job}</span><span className="flex-none">&nbsp;·&nbsp;{runsOnLabel(a.agent)}</span>
          </span>
        </div>
        <span className="flex h-[22px] flex-none items-end gap-[3px]" aria-hidden="true">
          {[0, 0.15, 0.3, 0.1, 0.45, 0.25].map((d) => (
            <span key={d} className={cn('h-[22px] w-1 origin-bottom rounded-[1px]', a.working ? 'animate-live-eq bg-lime motion-reduce:animate-none' : 'scale-y-[.2] bg-border')} style={{ animationDelay: `${d}s` }} />
          ))}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="flex justify-between gap-2 font-mono text-[11px] text-muted-foreground">
          <span className="tracking-[1.2px] uppercase">Card</span><span className="truncate">{a.progress.label}</span>
        </span>
        <span className="truncate text-[13px]">{a.card?.title ?? 'No card yet'}</span>
        <span className="relative h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${firstName(a.agent.name)}: ${a.progress.label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={a.progress.value}>
          <span className="absolute inset-y-0 left-0 rounded-full bg-lime transition-[width] duration-700 ease-out" style={{ width: `${a.progress.value}%` }} />
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Badge variant={a.working ? 'lime' : a.done ? 'soft' : 'outline'} className="max-w-[55%] truncate font-mono text-[10.5px] tracking-wide uppercase">{state}</Badge>
        <span className="truncate font-mono text-[11px] text-muted-foreground">last tool: {a.lastTool || '—'}</span>
      </div>
    </Card>
  )
}

export function LivePage({ view, you, onBoard, onInbox }: { view: AgencyView; you: string; onBoard: () => void; onInbox: () => void }): JSX.Element {
  const live = useAgencyLive(view)
  const stats = useBoardStats([view.agency])[view.agency.id]
  const [now, setNow] = useState(Date.now())
  const [brief, setBrief] = useState('')
  const [sending, setSending] = useState(false)
  const [note, setNote] = useState('')
  const bottom = useRef<HTMLLIElement>(null)
  const openedAt = useRef(Date.now())

  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t) }, [])
  const newest = live.events[0] ?? null
  // Keep the chat at its newest message by scrolling only the chat's own viewport (never the page).
  useEffect(() => {
    const vp = bottom.current?.closest<HTMLElement>('[data-slot=scroll-area-viewport]')
    if (vp) vp.scrollTop = vp.scrollHeight
  }, [newest?.id, live.loaded])

  const lead = live.agents.find((a) => a.agent.id === view.lead?.id) ?? null
  const workers = live.agents.filter((a) => a.agent.id !== view.lead?.id)
  const byId = (id: string): LiveAgent | undefined => live.agents.find((a) => a.agent.id === id)
  const nameOf = (id: string): string => (id === 'you' ? 'You' : firstName(byId(id)?.agent.name ?? 'Agent'))
  const working = live.agents.filter((a) => a.working).length
  const today = startOfDay()
  const handoffs = live.events.filter((e) => e.kind === 'handoff' && e.at >= today).length
  const chat = live.events.slice(0, 40).reverse()
  const nextTyper = live.agents.find((a) => a.typing)
  const leadName = view.lead ? firstName(view.lead.name) : null

  const send = async (): Promise<void> => {
    const text = brief.trim()
    if (!text || sending) return
    setSending(true); setNote('')
    try {
      const r = await window.tyslin.agencies.brief(view.agency.id, text)
      setBrief('')
      setNote(r.planned ? `${leadName} is planning it now.` : `It waits in the Inbox column until ${leadName ?? 'the Lead'} plans next.`)
    } catch (err) {
      setNote(err instanceof Error ? err.message.replace(/^.*Error: /, '') : String(err))
    } finally { setSending(false) }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="flex flex-wrap items-center gap-4 border-b border-border bg-card px-6 py-3">
        <div className="flex min-w-0 flex-[1_1_320px] items-center gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="font-mono text-[11px] tracking-[1.2px] text-muted-foreground uppercase">Live</span>
            <h1 className="truncate text-lg font-semibold tracking-tight">{view.agency.name}</h1>
          </div>
          <Badge variant={view.paused ? 'outline' : 'soft'} className="gap-2 font-mono">
            <span className={cn('size-2 rounded-[2px]', view.paused ? 'bg-muted-foreground' : 'animate-blink bg-lime motion-reduce:animate-none')} aria-hidden="true" />
            {view.paused ? 'PAUSED' : 'LIVE'}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-7">
          <Stat label="Working" value={`${working} / ${live.agents.length}`} />
          <Stat label="Hand-offs today" value={handoffs} />
          <Stat label="Needs you" value={live.unread} attention={live.unread > 0} />
          <Stat label="Spend, 7 days" value={stats ? money(stats.spentWeek) : '…'} />
          <Stat label="Local time" value={hhmmss(now)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onInbox}><Icon name="chat" size={14} /> Inbox</Button>
          <Button type="button" variant="outline" onClick={onBoard}><Icon name="kanban" size={14} /> Open board</Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-4 px-6 pt-4">
        {/* Map and chat share one height from the window (top bars, Live header, agent cards, status bar and gaps taken off), so the whole screen fits. */}
        <Card className="flex h-[calc(100vh-430px)] min-h-[340px] min-w-0 flex-[999_1_760px] flex-col gap-0 overflow-hidden py-0">
          <CardHeader className="border-b border-border px-5 py-3.5">
            <span className="font-mono text-[11px] tracking-[1.2px] text-muted-foreground uppercase">Communication map</span>
            <CardTitle><h2 className="text-[15px] font-semibold">The agency, talking</h2></CardTitle>
            <CardAction className="max-w-[320px] text-right text-xs text-muted-foreground">The bubble is the message being sent now. Workers talk only to the Lead.</CardAction>
          </CardHeader>
          <div className="min-h-0 flex-1">
            <LiveMap lead={lead} workers={workers} latest={newest} now={now} youName={you} unread={live.unread} />
          </div>
        </Card>

        {/* Fixed height from the window (not from its content, so it can't grow the page): the window minus the top
            bars, the Live header, the status bar and the gaps. The messages scroll inside. */}
        <Card className="flex h-[calc(100vh-430px)] min-h-[340px] min-w-0 flex-[1_1_380px] flex-col gap-0 overflow-hidden py-0">
          <CardHeader className="border-b border-border px-4 py-3.5">
            <span className="font-mono text-[11px] tracking-[1.2px] text-muted-foreground uppercase">Agency chat</span>
            <CardTitle><h2 className="text-[15px] font-semibold">What they are saying</h2></CardTitle>
            <CardAction className="font-mono text-[11px] text-muted-foreground">{live.events.length} events</CardAction>
          </CardHeader>
          {/* The card has a fixed height; this box takes what is left and the messages scroll inside it. (Radix sets
              position: relative inline on ScrollArea, so it is sized with size-full, not absolute positioning.) */}
          <div className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="size-full [&_[data-slot=scroll-area-viewport]>div]:!block">
            {!live.loaded ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : chat.length === 0 ? (
              <CardDescription className="p-4">Nothing yet. Send {leadName ?? 'the Lead'} a brief below and the agency will start talking here.</CardDescription>
            ) : (
              <ol role="log" aria-live="off" className="flex flex-col py-2">
                {chat.map((e) => (
                  <ChatLine key={e.id} e={e} fresh={e.id === newest?.id && e.live && e.at >= openedAt.current} nameOf={nameOf} avatarOf={byId} youName={you} />
                ))}
                <li ref={bottom} aria-hidden="true" />
              </ol>
            )}
          </ScrollArea>
          </div>
          <div className="flex min-h-7 items-center gap-2 px-4 pt-1 text-xs text-muted-foreground">
            {nextTyper && (
              <>
                <span className="inline-flex gap-[3px]" aria-hidden="true">
                  <i className="size-[5px] animate-hop rounded-full bg-green" /><i className="size-[5px] animate-hop rounded-full bg-green [animation-delay:.15s]" /><i className="size-[5px] animate-hop rounded-full bg-green [animation-delay:.3s]" />
                </span>
                {firstName(nextTyper.agent.name)} is writing
              </>
            )}
          </div>
          <CardContent className="border-t border-border px-4 py-3">
            <form className="flex gap-2" onSubmit={(ev) => { ev.preventDefault(); void send() }}>
              <Label htmlFor="live-brief" className="sr-only">Brief for {leadName ?? 'the Lead'}</Label>
              <Input id="live-brief" value={brief} onChange={(ev) => setBrief(ev.target.value)} disabled={!view.lead || sending}
                placeholder={view.lead ? `Send ${leadName} a brief (only the Lead hears you)` : 'This agency has no Lead yet'} className="h-11 flex-1" />
              <Button type="submit" className="h-11" disabled={!view.lead || !brief.trim() || sending}><Icon name="send" size={14} /> Send</Button>
            </form>
            {note && <p className="mt-2 text-xs text-muted-foreground" role="status">{note}</p>}
          </CardContent>
        </Card>
      </div>

      <section aria-label="Agents" className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 px-6 pt-4 pb-4">
        {live.agents.map((a) => <AgentCard key={a.agent.id} a={a} lead={a.agent.id === view.lead?.id} />)}
      </section>
    </div>
  )
}
