import { type ReactNode, useId, useState } from 'react'
import type { Agency, AgencyUpdateInput, Agent } from '@shared/types'
import { AGENCY_ADAPTERS } from '@shared/agencies'
import type { AgencyView } from '../agencies'
import { agencyStatus } from '../agencies'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { RunsOnBadge, runsOnLabel } from '../components/RunsOnBadge'
import { WorkingBorder, WorkingDots } from '../components/Working'
import { STATUS_LABEL, useAgentStatuses } from '../agentStatus'
import { type BoardStats, firstName, money, plural, useBoardStats } from '../boardStats'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatCard } from '../components/StatCard'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Switch } from '@/components/ui/switch'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Bar, BarChart, LabelList, XAxis, YAxis } from 'recharts'

interface Props {
  view: AgencyView
  /** org: the overview (org chart); edit: the agency's settings. Chat is the Lead's chat (ChatPage). */
  tab: 'org' | 'edit'
  you: string
  onTab: (tab: 'org' | 'edit') => void
  onBoard: () => void
  /** Watch live: the agency's Live screen. */
  onLive: () => void
  /** Run: open the Lead's chat in this agency. */
  onRun: (lead: Agent) => void
  onOpenAgent: (a: Agent) => void
  onAddWorker: () => void
  onDrive: () => void
  onBack: () => void
  /** Saved, paused or deleted: reload lists. */
  onChanged: () => void
  onDeleted: () => void
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
const adapterName = (id: string): string => id === 'template' ? "Template's mix" : AGENCY_ADAPTERS.find((a) => a.id === id)?.name ?? id
const notifyLabel = (n: Agency['notify']): string => n === 'all' ? 'everything' : n === 'digest' ? 'digest only' : 'questions and reviews'
const channelLabel = (c: Agency['channel']): string => c.kind === 'telegram' ? 'Telegram' : c.kind === 'slack' ? 'Slack' : 'Not set'

/** "Alex is planning 3 cards · 2 waiting for your review · paused", from the board as it is now. */
function statusLine(lead: Agent | null, b: BoardStats | undefined, paused: boolean): string {
  if (!lead) return paused ? 'No Lead yet · paused' : 'No Lead yet. Add an agent and it becomes the Lead.'
  const who = firstName(lead.name)
  if (!b) return paused ? `${who} is paused` : `${who} is ready`
  const head = b.planned > 0 ? `${who} is planning ${plural(b.planned, 'card')}` : null
  const parts = [
    b.inbox > 0 ? (head ? `${b.inbox} in Inbox` : `${plural(b.inbox, 'brief')} in Inbox`) : '',
    b.inProgress > 0 ? `${b.inProgress} in progress` : '',
    b.review > 0 ? `${b.review} waiting for your review` : '',
    paused ? 'paused' : ''
  ].filter(Boolean)
  if (head) return [head, ...parts].join(' · ')
  if (parts.length === 1 && paused) return `${who} is paused`
  if (parts.length) return `${who}: ${parts.join(' · ')}`
  return `${who} is waiting for a brief. Drop one in Inbox on the board.`
}

const th = 'h-10 px-4 text-xs font-medium text-muted-foreground'
const td = 'px-4 py-3 text-sm whitespace-normal'
const selectCls = 'w-full bg-card text-foreground dark:bg-card dark:hover:bg-card'
const hint = 'text-[13px] leading-normal text-muted-foreground'
/** Org chart connector: a solid line, and lime dashes travelling down it while a worker is on a handed-out card (solid lime under reduced motion). */
const LINE = 'h-5 w-0.5 flex-none bg-border-strong'
const FLOW = 'w-[3px] bg-transparent bg-[repeating-linear-gradient(to_bottom,var(--lime)_0_4px,transparent_4px_9px)] bg-[length:3px_18px] animate-flow motion-reduce:animate-none motion-reduce:bg-none motion-reduce:bg-lime'

/** Ready (soft lime), Paused or No Lead yet (muted), or the Lead's problem (Needs setup, Last run failed) with its reason. */
function StatusBadge({ tone, label, reason }: { tone: 'on' | 'off' | 'idle' | 'warn'; label: string; reason?: string }): JSX.Element {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge variant={tone === 'on' ? 'soft' : tone === 'warn' ? 'destructive' : 'secondary'} className="gap-1.5" title={reason || undefined}>
        <span className={cn('size-[7px] rounded-full', tone === 'on' ? 'bg-green' : tone === 'warn' ? 'bg-current' : 'bg-muted-foreground')} aria-hidden="true" />{label}
      </Badge>
      {tone === 'warn' && reason && <span className="text-[13px] text-destructive">{reason}</span>}
    </span>
  )
}

/** A count card (shadcn dashboard SectionCards shape, via StatCard). */
function Stat({ label, value, sub, attention }: { label: string; value: string | number; sub: string; attention?: boolean; mono?: boolean }): JSX.Element {
  return <StatCard label={label} value={value} attention={attention} muted={sub} />
}

const boardConfig = { cards: { label: 'Cards', color: 'var(--chart-1)' } } satisfies ChartConfig

/** Cards per board column (shadcn horizontal bar chart with labels), from the board stats. */
function BoardChart({ board }: { board: BoardStats | undefined }): JSX.Element {
  const data = board ? [
    { column: 'Inbox', cards: board.inbox },
    { column: 'Planned', cards: board.planned },
    { column: 'In progress', cards: board.inProgress },
    { column: 'Review', cards: board.review }
  ] : []
  const open = data.reduce((n, d) => n + d.cards, 0)
  return (
    <Card aria-labelledby="board-chart-h" className="gap-3 py-5">
      <CardHeader className="px-5">
        <CardTitle id="board-chart-h" className="text-base">Board</CardTitle>
        <CardDescription>Open cards by column</CardDescription>
      </CardHeader>
      <CardContent className="px-3">
        {!board ? <p className="px-2 text-sm text-muted-foreground">Loading…</p> : (
          <ChartContainer config={boardConfig} className="aspect-auto h-[170px] w-full">
            <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 4, right: 28 }}>
              <XAxis type="number" dataKey="cards" hide allowDecimals={false} />
              <YAxis dataKey="column" type="category" tickLine={false} axisLine={false} tickMargin={8} width={84} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="cards" fill="var(--color-cards)" radius={5} minPointSize={2}>
                <LabelList dataKey="cards" position="right" offset={8} className="fill-foreground font-mono" fontSize={12} />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
      {board && (
        <div className="px-5 text-sm text-muted-foreground">{open ? `${plural(open, 'open card')} · ${board.review} waiting for you` : 'The board is clear.'}</div>
      )}
    </Card>
  )
}

/** A labelled field: label above, control, optional hint under it. */
function Field({ id, label, hint: note, children }: { id: string; label: string; hint?: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-[13px]">{label}</Label>
      {children}
      {note && <span className={hint}>{note}</span>}
    </div>
  )
}

/** One agency: its overview (counts, team, plan, how it runs, org chart) or its settings. The board is Kanban in its folder. */
export function AgencyPage({ view, tab, you, onBoard, onLive, onRun, onOpenAgent, onAddWorker, onDrive, onBack, onChanged, onDeleted }: Props): JSX.Element {
  const { agency, project, lead, workers } = view
  const board = useBoardStats([agency])[agency.id]
  const statuses = useAgentStatuses()
  // "Ready" only when the Lead can run: a Lead that needs setup (no key, engine missing) or whose last run failed says so.
  const leadStatus = lead ? statuses.get(lead.id) : undefined
  const leadBlocked = !agency.paused && (leadStatus?.state === 'setup' || leadStatus?.state === 'failed')
  const st = leadBlocked && leadStatus
    ? { label: STATUS_LABEL[leadStatus.state], tone: 'warn' as const, reason: leadStatus.reason }
    : { ...agencyStatus(view), reason: '' }
  const working = (a: Agent): boolean => statuses.get(a.id)?.state === 'working'
  // A worker on a card the Lead handed out: dots run down the line from the Lead to it.
  const handOff = workers.some(working)
  const team = [lead, ...workers].filter((a): a is Agent => !!a)
  const workingCount = team.filter(working).length
  const [teamView, setTeamView] = useState<'table' | 'chart'>('table')
  const uid = useId()

  const statusBadge = (a: Agent): JSX.Element => {
    const s = statuses.get(a.id)
    if (!s) return <span className="text-muted-foreground">…</span>
    if (s.state === 'working') return <Badge variant="soft" className="gap-1.5"><span className="size-[7px] rounded-full bg-green" aria-hidden="true" />Working<WorkingDots /></Badge>
    return <Badge variant={s.state === 'failed' ? 'destructive' : 'secondary'} title={s.reason || undefined}>{STATUS_LABEL[s.state]}</Badge>
  }

  const table = (
    <div className="overflow-x-auto">
      <Table aria-label="Team">
        <TableHeader className="bg-muted/60"><TableRow><TableHead className={th}>Agent</TableHead><TableHead className={th}>Job</TableHead><TableHead className={th}>Runs on</TableHead><TableHead className={th}>Status</TableHead></TableRow></TableHeader>
        <TableBody>
          {team.map((a) => (
            <TableRow key={a.id} className="transition-colors last:[&>td]:border-b-0 hover:bg-muted/50">
              <TableCell className={td}>
                <span className="flex items-center gap-2.5">
                  <Avatar shape={a.shape} tone={a.tone} head={a.head} size={32} />
                  <button type="button" className="rounded-sm text-left font-semibold outline-none hover:text-green focus-visible:ring-[3px] focus-visible:ring-ring/40" onClick={() => onOpenAgent(a)}>{a.name}</button>
                  {a.id === lead?.id && <Badge variant="secondary">Lead</Badge>}
                </span>
              </TableCell>
              <TableCell className={cn(td, 'max-w-[320px] text-muted-foreground')}>{a.description || (a.id === lead?.id ? 'Plans the work, hands out cards and reports to you' : '')}</TableCell>
              <TableCell className={td}><Badge variant="outline" className="gap-1.5 font-mono"><RunsOnBadge agent={a} size={14} />{runsOnLabel(a)}</Badge></TableCell>
              <TableCell className={td}>{statusBadge(a)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {team.length === 0 && <p className={cn(hint, 'px-5 pb-5')}>No Lead yet. Add an agent to this agency and it becomes the Lead.</p>}
    </div>
  )

  const chart = (
    <section className="flex min-h-[420px] flex-col items-center border-t border-border bg-panel p-6" aria-label="Org chart">
      <div className="flex items-center gap-2.5 rounded-xl border border-foreground bg-card px-3.5 py-2">
        <span className="grid size-7 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">{you.slice(0, 1).toUpperCase()}</span><strong className="text-sm font-semibold">You</strong>
      </div>
      {lead ? (
        <>
          <span className={LINE} aria-hidden="true" />
          <button type="button" className="relative flex w-[340px] max-w-full items-center gap-3 rounded-[12px] border-2 border-green bg-card px-3.5 py-2.5 text-left outline-none hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/40" onClick={() => onOpenAgent(lead)}>
            {working(lead) && <WorkingBorder />}
            <Avatar shape={lead.shape} tone={lead.tone} head={lead.head} size={44} />
            <span className="flex min-w-0 flex-col gap-0.5 text-xs leading-snug text-muted-foreground">
              <strong className="text-sm font-semibold text-foreground">{lead.name}</strong>
              <span>{lead.description || 'Plans the work, hands out cards and reports to you'}</span>
              <span className="font-mono">{runsOnLabel(lead)}</span>
              {working(lead) && <span className="inline-flex items-center text-[11.5px] font-semibold text-green">Working<WorkingDots /></span>}
            </span>
          </button>
        </>
      ) : <p className={cn(hint, 'mt-4')}>No Lead yet. Add an agent to this agency and it becomes the Lead.</p>}
      {workers.length > 0 && (
        <>
          <span className={cn(LINE, handOff && FLOW)} aria-hidden="true" />
          <div className="grid w-full max-w-[760px] gap-2.5 border-t-2 border-border-strong pt-3" style={{ gridTemplateColumns: `repeat(${Math.min(workers.length, 4)}, minmax(0, 1fr))` }}>
            {workers.map((w) => (
              <button key={w.id} type="button" className="relative flex flex-col items-center gap-1.5 rounded-[12px] border border-border bg-card px-2 py-3 text-center outline-none hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/40" onClick={() => onOpenAgent(w)}>
                {working(w) && <><WorkingBorder /><span className={cn('absolute top-[-14px] left-[calc(50%-1.5px)] h-[13px] w-[3px]', FLOW)} aria-hidden="true" /></>}
                <Avatar shape={w.shape} tone={w.tone} head={w.head} size={38} />
                <strong className="text-[13.5px] font-semibold">{w.name}</strong>
                <span className="text-xs leading-snug text-muted-foreground">{w.description}</span>
                <span className="font-mono text-[10.5px] text-muted-foreground">{runsOnLabel(w)}</span>
                {working(w) && <span className="inline-flex items-center text-[11.5px] font-semibold text-green">Working<WorkingDots /></span>}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )

  const side = (
    <aside className="flex min-w-[260px] flex-[1_1_320px] flex-col gap-4">
      <BoardChart board={board} />
      <Card className="gap-3.5 px-5 py-[18px]">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Plan</h2>
          <span className={hint}>The Lead turns each step into cards in the Inbox.</span>
        </div>
        {agency.plan.length === 0 && <p className={hint}>No plan yet. The Lead writes one from your first brief.</p>}
        {agency.plan.length > 0 && (
          <ol className="flex flex-col gap-3">
            {agency.plan.map((p, i) => (
              <li key={i} className="flex gap-3 text-sm leading-normal">
                <span className="inline-flex size-[26px] flex-none items-center justify-center rounded-full bg-primary font-mono text-xs text-primary-foreground">{i + 1}</span>
                <span className="pt-0.5">{p}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
      <Card className="gap-2.5 px-5 py-[18px]">
        <h2 className="text-base font-semibold">How it runs</h2>
        <dl className="flex flex-col gap-2 text-[13.5px]">
          <div className="flex justify-between gap-2.5"><dt className="text-muted-foreground">Workers run on</dt><dd className="text-right">{adapterName(agency.adapter)}</dd></div>
          <div className="flex justify-between gap-2.5"><dt className="text-muted-foreground">Cards</dt><dd className="text-right">{agency.autoRun ? 'Lead runs them' : 'You run them'}</dd></div>
          <div className="flex justify-between gap-2.5"><dt className="text-muted-foreground">Channel</dt><dd className="text-right">{channelLabel(agency.channel)}{agency.channel.kind !== 'none' ? ` · ${notifyLabel(agency.notify)}` : ''}</dd></div>
          <div className="flex justify-between gap-2.5"><dt className="text-muted-foreground">Budget</dt><dd className="text-right font-mono">{agency.budget === null ? 'Not set' : `${agency.spent.toFixed(2)} of ${agency.budget}`}</dd></div>
        </dl>
      </Card>
      <button type="button" data-slot="card" className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-4 text-left shadow-xs outline-none transition-colors hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/40" onClick={onBoard}>
        <span className="flex flex-col gap-1"><span className="font-mono text-xs tracking-[0.08em] text-green uppercase">Board</span><strong className="text-sm font-semibold">Open the Kanban board</strong></span>
        <Icon name="arrowUp" size={14} />
      </button>
    </aside>
  )
  const [draft, setDraft] = useState<AgencyUpdateInput>({
    name: agency.name, description: agency.description, goal: agency.goal, prompt: agency.prompt, plan: agency.plan,
    adapter: agency.adapter, channel: agency.channel, notify: agency.notify, budget: agency.budget, autoRun: agency.autoRun
  })
  const set = (p: AgencyUpdateInput): void => setDraft((d) => ({ ...d, ...p }))
  // Kept as typed text, so "12." or "0.5" can be entered; turned into a number on save.
  const [budgetText, setBudgetText] = useState(agency.budget === null ? '' : String(agency.budget))
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async (): Promise<void> => {
    setError(null); setSaved(null)
    const budget = budgetText.trim() === '' ? null : Number(budgetText.trim())
    if (budget !== null && (!Number.isFinite(budget) || budget < 0)) { setError('The monthly budget must be a number, or empty for none.'); return }
    setBusy(true)
    try {
      await window.tyslin.agencies.update(agency.id, { ...draft, budget })
      setSaved('Saved.')
      onChanged()
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const togglePause = async (): Promise<void> => {
    try { await window.tyslin.agencies.update(agency.id, { paused: !agency.paused }); onChanged() } catch (e) { setError(errorText(e)) }
  }
  const [confirmDelete, setConfirmDelete] = useState(false)
  const memberCount = workers.length + (lead ? 1 : 0)
  const remove = async (): Promise<void> => {
    try { await window.tyslin.agencies.remove(agency.id); onDeleted() } catch (e) { setError(errorText(e)) }
  }
  const id = (k: string): string => `${uid}-${k}`

  return (
    <div className="flex w-full flex-col text-foreground">
      {/* The path is in the app header (SiteHeader); this row keeps only the page actions. */}
      <header className="flex flex-wrap items-center justify-end gap-3 px-6 pt-4">
        {tab === 'edit' && <Button type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</Button>}
        {tab !== 'edit' && (
          <>
            <Button type="button" variant="outline" onClick={() => void togglePause()}><Icon name={agency.paused ? 'play' : 'pause'} size={12} /> {agency.paused ? 'Resume' : 'Pause'}</Button>
            <Button type="button" variant="lime" disabled={!lead || agency.paused || leadStatus?.state === 'setup'}
              title={!lead ? 'Add a Lead first' : leadStatus?.state === 'setup' ? `${lead.name} needs setup: ${leadStatus.reason || 'open its page'}` : `${lead.name} plans the Inbox now`} onClick={() => lead && onRun(lead)}>
              <Icon name="play" size={12} /> Run
            </Button>
          </>
        )}
      </header>

      <div className="flex w-full max-w-[1180px] flex-col gap-6 px-6 pt-7 pb-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[28px] font-semibold tracking-tight">{tab === 'edit' ? `Edit ${agency.name}` : agency.name}</h1>
              {tab !== 'edit' && <StatusBadge tone={st.tone} label={st.label} reason={st.reason} />}
            </div>
            {tab !== 'edit' && <p className="text-[15px] font-medium" role="status">{statusLine(lead, board, agency.paused)}</p>}
            {tab !== 'edit' && (agency.goal || agency.description) && <p className="text-sm text-muted-foreground">{agency.goal || agency.description}</p>}
            {tab !== 'edit' && <p className="font-mono text-[13px] break-all text-muted-foreground">{project.folder ?? 'No folder'}</p>}
          </div>
          {tab !== 'edit' && workingCount > 0 && <Badge variant="soft" className="gap-1.5"><span className="size-[7px] rounded-full bg-green" aria-hidden="true" />{plural(workingCount, 'agent')} working<WorkingDots /></Badge>}
        </div>
        {error && <p className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}

        {tab === 'org' && (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat label="Inbox" value={board ? board.inbox : '…'} sub="Briefs waiting to be planned" />
              <Stat label="In progress" value={board ? board.inProgress : '…'} sub="Cards being worked on" />
              <Stat label="Needs your review" value={board ? board.review : '…'} sub="Cards waiting for you" attention={!!board && board.review > 0} />
              <Stat label="Spend, last 7 days" value={board ? money(board.spentWeek) : '…'} sub="Estimated from card logs" mono />
            </div>
            <div className="flex flex-wrap items-start gap-4">
              <Card className="min-w-0 flex-[999_1_520px] gap-0 overflow-hidden py-0">
                <CardHeader className="px-5 pt-[18px] pb-3.5">
                  <CardTitle><h2 className="text-base font-semibold">Team</h2></CardTitle>
                  <CardDescription>{lead ? `Workers report to ${lead.name}. Only ${firstName(lead.name)} messages you.` : 'No Lead yet.'}</CardDescription>
                  <CardAction className="flex flex-wrap items-center gap-2">
                    <TabsList aria-label="Team view">
                      <TabsTrigger active={teamView === 'table'} onClick={() => setTeamView('table')}>List</TabsTrigger>
                      <TabsTrigger active={teamView === 'chart'} onClick={() => setTeamView('chart')}>Org chart</TabsTrigger>
                    </TabsList>
                    <Button type="button" variant="outline" size="sm" onClick={onLive}><Icon name="live" size={12} /> Watch live</Button>
                    <Button type="button" variant="outline" size="sm" onClick={onAddWorker}><Icon name="plus" size={12} /> Add a worker</Button>
                  </CardAction>
                </CardHeader>
                {teamView === 'table' ? table : chart}
              </Card>
              {side}
            </div>
          </>
        )}

        {tab === 'edit' && (
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
              <Card className="gap-3.5 px-5 py-[18px]">
                <h2 className="text-base font-semibold">Basics</h2>
                <Field id={id('name')} label="Agency name"><Input id={id('name')} value={draft.name ?? ''} onChange={(e) => set({ name: e.target.value })} /></Field>
                <Field id={id('desc')} label="What this agency does"><Textarea id={id('desc')} rows={2} value={draft.description ?? ''} onChange={(e) => set({ description: e.target.value })} placeholder="Describe the work in a sentence or two." /></Field>
                <Field id={id('goal')} label="Goal"><Input id={id('goal')} value={draft.goal ?? ''} onChange={(e) => set({ goal: e.target.value })} placeholder="One sentence" /></Field>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={id('prompt')} className="text-[13px]">Agency prompt</Label>
                  <span className={hint} id={id('prompt-hint')}>Every agent in this agency follows this. Each agent's own job instructions are on its page. Changes apply to new chats and new agents.</span>
                  <Textarea id={id('prompt')} aria-describedby={id('prompt-hint')} rows={4} className="resize-y" value={draft.prompt ?? ''} onChange={(e) => set({ prompt: e.target.value })} placeholder="How this agency works: tools, style, what to ask you before doing." />
                </div>
              </Card>
              <Card className="gap-3.5 px-5 py-[18px]">
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-semibold">Plan</h2>
                  <p className={hint}>The Lead turns each step into cards in the Inbox.</p>
                </div>
                {(draft.plan ?? []).map((p, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <span className="w-[18px] flex-none font-mono text-[13px] text-muted-foreground">{i + 1}</span>
                    <Input value={p} aria-label={`Plan step ${i + 1}`} onChange={(e) => set({ plan: (draft.plan ?? []).map((x, j) => (j === i ? e.target.value : x)) })} />
                    <Button type="button" variant="outline" size="icon" className="size-8 flex-none" aria-label={`Remove step ${i + 1}`} onClick={() => set({ plan: (draft.plan ?? []).filter((_, j) => j !== i) })}><Icon name="close" size={12} /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => set({ plan: [...(draft.plan ?? []), ''] })}><Icon name="plus" size={12} /> Add a step</Button>
              </Card>
              <Card className="gap-0 overflow-hidden py-0">
                <h2 className="px-5 pt-[18px] pb-3 text-base font-semibold">Roster</h2>
                <ul className="flex flex-col">
                  {team.map((a) => (
                    <li key={a.id} className="grid grid-cols-[34px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-2.5 border-t border-border px-5 py-2.5">
                      <Avatar shape={a.shape} tone={a.tone} head={a.head} size={34} />
                      <span className="flex min-w-0 flex-col"><strong className="truncate text-sm font-semibold">{a.name}</strong><span className="text-xs text-muted-foreground">{a.id === lead?.id ? 'Lead · reports to you' : `Reports to ${lead?.name ?? 'you'}`}</span></span>
                      <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted-foreground"><RunsOnBadge agent={a} size={14} /><span className="truncate">{runsOnLabel(a)}</span></span>
                      <span className="truncate font-mono text-xs text-muted-foreground">{a.engine === 'builtin' ? a.model : "Engine's own model"}</span>
                      <Button type="button" variant="outline" size="sm" onClick={() => onOpenAgent(a)}>Open</Button>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-border px-5 py-3.5">
                  <Button type="button" variant="outline" size="sm" onClick={onAddWorker}><Icon name="plus" size={12} /> Add a worker</Button>
                </div>
              </Card>
            </div>
            <aside className="flex min-w-[260px] flex-[1_1_320px] flex-col gap-4">
              <Card className="gap-3.5 px-5 py-[18px]">
                <h2 className="text-base font-semibold">How it runs</h2>
                <Field id={id('adapter')} label="New workers run on" hint="Existing agents keep theirs; change one on its page.">
                  <Select value={draft.adapter ?? 'template'} onValueChange={(v) => set({ adapter: v })}>
                    <SelectTrigger id={id('adapter')} className={selectCls}><SelectValue /></SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value="template">Template's mix</SelectItem>
                      {AGENCY_ADAPTERS.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="flex min-h-11 items-center justify-between gap-3">
                  <Label htmlFor={id('auto')} className="text-sm font-normal">Lead runs cards automatically</Label>
                  <Switch id={id('auto')} checked={!!draft.autoRun} onCheckedChange={(v) => set({ autoRun: v })} />
                </div>
                <Field id={id('budget')} label="Monthly budget" hint={`In your default model's currency. The Lead stops starting cards when it's reached. Spent so far: ${agency.spent.toFixed(2)}.`}>
                  <Input id={id('budget')} className="font-mono" value={budgetText} placeholder="Not set" inputMode="decimal"
                    onChange={(e) => setBudgetText(e.target.value)} />
                </Field>
              </Card>
              <Card className="gap-3.5 px-5 py-[18px]">
                <h2 className="text-base font-semibold">Channel</h2>
                <Field id={id('channel')} label="Lead talks to you on">
                  <Select value={draft.channel?.kind ?? 'none'} onValueChange={(v) => set({ channel: { kind: v as Agency['channel']['kind'] } })}>
                    <SelectTrigger id={id('channel')} className={selectCls}><SelectValue /></SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value="none">Not now</SelectItem><SelectItem value="telegram">Telegram</SelectItem><SelectItem value="slack">Slack</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field id={id('notify')} label="What the Lead sends">
                  <Select value={draft.notify ?? 'questions'} onValueChange={(v) => set({ notify: v as Agency['notify'] })}>
                    <SelectTrigger id={id('notify')} className={selectCls}><SelectValue /></SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value="questions">Questions and reviews</SelectItem><SelectItem value="all">Everything</SelectItem><SelectItem value="digest">Digest only</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </Card>
              <Card className="gap-3.5 px-5 py-[18px]">
                <h2 className="text-base font-semibold">Folder</h2>
                <span className="font-mono text-[13px] [overflow-wrap:anywhere] text-muted-foreground">{project.folder ?? 'No folder'}</span>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={onDrive}>Open in Drive</Button>
                  <Button type="button" variant="ghost" size="sm" className="text-destructive hover:bg-destructive-soft hover:text-destructive" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={12} /> Delete agency</Button>
                </div>
              </Card>
              {saved && <p className={hint} role="status">{saved}</p>}
              <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete the agency "{agency.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>Its {memberCount} agents, their chats, the Lead's task and the board are deleted. Files in its folder stay on your computer.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => void remove()}>Delete agency</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
