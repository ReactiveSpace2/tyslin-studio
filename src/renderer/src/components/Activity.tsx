import { useEffect, useState } from 'react'
import type React from 'react'
import type { Agent, DashboardStats, Project, Session } from '@shared/types'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { StatCard } from './StatCard'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

interface Props {
  agents: Agent[]
  projects: Project[]
  /** Most recent chats, newest first. */
  sessions: Session[]
  onOpenChat: (agentId: string, projectId: string | null, sessionId?: string) => void
}

const dayLabel = (day: string, style: 'short' | 'long'): string => {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return style === 'short'
    ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

const ago = (t: number): string => {
  const min = Math.round((Date.now() - t) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

const messagesConfig = { messages: { label: 'Messages', color: 'var(--chart-1)' } } satisfies ChartConfig

/**
 * Messages you sent per day: shadcn's interactive bar chart (recharts). The header's two buttons pick the range and show
 * its total; a hidden table repeats the numbers for screen readers.
 */
function MessagesChart({ daily }: { daily: DashboardStats['daily'] }): JSX.Element {
  const [range, setRange] = useState<7 | 14>(14)
  const totals = { 7: daily.slice(-7).reduce((n, d) => n + d.count, 0), 14: daily.reduce((n, d) => n + d.count, 0) }
  const data = daily.slice(-range).map((d) => ({ day: d.day, messages: d.count }))
  return (
    <Card aria-labelledby="activity-h" className="gap-0 py-0">
      <CardHeader className="flex flex-col items-stretch gap-0 border-b border-border p-0! sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 pt-4 pb-3 sm:py-5">
          <CardTitle id="activity-h">Messages you sent</CardTitle>
          <CardDescription>Your messages to agents, per day</CardDescription>
        </div>
        <div className="flex" role="group" aria-label="Range">
          {([7, 14] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              data-active={range === r}
              onClick={() => setRange(r)}
              className="relative flex flex-1 flex-col justify-center gap-1 border-t border-border px-6 py-4 text-left even:border-l data-[active=true]:bg-muted sm:border-t-0 sm:border-l sm:px-8 sm:py-5 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
            >
              <span className="text-xs whitespace-nowrap text-muted-foreground">Last {r} days</span>
              <span className="font-mono text-lg leading-none font-semibold tabular-nums sm:text-3xl">{totals[r].toLocaleString()}</span>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-4 pb-4 sm:px-6">
        <ChartContainer config={messagesConfig} className="aspect-auto h-[240px] w-full">
          <BarChart accessibilityLayer data={data} margin={{ left: 12, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={(v: string) => dayLabel(v, 'short')} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
            <ChartTooltip cursor={{ fill: 'var(--color-accent)' }} content={<ChartTooltipContent className="w-[170px]" nameKey="messages" labelFormatter={(v) => dayLabel(String(v), 'long')} />} />
            <Bar dataKey="messages" fill="var(--color-messages)" radius={4} />
          </BarChart>
        </ChartContainer>
        <table className="sr-only">
          <caption>Messages you sent per day</caption>
          <thead><tr><th>Day</th><th>Messages</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.day}><td>{dayLabel(d.day, 'long')}</td><td>{d.messages}</td></tr>)}</tbody>
        </table>
      </CardContent>
    </Card>
  )
}

/** A list card: title, a line under it, then rows or an empty note. */
function ListCard({ id, title, hint, children }: { id: string; title: string; hint: string; children: React.ReactNode }): JSX.Element {
  return (
    <Card aria-labelledby={id} className="gap-3 py-5">
      <CardHeader className="px-5">
        <CardTitle id={id} className="text-[15px]">{title}</CardTitle>
        <CardDescription className="text-[13px]">{hint}</CardDescription>
      </CardHeader>
      <CardContent className="px-3">{children}</CardContent>
    </Card>
  )
}

const rowClass = 'flex min-h-12 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none'

/** Home's activity section (formerly the Dashboard): counts, activity, reviews waiting, recent chats and most used. */
export function Activity({ agents, projects, sessions, onOpenChat }: Props): JSX.Element {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  useEffect(() => { void window.tyslin.app.dashboard().then(setStats) }, [sessions])

  const agentOf = (id: string): Agent | undefined => agents.find((a) => a.id === id)
  const projectName = (id: string | null): string | null => (id ? projects.find((p) => p.id === id)?.name ?? null : null)
  const topMax = Math.max(1, ...(stats?.topAgents.map((t) => t.messages) ?? [1]))

  const chatRow = (s: { sessionId: string; agentId: string; projectId: string | null; title: string }, meta: string): JSX.Element | null => {
    const a = agentOf(s.agentId)
    if (!a) return null
    return (
      <li key={s.sessionId}>
        <button type="button" className={rowClass} onClick={() => onOpenChat(s.agentId, s.projectId, s.sessionId)}>
          <Avatar shape={a.shape} tone={a.tone} head={a.head} mascot={a.isMascot} size={28} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <strong className="truncate text-sm font-medium">{s.title}</strong>
            <span className="truncate text-xs text-muted-foreground">{a.name}{projectName(s.projectId) ? ` · ${projectName(s.projectId)}` : ''}</span>
          </span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">{meta}</span>
        </button>
      </li>
    )
  }
  const empty = (text: string, done?: boolean): JSX.Element => (
    <p className="flex items-center gap-1.5 px-2 py-2 text-[13px] text-muted-foreground">{done && <Icon name="check" size={14} />}{text}</p>
  )

  return (
    <section id="activity" aria-labelledby="activity-title" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="activity-title" className="text-xl font-semibold tracking-tight">What your agencies are doing</h2>
        <p className="text-sm text-muted-foreground">Activity from this computer: your agents' chats and the file changes waiting for you.</p>
      </div>

      {!stats ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <>
          <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-3">
            {([
              ['Chats', stats.chats, `${stats.chatsThisWeek} this week`, false],
              ['Messages you sent', stats.messages, `${stats.messagesThisWeek} this week`, false],
              ['File changes to review', stats.pendingChanges, stats.pendingChanges === 1 ? 'waiting in a chat' : 'waiting in chats', stats.pendingChanges > 0]
            ] as const).map(([label, value, sub, attention]) => (
              <StatCard key={label} label={label} value={value} attention={attention} badge={label === 'File changes to review' ? undefined : `+${label === 'Chats' ? stats.chatsThisWeek : stats.messagesThisWeek} this week`} strong={label === 'Chats' ? 'Chats with your agents' : label === 'Messages you sent' ? 'Messages to your agents' : sub} muted={label === 'File changes to review' ? 'Open the chat to accept or reject' : 'On this computer'} />
            ))}
          </div>

          <MessagesChart daily={stats.daily} />

          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-start gap-4">
            <ListCard id="reviews-h" title="Waiting for review" hint="File changes your agents proposed. Open the chat to accept or reject them.">
              {stats.reviews.length
                ? <ul className="flex flex-col gap-0.5">{stats.reviews.map((r) => chatRow(r, `${r.count} ${r.count === 1 ? 'change' : 'changes'}`))}</ul>
                : empty('Nothing waiting.', true)}
            </ListCard>
            <ListCard id="recent-h" title="Recent chats" hint="Pick up where you left off.">
              {sessions.length
                ? <ul className="flex flex-col gap-0.5">{sessions.slice(0, 6).map((s) => chatRow({ ...s, sessionId: s.id }, ago(s.updatedAt)))}</ul>
                : empty('No chats yet.')}
            </ListCard>
            <ListCard id="top-h" title="Most used" hint="Messages you sent in the last 30 days.">
              {stats.topAgents.length ? (
                <ul className="flex flex-col gap-0.5">
                  {stats.topAgents.map((t) => {
                    const a = agentOf(t.agentId)
                    if (!a) return null
                    return (
                      <li key={t.agentId}>
                        <button type="button" className={rowClass} onClick={() => onOpenChat(a.id, null)}>
                          <Avatar shape={a.shape} tone={a.tone} head={a.head} mascot={a.isMascot} size={28} />
                          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                            <strong className="truncate text-sm font-medium">{a.name}</strong>
                            <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-accent"><span className="block h-full rounded-full bg-lime" style={{ width: `${(t.messages / topMax) * 100}%` }} /></span>
                          </span>
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">{t.messages}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : empty('No messages in the last 30 days.')}
            </ListCard>
          </div>
        </>
      )}
    </section>
  )
}
