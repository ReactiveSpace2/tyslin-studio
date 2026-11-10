import { useEffect, useState } from 'react'
import type { Agent, Attachment, ChannelMessage, Session } from '@shared/types'
import type { AgencyView } from '../agencies'
import { useAgentStatuses } from '../agentStatus'
import { firstName } from '../boardStats'
import { needsYou } from '../task/ChannelCard'
import { Avatar } from '../components/Avatar'
import { Composer } from '../components/Composer'
import { Icon } from '../components/Icon'
import { Pose } from '../components/Pose'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { cn } from '@/lib/utils'

interface Props {
  you: string
  agencies: AgencyView[]
  agents: Agent[]
  sessions: Session[]
  channelMessages: ChannelMessage[]
  runningIds: Set<string>
  activeAgency: string | null
  onActiveAgency: (id: string) => void
  /** Starts a task with the agency's Lead; resolves when the first message is sent (throws if the Lead can't run). */
  onStartTask: (agencyId: string, text: string, attachmentIds: string[]) => Promise<void>
  onOpenTask: (sessionId: string, agentId: string, focus?: string) => void
  onOpenAgency: (agencyId: string) => void
  onOpenAgent: (agencyId: string, agentId: string) => void
  onNewAgency: () => void
  onSettings: () => void
  /** Text to start with in the box (from Files: "New task with this file"). */
  draft?: string
  onDraftUsed?: () => void
}

const STARTERS: { title: string; hint: string; text: string }[] = [
  { title: 'Build a feature', hint: 'Plan, build, test, then your review', text: 'Build this feature: ' },
  { title: 'Fix a bug', hint: 'Small change: one worker, no plan', text: 'Fix this bug: ' },
  { title: 'Write the docs', hint: 'README and guides from the code', text: 'Write the documentation for: ' }
]

const clock = (ms: number): string => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const ago = (ms: number): string => {
  const m = Math.round((Date.now() - ms) / 60_000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`
}

/**
 * Home: one question, one box. The Lead of the picked agency gets the message and plans it. Under the box,
 * what needs you (questions and reviews from any Lead) and what is running.
 */
export function HomePage({ you, agencies, agents, sessions, channelMessages, runningIds, activeAgency, onActiveAgency, onStartTask, onOpenTask, onOpenAgency, onOpenAgent, onNewAgency, onSettings, draft, onDraftUsed }: Props): JSX.Element {
  const [text, setText] = useState(draft ?? '')
  useEffect(() => { if (draft) { setText(draft); onDraftUsed?.() } }, [draft])
  const [attached, setAttached] = useState<Attachment[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const statuses = useAgentStatuses()
  const view = agencies.find((v) => v.agency.id === activeAgency) ?? agencies[0] ?? null
  const lead = view?.lead ?? null
  const leadStatus = lead ? statuses.get(lead.id) : undefined

  const newestLeadSession = (v: AgencyView): Session | null =>
    v.lead ? [...sessions].filter((s) => s.agentId === v.lead!.id).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null : null
  const needs = channelMessages.filter(needsYou).sort((a, b) => b.createdAt - a.createdAt).map((m) => ({ m, v: agencies.find((v) => v.agency.id === m.agencyId) ?? null }))
  const running = sessions.filter((s) => runningIds.has(s.id)).map((s) => ({ s, a: agents.find((x) => x.id === s.agentId) ?? null }))

  const start = async (): Promise<void> => {
    if (!view || sending) return
    setSending(true)
    setError(null)
    try {
      await onStartTask(view.agency.id, text, attached.map((a) => a.id))
      setText('')
      setAttached([])
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
    } finally {
      setSending(false)
    }
  }

  if (agencies.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <Empty className="max-w-[520px]">
          <EmptyHeader>
            <EmptyMedia><Pose pose={1} height={150} /></EmptyMedia>
            <EmptyTitle>No agency yet</EmptyTitle>
            <EmptyDescription>Pick a template and you'll have a Lead and a team in a minute.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={onNewAgency}>Create your first agency</Button>
            <span className="text-xs text-muted-foreground">Software agencies today. Documents and marketing are coming.</span>
          </EmptyContent>
        </Empty>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-7 px-6 pt-10 pb-12">
      <div className="flex flex-col items-center gap-2.5 text-center">
        <Pose pose={1} height={130} />
        <h1 className="text-[28px] font-semibold tracking-tight">What should your agency do?</h1>
        <p className="max-w-[520px] text-[15px] text-muted-foreground">
          {lead ? <>{firstName(lead.name)}, the Lead of {view!.agency.name}, plans it, hands it to the team and brings it back for your review.</> : view ? <>{view.agency.name} has no Lead yet. Add one on its page.</> : null}
        </p>
      </div>

      <div className="flex w-full max-w-[720px] flex-col gap-2">
        {leadStatus && leadStatus.state === 'setup' && (
          <Alert className="border-destructive/30 bg-destructive-soft">
            <Icon name="warning" size={16} />
            <AlertTitle>{firstName(lead!.name)} can't start yet</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-2">
              <span>{leadStatus.reason || 'The Lead needs a model key.'}</span>
              <Button variant="outline" size="sm" onClick={onSettings}>Open Settings</Button>
              <Button variant="ghost" size="sm" onClick={() => onOpenAgent(view!.agency.id, lead!.id)}>Change the model</Button>
            </AlertDescription>
          </Alert>
        )}
        <Composer agencies={agencies} agencyId={view?.agency.id ?? null} onAgency={onActiveAgency} agent={lead}
          value={text} onChange={setText} attached={attached} onAttached={setAttached} running={sending} onSend={() => void start()}
          placeholder={lead ? `Tell ${firstName(lead.name)} what to do…` : 'Pick an agency with a Lead first'} label="Describe the task" rows={3} large autoFocus
          disabled={!lead || leadStatus?.state === 'setup' || view?.paused} />
        {view?.paused && <p className="px-1 text-xs text-muted-foreground">{view.agency.name} is paused. Resume it on its page to send work.</p>}
        {error && <p role="alert" className="rounded-lg bg-destructive-soft px-3.5 py-2.5 text-sm text-destructive">{error}</p>}
      </div>

      <div className="grid w-full max-w-[720px] grid-cols-3 gap-2.5">
        {STARTERS.map((s) => (
          <button key={s.title} type="button" onClick={() => setText(s.text)} data-slot="card"
            className="flex flex-col gap-1 rounded-xl border border-border bg-card px-3.5 py-3 text-left shadow-xs outline-none transition-colors hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/40">
            <strong className="text-sm font-medium">{s.title}</strong>
            <span className="text-xs leading-snug text-muted-foreground">{s.hint}</span>
          </button>
        ))}
      </div>

      {(needs.length > 0 || running.length > 0) && (
        <div className={cn('grid w-full max-w-[720px] gap-4', needs.length > 0 && running.length > 0 ? 'grid-cols-2' : 'grid-cols-1')}>
          {needs.length > 0 && (
            <Card className="gap-0 overflow-hidden py-0">
              <h2 className="flex items-center justify-between border-b border-border px-3.5 py-3 text-[13px] font-semibold">Needs you <Badge variant="lime" className="font-mono">{needs.length}</Badge></h2>
              <ItemGroup>
                {needs.slice(0, 6).map(({ m, v }) => {
                  const lead = v?.lead ?? null
                  const s = v ? newestLeadSession(v) : null
                  return (
                    <Item key={m.id} asChild size="sm" className="rounded-none border-b border-border last:border-b-0">
                      <button type="button" className="text-left" disabled={!s || !lead} onClick={() => s && lead && onOpenTask(s.id, lead.id, m.id)}>
                        <ItemMedia>{lead ? <Avatar shape={lead.shape} tone={lead.tone} head={lead.head} size={24} /> : <Icon name="chat" size={16} />}</ItemMedia>
                        <ItemContent className="gap-0">
                          <ItemTitle className="line-clamp-1 font-normal">{m.text.split('\n')[0]}</ItemTitle>
                          <ItemDescription className="text-xs">{m.kind === 'review' ? 'Review' : 'Question'} · {v?.agency.name ?? ''} · {clock(m.createdAt)}</ItemDescription>
                        </ItemContent>
                      </button>
                    </Item>
                  )
                })}
              </ItemGroup>
            </Card>
          )}
          {running.length > 0 && (
            <Card className="gap-0 overflow-hidden py-0">
              <h2 className="flex items-center justify-between border-b border-border px-3.5 py-3 text-[13px] font-semibold">Running <span className="font-mono text-xs text-muted-foreground">{running.length}</span></h2>
              <ItemGroup>
                {running.slice(0, 6).map(({ s, a }) => (
                  <Item key={s.id} asChild size="sm" className="rounded-none border-b border-border last:border-b-0">
                    <button type="button" className="text-left" onClick={() => onOpenTask(s.id, s.agentId)}>
                      <ItemMedia>{a ? <Avatar shape={a.shape} tone={a.tone} head={a.head} size={24} /> : <Icon name="chat" size={16} />}</ItemMedia>
                      <ItemContent className="gap-0">
                        <ItemTitle className="line-clamp-1 font-normal">{s.title || 'New task'}</ItemTitle>
                        <ItemDescription className="text-xs">{a ? firstName(a.name) : 'Agent'} · {ago(s.updatedAt)}</ItemDescription>
                      </ItemContent>
                      <span className="size-2 flex-none animate-blink rounded-full bg-green" aria-label="Running" />
                    </button>
                  </Item>
                ))}
              </ItemGroup>
            </Card>
          )}
        </div>
      )}
      {needs.length === 0 && running.length === 0 && sessions.length > 0 && (
        <p className="text-[13px] text-muted-foreground">Nothing needs you. {you === 'You' ? '' : `${you}, `}your agents are idle.</p>
      )}
      {view && (
        <Button variant="link" size="sm" className="text-muted-foreground" onClick={() => onOpenAgency(view.agency.id)}>Open {view.agency.name}</Button>
      )}
    </div>
  )
}
