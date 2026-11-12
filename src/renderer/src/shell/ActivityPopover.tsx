import { useState } from 'react'
import type { Agent, ChannelMessage, DashboardStats, Session } from '@shared/types'
import type { AgencyTab } from '../App'
import type { AgencyView } from '../agencies'
import { firstName } from '../boardStats'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { needsYou } from '../task/ChannelCard'
import { listedTask } from './AppSidebar'
import { shortTime } from './time'
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type Waiting = Pick<DashboardStats, 'reviews' | 'plans' | 'budgetAlerts' | 'creditFailures'>

interface Props {
  agencies: AgencyView[]
  agents: Agent[]
  sessions: Session[]
  runningIds: Set<string>
  channelMessages: ChannelMessage[]
  waiting: Waiting
  onOpenTask: (sessionId: string, agentId: string, focus?: string) => void
  onOpenAgency: (id: string, tab: AgencyTab) => void
  className?: string
}

interface Row {
  key: string
  at: number
  agent: Agent | null
  title: string
  text: string
  state: 'needs' | 'running' | 'done'
  go: () => void
}

const KIND_TITLE: Partial<Record<ChannelMessage['kind'], string>> = { question: 'asked you', review: 'has work to review', budget: 'hit the budget', brief: 'sent a brief', digest: 'sent a digest' }
const RECENT = 10

/**
 * The bell in the sidebar header (blueprint "Activity"): what needs you (questions, reviews, plans to approve,
 * budget and credit stops), what is running, and the latest results. Each row opens where it can be answered.
 */
export function ActivityPopover({ agencies, agents, sessions, runningIds, channelMessages, waiting, onOpenTask, onOpenAgency, className }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const agentById = (id: string | null | undefined): Agent | null => agents.find((a) => a.id === id) ?? null
  const viewById = (id: string | null): AgencyView | null => agencies.find((v) => v.agency.id === id) ?? null
  const latest = (agentId: string): Session | null => sessions.filter((s) => s.agentId === agentId).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
  /** The agency's newest Lead task, else its Team tab. */
  const openLead = (v: AgencyView | null, focus?: string): void => {
    if (!v) return
    const s = v.lead ? latest(v.lead.id) : null
    if (s && v.lead) onOpenTask(s.id, v.lead.id, focus)
    else onOpenAgency(v.agency.id, 'team')
  }

  const needs: Row[] = []
  for (const m of channelMessages.filter(needsYou)) {
    const v = viewById(m.agencyId)
    const a = agentById(m.agentId)
    needs.push({ key: `m:${m.id}`, at: m.createdAt, agent: a, title: `${a ? firstName(a.name) : 'The Lead'} ${KIND_TITLE[m.kind] ?? 'needs you'}`, text: m.text, state: 'needs', go: () => openLead(v, m.id) })
  }
  for (const p of waiting.plans) {
    const v = viewById(p.agencyId)
    needs.push({ key: `p:${p.agencyId}`, at: p.at, agent: v?.lead ?? null, title: `Plan ready to approve`, text: `${v?.agency.name ?? 'Agency'} · ${p.count} card${p.count === 1 ? '' : 's'}`, state: 'needs', go: () => openLead(v) })
  }
  for (const r of waiting.reviews) {
    const a = agentById(r.agentId)
    needs.push({ key: `r:${r.sessionId}`, at: sessions.find((s) => s.id === r.sessionId)?.updatedAt ?? 0, agent: a, title: `${r.count} file change${r.count === 1 ? '' : 's'} to review`, text: r.title || (a ? a.name : ''), state: 'needs', go: () => onOpenTask(r.sessionId, r.agentId) })
  }
  for (const b of waiting.budgetAlerts) {
    const v = viewById(b.agencyId)
    needs.push({ key: `b:${b.agencyId}`, at: 0, agent: v?.lead ?? null, title: b.capped ? 'Budget cap reached' : 'Budget nearly used', text: `${v?.agency.name ?? 'Agency'} · $${b.spent.toFixed(2)} of $${b.budget.toFixed(2)}`, state: 'needs', go: () => onOpenAgency(b.agencyId, 'budget') })
  }
  for (const c of waiting.creditFailures) {
    const a = agentById(c.agentId)
    needs.push({ key: `c:${c.agentId}:${c.at}`, at: c.at, agent: a, title: 'Out of credits', text: `${a ? firstName(a.name) : 'An agent'}${c.provider ? ` on ${c.provider}` : ''} was refused`, state: 'needs', go: () => (c.taskId ? onOpenTask(c.taskId, c.agentId) : c.agencyId && onOpenAgency(c.agencyId, 'budget')) })
  }
  needs.sort((a, b) => b.at - a.at)

  const known = new Set(agencies.flatMap((v) => [v.lead, ...v.workers]).filter((a): a is Agent => !!a).map((a) => a.id))
  const mine = sessions.filter((s) => known.has(s.agentId))
  const running: Row[] = mine.filter((s) => runningIds.has(s.id)).sort((a, b) => b.updatedAt - a.updatedAt).map((s) => {
    const a = agentById(s.agentId)
    return { key: `s:${s.id}`, at: s.updatedAt, agent: a, title: `${a ? firstName(a.name) : 'An agent'} is working`, text: s.title || 'New task', state: 'running', go: () => onOpenTask(s.id, s.agentId) }
  })
  const recent: Row[] = mine.filter((s) => !runningIds.has(s.id) && listedTask(s)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, RECENT).map((s) => {
    const a = agentById(s.agentId)
    return { key: `d:${s.id}`, at: s.updatedAt, agent: a, title: s.title || 'New task', text: a ? a.name : '', state: 'done', go: () => onOpenTask(s.id, s.agentId) }
  })

  const go = (r: Row): void => { setOpen(false); r.go() }
  const section = (label: string, rows: Row[]): JSX.Element | null => rows.length ? (
    <div className="flex flex-col gap-0.5">
      <h3 className="px-2 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground uppercase">{label}</h3>
      {rows.map((r) => (
        <Item key={r.key} asChild size="sm" className="cursor-pointer rounded-lg px-2 py-2 hover:bg-accent">
          <button type="button" onClick={() => go(r)} className="w-full text-left">
            <ItemMedia>{r.agent ? <Avatar shape={r.agent.shape} tone={r.agent.tone} head={r.agent.head} size={28} /> : <span className="grid size-7 place-items-center rounded-full bg-muted"><Icon name="bell" size={14} /></span>}</ItemMedia>
            <ItemContent className="min-w-0 gap-0.5">
              <ItemTitle className="w-full text-[13px]">
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                {r.state === 'needs' && <span className="size-2 flex-none rounded-full bg-lime" aria-label="Needs you" />}
                {r.state === 'running' && <span className="size-2 flex-none animate-blink rounded-full bg-green" aria-label="Running" />}
                {r.state === 'done' && r.at > 0 && <span className="flex-none font-mono text-[11px] font-normal text-muted-foreground">{shortTime(r.at)}</span>}
              </ItemTitle>
              {r.text && <ItemDescription className="line-clamp-1 text-xs">{r.text}</ItemDescription>}
            </ItemContent>
          </button>
        </Item>
      ))}
    </div>
  ) : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button type="button" aria-label={needs.length ? `Activity, ${needs.length} need you` : 'Activity'} className={cn(className, 'relative')}>
              <Icon name="bell" size={16} />
              {needs.length > 0 && <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-lime px-1 font-mono text-[10px] leading-4 text-on-lime" aria-hidden="true">{needs.length > 9 ? '9+' : needs.length}</span>}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Activity</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" sideOffset={6} className="w-[340px] rounded-xl p-0 shadow-lg">
        <div className="flex h-11 items-center border-b border-border px-4 text-sm font-semibold">Activity</div>
        <ScrollArea className="max-h-[440px]">
          <div className="flex flex-col gap-1 p-1.5">
            {section('Needs you', needs)}
            {section('Working now', running)}
            {section('Recent', recent)}
            {!needs.length && !running.length && !recent.length && <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">Nothing yet. Runs, questions and results show here.</p>}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
