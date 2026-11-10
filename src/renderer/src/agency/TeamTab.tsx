import { useEffect, useState } from 'react'
import type { Agent, ChannelMessage, KanbanDoc } from '@shared/types'
import type { AgencyView } from '../agencies'
import { STATUS_LABEL, useAgentStatuses } from '../agentStatus'
import { firstName } from '../boardStats'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { RunsOnBadge, runsOnLabel } from '../components/RunsOnBadge'
import { HandOffStem, WorkingBorder, WorkingDots, handOffFlow } from '../components/Working'
import { needsYou } from '../task/ChannelCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface Props {
  view: AgencyView
  you: string
  onOpenAgent: (a: Agent) => void
  onAddWorker: () => void
}

/** What an agent is doing now, from its run state, the board and the Lead's unanswered messages. */
function useTeamState(view: AgencyView): { stateOf: (a: Agent) => { label: string; working: boolean; attention: boolean; now: string } } {
  const statuses = useAgentStatuses()
  const [board, setBoard] = useState<KanbanDoc | null>(null)
  const [msgs, setMsgs] = useState<ChannelMessage[]>([])
  useEffect(() => {
    let live = true
    const load = (): void => {
      void window.tyslin.studio.read(view.project.id, view.agency.boardPath).then((t) => { if (live) setBoard(JSON.parse(t) as KanbanDoc) }).catch(() => { if (live) setBoard(null) })
      void window.tyslin.channels.list(view.agency.id).then((m) => { if (live) setMsgs(m) })
    }
    load()
    const offB = window.tyslin.cards.onBoardChanged((p) => { if (p.projectId === view.project.id) load() })
    const offM = window.tyslin.channels.onMessage((m) => { if (m.agencyId === view.agency.id) load() })
    return () => { live = false; offB(); offM() }
  }, [view.agency.id, view.project.id, view.agency.boardPath])
  const cards = board?.columns.flatMap((c) => c.cards.map((k) => ({ k, col: c.title.toLowerCase() }))) ?? []
  const stateOf = (a: Agent): { label: string; working: boolean; attention: boolean; now: string } => {
    const s = statuses.get(a.id)
    const mine = cards.filter(({ k }) => (k.assignee || k.agentId) === a.id)
    const running = mine.find(({ k }) => k.status === 'running')
    if (s?.state === 'working' || running) return { label: 'Working', working: true, attention: false, now: running ? running.k.title : 'Replying' }
    if (msgs.some((m) => needsYou(m) && m.agentId === a.id)) return { label: 'Waiting on you', working: false, attention: true, now: msgs.find((m) => needsYou(m) && m.agentId === a.id)!.text.split('\n')[0] }
    const review = mine.find(({ col }) => /review/.test(col))
    if (review) return { label: 'In review', working: false, attention: true, now: review.k.title }
    const planned = mine.find(({ col, k }) => /planned/.test(col) && !k.status)
    if (planned) return { label: 'Planned', working: false, attention: false, now: planned.k.title }
    if (s?.state === 'setup' || s?.state === 'failed') return { label: STATUS_LABEL[s.state], working: false, attention: true, now: s.reason }
    return { label: s ? STATUS_LABEL[s.state] : '…', working: false, attention: false, now: '' }
  }
  return { stateOf }
}

/**
 * The org chart (the one custom component in the redesign, approved 10 Nov 2026): you, the Lead, the
 * workers, each card with its live state; a lime line travels round a working agent and solid lime
 * dashes run down the line from the Lead to it. Every animation stops under prefers-reduced-motion.
 */
type StateOf = ReturnType<typeof useTeamState>['stateOf']
export function OrgChart({ view, you, onOpenAgent, stateOf }: Props & { stateOf: StateOf }): JSX.Element {
  const { lead, workers } = view
  const handOff = workers.some((w) => stateOf(w).working)
  const node = (a: Agent, lead: boolean): JSX.Element => {
    const st = stateOf(a)
    return (
      <button type="button" onClick={() => onOpenAgent(a)}
        className={cn('relative flex w-full items-center gap-3 rounded-[12px] border bg-card px-3 py-2.5 text-left outline-none hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/40', st.working || st.attention ? 'border-green' : 'border-border')}>
        {st.working && <WorkingBorder />}
        {st.working && !lead && <HandOffStem />}
        <Avatar shape={a.shape} tone={a.tone} head={a.head} size={40} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1.5"><strong className="truncate text-[13.5px] font-semibold">{firstName(a.name)}</strong>{lead && <Badge variant="soft" className="h-[18px] px-1.5 text-[10.5px]">Lead</Badge>}</span>
          <span className="truncate text-xs text-muted-foreground">{a.description || (lead ? 'Plans and reviews' : 'Agent')} · <span className="font-mono">{runsOnLabel(a)}</span></span>
          <span className={cn('flex items-center text-[12.5px]', st.working ? 'font-semibold text-green' : st.attention ? 'text-green' : 'text-muted-foreground')}>
            {st.label}{st.working && <WorkingDots />}{st.now && <span className="truncate font-normal text-muted-foreground">&nbsp;· {st.now}</span>}
          </span>
        </span>
      </button>
    )
  }
  return (
    <section className="flex flex-col items-center rounded-xl border border-border bg-panel px-6 py-6" aria-label="Org chart">
      <div className="flex w-[300px] max-w-full items-center gap-3 rounded-[12px] border border-foreground bg-card px-3 py-2.5">
        <span className="grid size-10 place-items-center rounded-[10px] bg-primary text-xs font-bold text-primary-foreground">{you.slice(0, 1).toUpperCase()}</span>
        <span className="flex flex-col"><strong className="text-[13.5px] font-semibold">{you}</strong><span className="text-xs text-muted-foreground">Owner · reviews and answers</span></span>
      </div>
      <span className="h-6 w-px bg-border-strong" aria-hidden="true" />
      {lead ? <div className="w-[300px] max-w-full">{node(lead, true)}</div> : <p className="text-[13px] text-muted-foreground">No Lead yet. Add an agent and it becomes the Lead.</p>}
      {workers.length > 0 && (
        <>
          <span className={cn('h-6 w-[2px] bg-border-strong', handOff && handOffFlow)} aria-hidden="true" />
          <div className="grid w-full max-w-[1000px] gap-3 border-t-2 border-border-strong pt-5" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(220px, ${workers.length <= 2 ? '300px' : '1fr'}))`, justifyContent: 'center' }}>
            {workers.map((w) => <div key={w.id}>{node(w, false)}</div>)}
          </div>
        </>
      )}
      <p className="mt-5 text-center text-xs text-muted-foreground">A lime line travels round an agent who is working; dashes run from the Lead to it. Change who someone reports to on their page.</p>
    </section>
  )
}

/** Team: the org chart with live state, or the list. */
export function TeamTab(props: Props): JSX.Element {
  const { view, onOpenAgent, onAddWorker } = props
  const { stateOf } = useTeamState(view)
  const [mode, setMode] = useState<'chart' | 'list'>('chart')
  const team = [view.lead, ...view.workers].filter((a): a is Agent => !!a)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-muted-foreground">Who reports to whom, and what each agent is doing right now.</span>
        <TabsList aria-label="Team view"><TabsTrigger active={mode === 'chart'} onClick={() => setMode('chart')}>Chart</TabsTrigger><TabsTrigger active={mode === 'list'} onClick={() => setMode('list')}>List</TabsTrigger></TabsList>
      </div>
      {mode === 'chart' ? <OrgChart {...props} stateOf={stateOf} /> : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableHeader className="bg-muted/60"><TableRow><TableHead className="h-10 px-4 text-xs">Agent</TableHead><TableHead className="h-10 px-4 text-xs">Job</TableHead><TableHead className="h-10 px-4 text-xs">Runs on</TableHead><TableHead className="h-10 px-4 text-xs">Now</TableHead><TableHead className="h-10 w-20 px-4"><span className="sr-only">Open</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {team.map((a) => {
                const st = stateOf(a)
                return (
                  <TableRow key={a.id}>
                    <TableCell className="px-4 py-2.5"><span className="flex items-center gap-2.5"><Avatar shape={a.shape} tone={a.tone} head={a.head} size={30} /><span className="flex flex-col"><strong className="text-sm font-semibold">{firstName(a.name)}</strong><span className="text-xs text-muted-foreground">{a.id === view.lead?.id ? 'Lead · reports to you' : `reports to ${view.lead ? firstName(view.lead.name) : 'you'}`}</span></span></span></TableCell>
                    <TableCell className="max-w-[260px] px-4 py-2.5 text-sm whitespace-normal text-muted-foreground">{a.description}</TableCell>
                    <TableCell className="px-4 py-2.5"><Badge variant="outline" className="gap-1.5 font-mono"><RunsOnBadge agent={a} size={14} />{runsOnLabel(a)}</Badge></TableCell>
                    <TableCell className="px-4 py-2.5 text-[13px]"><span className={cn(st.working || st.attention ? 'text-green' : 'text-muted-foreground')}>{st.label}</span>{st.now && <span className="block truncate text-xs text-muted-foreground" title={st.now}>{st.now}</span>}</TableCell>
                    <TableCell className="px-4 py-2.5 text-right"><Button variant="ghost" size="sm" onClick={() => onOpenAgent(a)}>Edit</Button></TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}
      <Button variant="outline" size="sm" className="self-start" onClick={onAddWorker}><Icon name="plus" size={12} /> Add a worker</Button>
    </div>
  )
}
