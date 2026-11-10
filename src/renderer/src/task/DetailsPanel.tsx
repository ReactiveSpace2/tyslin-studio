import { useEffect, useState } from 'react'
import type { Agent, ChannelMessage, CostTotal, KanbanCard, McpServerInfo, TaskCosts } from '@shared/types'
import { previewKind } from '@shared/preview'
import type { AgencyView } from '../agencies'
import { useAgentStatuses, STATUS_LABEL } from '../agentStatus'
import { firstName, money } from '../boardStats'
import { needsYou } from './ChannelCard'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { WorkingDots } from '../components/Working'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { NOTIFY_LABEL } from '@shared/agencies'

/** Under a cent still shows what it is. */
const usd = (n: number): string => (n > 0 && n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`)
/** "$1.20 est." / "$1.20" / "not reported", honest about what the total is made of. */
const costText = (t: CostTotal): string => {
  if (t.runs === 0) return 'no runs yet'
  if (t.runs === t.unreported) return 'not reported'
  return `${usd(t.cost)}${t.estimated > 0 ? ' est.' : ''}`
}

/** The task's total from the cost ledger, and per worker under a fold. */
function TaskCost({ taskId, view, agent }: { taskId: string; view: AgencyView | null; agent: Agent }): JSX.Element {
  const [data, setData] = useState<TaskCosts | null>(null)
  useEffect(() => {
    const load = (): void => { void window.tyslin.costs.task(taskId).then(setData).catch(() => setData(null)) }
    load()
    return window.tyslin.sessions.onEvent((e) => { if (e.type === 'run_finished' || e.type === 'run_error') setTimeout(load, 800) })
  }, [taskId])
  const people = new Map([agent, view?.lead, ...(view?.workers ?? [])].filter((a): a is Agent => !!a).map((a) => [a.id, a]))
  const t = data?.total
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md text-left text-[13.5px] outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40" disabled={!data || data.byAgent.length === 0}>
        <span className="flex items-center gap-1.5">This task{data && data.byAgent.length > 0 && <Icon name="updown" size={12} />}</span>
        <span className="font-mono">{t ? costText(t) : '…'}</span>
      </CollapsibleTrigger>
      {t && t.unreported > 0 && t.unreported < t.runs && <span className="text-xs text-muted-foreground">{t.unreported} run{t.unreported === 1 ? '' : 's'} reported no cost, so it was more.</span>}
      <CollapsibleContent className="flex flex-col gap-1 pt-1.5 pl-3">
        {data?.byAgent.map((b) => (
          <span key={b.agentId} className="flex justify-between text-[13px] text-muted-foreground">
            <span>{people.get(b.agentId) ? firstName(people.get(b.agentId)!.name) : 'Removed agent'} · {b.total.runs} run{b.total.runs === 1 ? '' : 's'}</span>
            <span className="font-mono">{costText(b.total)}</span>
          </span>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

const H = ({ children }: { children: string }): JSX.Element => <h3 className="text-[13px] font-semibold">{children}</h3>
const Row = ({ children }: { children: React.ReactNode }): JSX.Element => <div className="flex min-h-8 items-center gap-2.5 text-[13.5px]">{children}</div>

/** The right panel's Details: the agency, who's doing what, cost against the budget, connectors, channel and files. */
export function DetailsPanel({ view, agent, taskId, cards, channel, onOpenAgency, onOpenAgent, onConnectors, onFiles, onPreview }: {
  view: AgencyView | null
  agent: Agent
  /** The task's chat id: its ledger rows (and its cards' worker runs) carry it as task_id. */
  taskId: string
  cards: KanbanCard[]
  channel: ChannelMessage[]
  onOpenAgency: () => void
  onOpenAgent: (a: Agent) => void
  onConnectors: () => void
  onFiles: () => void
  onPreview: (path: string) => void
}): JSX.Element {
  const statuses = useAgentStatuses()
  const [servers, setServers] = useState<McpServerInfo[]>([])
  const [files, setFiles] = useState<string[]>([])
  useEffect(() => { void window.tyslin.integrations.list().then(setServers).catch(() => setServers([])) }, [view?.agency.id])
  useEffect(() => {
    if (!view) { setFiles([]); return }
    void window.tyslin.projects.files(view.project.id).then((f) => setFiles(f.filter((x) => !x.startsWith('memory/') && !x.startsWith('boards/')))).catch(() => setFiles([]))
  }, [view?.project.id, cards.length])
  const team = view ? [view.lead, ...view.workers].filter((a): a is Agent => !!a) : [agent]
  const state = (a: Agent): JSX.Element => {
    const s = statuses.get(a.id)
    if (channel.some((m) => needsYou(m) && m.agentId === a.id)) return <span className="text-green">waiting on you</span>
    if (s?.state === 'working' || cards.some((c) => (c.assignee || c.agentId) === a.id && c.status === 'running')) return <span className="inline-flex items-center gap-1 text-green">working<WorkingDots /></span>
    const mine = cards.filter((c) => (c.assignee || c.agentId) === a.id)
    if (mine.some((c) => c.status === 'done' && !/done/i.test(columnTitle(c)))) return <span>in review</span>
    if (mine.some((c) => !c.status)) return <span>planned</span>
    return <span>{s ? STATUS_LABEL[s.state].toLowerCase() : '…'}</span>
  }
  const columnTitle = (c: KanbanCard): string => (c.log ?? []).slice().reverse().find((l) => /^Moved to /.test(l.text))?.text.replace(/^Moved to /, '') ?? ''
  const usable = servers.filter((s) => s.agentIds.some((id) => team.some((a) => a.id === id)))
  const budget = view?.agency.budget ?? null
  const spent = view?.agency.spent ?? 0

  return (
    <div className="flex flex-col gap-5 p-[18px]">
      {view && (
        <section className="flex flex-col gap-1">
          <H>Agency</H>
          <Row><span className="grid size-[18px] place-items-center rounded-[4px] bg-lime text-[10px] font-bold text-on-lime">{view.agency.name.slice(0, 1)}</span><span className="min-w-0 flex-1 truncate">{view.agency.name}</span><Button variant="link" size="sm" className="h-8 px-1 text-[13px]" onClick={onOpenAgency}>Open</Button></Row>
          <span className="truncate font-mono text-xs text-muted-foreground" title={view.project.folder ?? undefined}>{view.project.folder}</span>
        </section>
      )}
      <section className="flex flex-col gap-0.5">
        <H>Team</H>
        {team.map((a) => (
          <Row key={a.id}>
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left outline-none hover:text-green focus-visible:ring-[3px] focus-visible:ring-ring/40" onClick={() => onOpenAgent(a)}>
              <Avatar shape={a.shape} tone={a.tone} head={a.head} size={22} /><span className="truncate">{firstName(a.name)}</span>{a.id === view?.lead?.id && <span className="text-xs text-muted-foreground">Lead</span>}
            </button>
            <span className="text-xs text-muted-foreground">{state(a)}</span>
          </Row>
        ))}
      </section>
      <section className="flex flex-col gap-2">
        <H>Cost</H>
        <TaskCost taskId={taskId} view={view} agent={agent} />
        {view && (
          <>
            <span className="flex justify-between text-[13.5px]"><span>{view.agency.name} this month</span><span className="font-mono">{budget === null ? money(spent) : `${money(spent)} of $${budget}`}</span></span>
            {budget !== null && budget > 0 && <Progress value={Math.min(100, (spent / budget) * 100)} aria-label="Monthly budget used" className="h-1.5 bg-accent [&>[data-slot=progress-indicator]]:bg-green" />}
          </>
        )}
      </section>
      {view && (
        <section className="flex flex-col gap-0.5">
          <H>Connectors</H>
          {usable.length === 0 && <span className="text-[13px] text-muted-foreground">None yet.</span>}
          {usable.map((s) => (
            <Row key={s.id}><span className="min-w-0 flex-1 truncate">{s.title || s.name}</span><span className="truncate text-xs text-muted-foreground">{team.filter((a) => s.agentIds.includes(a.id)).map((a) => firstName(a.name)).join(', ')}</span></Row>
          ))}
          <Button variant="link" size="sm" className="h-8 self-start px-0 text-[13px]" onClick={onConnectors}>Manage</Button>
        </section>
      )}
      {view && (
        <section className="flex flex-col gap-0.5">
          <H>Channel</H>
          <Row><span className="flex-1">{view.agency.channel.kind === 'none' ? 'In the app only' : view.agency.channel.kind === 'telegram' ? 'Telegram' : 'Slack'}</span><span className="text-xs text-muted-foreground">{NOTIFY_LABEL[view.agency.notify]}</span></Row>
        </section>
      )}
      {view && (
        <section className="flex flex-col gap-1">
          <H>Files</H>
          {files.length === 0 ? <span className="text-[13px] text-muted-foreground">Nothing made yet.</span> : (
            <ul className="flex flex-col gap-0.5">
              {files.slice(0, 10).map((f) => <li key={f} title={f} className="flex min-w-0 items-center gap-2 py-0.5 text-[13px]"><span className="flex-none text-muted-foreground"><Icon name="file" size={12} /></span><span className="min-w-0 flex-1 truncate font-mono text-xs">{f}</span>{previewKind(f) && <Button variant="ghost" size="sm" className="h-6 flex-none px-1.5 text-[11px]" onClick={() => onPreview(f)} aria-label={`Preview ${f}`}>Preview</Button>}</li>)}
            </ul>
          )}
          <Button variant="link" size="sm" className="h-8 self-start px-0 text-[13px]" onClick={onFiles}>{files.length > 10 ? `All ${files.length} files` : 'Open Files'}</Button>
        </section>
      )}
    </div>
  )
}
