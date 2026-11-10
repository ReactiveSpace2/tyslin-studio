import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import type { Agent, AgencyCosts, CostEntry, KanbanDoc } from '@shared/types'
import type { AgencyView } from '../agencies'
import { firstName, money } from '../boardStats'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
const HINT = 'text-xs leading-normal text-muted-foreground'
const day = (t: number): string => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const when = (t: number): string => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
/** Costs under a cent still show what they are. */
const exact = (usd: number): string => (usd > 0 && usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`)

const chartConfig = { cost: { label: 'Spent', color: 'var(--chart-1)' } } satisfies ChartConfig

/**
 * Budget (10 Nov 2026): the monthly cap and alert threshold, what the agency spent this month from the cost ledger
 * (with the reset date), spend per day as a shadcn bar chart, and every run. Estimated figures are marked, and runs
 * whose provider or adapter reported no cost say "not reported" instead of $0.
 */
export function BudgetTab({ view, agents, onChanged }: { view: AgencyView; agents: Agent[]; onChanged: () => void }): JSX.Element {
  const { agency } = view
  const [data, setData] = useState<AgencyCosts | null>(null)
  const [board, setBoard] = useState<KanbanDoc | null>(null)
  const [cap, setCap] = useState(agency.budget === null ? '' : String(agency.budget))
  const [alertAt, setAlertAt] = useState(Math.round(agency.alertAt * 100))
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const load = (): void => {
    void window.tyslin.costs.agency(agency.id).then(setData).catch((e) => setError(errorText(e)))
    void window.tyslin.studio.read(agency.projectId, agency.boardPath).then((t) => setBoard(JSON.parse(t) as KanbanDoc)).catch(() => setBoard(null))
  }
  useEffect(load, [agency.id])
  // A run anywhere may belong to this agency; look again when one ends.
  useEffect(() => window.tyslin.sessions.onEvent((e) => { if (e.type === 'run_finished' || e.type === 'run_error') setTimeout(load, 800) }), [agency.id])

  const capBad = cap.trim() !== '' && !(Number.isFinite(Number(cap.trim())) && Number(cap.trim()) >= 0)
  const dirty = cap !== (agency.budget === null ? '' : String(agency.budget)) || alertAt !== Math.round(agency.alertAt * 100)
  const save = async (): Promise<void> => {
    if (capBad) return
    setBusy(true); setError(''); setSaved(false)
    try {
      await window.tyslin.agencies.update(agency.id, { budget: cap.trim() === '' ? null : Number(cap.trim()), alertAt: alertAt / 100 })
      setSaved(true); onChanged()
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }

  const people = useMemo(() => new Map([...agents, view.lead, ...view.workers].filter((a): a is Agent => !!a).map((a) => [a.id, a])), [agents, view])
  const cards = useMemo(() => new Map((board?.columns ?? []).flatMap((c) => c.cards).map((c) => [c.id, c.title])), [board])
  const total = data?.total
  const spent = total?.cost ?? agency.spent
  const share = agency.budget ? Math.min(100, (spent / agency.budget) * 100) : null
  const chart = (data?.daily ?? []).map((d) => ({ day: d.day.slice(8).replace(/^0/, ''), cost: d.cost ?? 0 }))
  const what = (r: CostEntry): string => (r.cardId ? cards.get(r.cardId) ?? 'A card no longer on the board' : r.sessionId === r.taskId ? 'Task chat' : 'Chat')

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="gap-3 px-5 py-[18px]">
          <span className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">Spent this month</span>
            <span className={HINT}>Resets on {new Date(agency.resetsAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long' })}</span>
          </span>
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-mono text-[28px] font-semibold tracking-tight">{exact(spent)}</span>
            {agency.budget !== null && <span className="font-mono text-sm text-muted-foreground">of {money(agency.budget)}</span>}
          </span>
          {share !== null && <Progress value={share} aria-label={`${Math.round(share)}% of the monthly cap`} className="h-2 bg-accent [&>[data-slot=progress-indicator]]:bg-green" />}
          {total && (
            <span className={HINT}>
              {total.runs} run{total.runs === 1 ? '' : 's'} this month.
              {total.estimated > 0 && ` ${exact(total.estimated)} of it is estimated (our price list or the adapter's own figure), not billed.`}
              {total.actual > 0 && ` ${exact(total.actual)} is what OpenRouter billed.`}
              {total.unreported > 0 && ` ${total.unreported} run${total.unreported === 1 ? '' : 's'} reported no cost, so the real total is higher.`}
            </span>
          )}
          <div className="mt-1 h-[180px]">
            {chart.some((d) => d.cost > 0) ? (
              <ChartContainer config={chartConfig} className="h-full w-full">
                <BarChart accessibilityLayer data={chart} margin={{ left: 0, right: 4, top: 4 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={6} interval="preserveStartEnd" />
                  <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => (v === 0 ? '$0' : v < 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(0)}`)} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(v) => exact(Number(v))} />} />
                  <Bar dataKey="cost" fill="var(--color-cost)" radius={4} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="grid h-full place-items-center rounded-lg border border-dashed border-border text-center text-[13px] text-muted-foreground">
                {total && total.runs > 0 ? 'Runs this month reported no cost yet.' : 'No runs this month yet.'}
              </div>
            )}
          </div>
        </Card>

        <Card className="gap-4 px-5 py-[18px]">
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save() }}>
            <span className="text-sm font-semibold">Monthly cap</span>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bg-cap" className="text-sm font-normal">Cap in USD</Label>
              <span className="flex items-center gap-2"><span className="text-muted-foreground">$</span>
                <Input id="bg-cap" value={cap} onChange={(e) => { setCap(e.target.value); setSaved(false) }} inputMode="decimal" placeholder="No cap" aria-invalid={capBad || undefined} aria-describedby="bg-cap-hint" className="font-mono" />
              </span>
              {capBad
                ? <span id="bg-cap-hint" className="text-xs text-destructive" role="alert">Use a number of dollars, like 50, or leave it empty for no cap.</span>
                : <span id="bg-cap-hint" className={HINT}>At the cap, new cards wait and the Lead asks you to raise it or stop. A card already running always finishes.</span>}
            </div>
            <div className="flex flex-col gap-2">
              <span className="flex items-center justify-between"><Label htmlFor="bg-alert" className="text-sm font-normal">Tell me at</Label><span className="font-mono text-sm">{alertAt}%</span></span>
              <Slider id="bg-alert" min={10} max={100} step={5} value={[alertAt]} onValueChange={(v) => { setAlertAt(v[0] ?? 80); setSaved(false) }} aria-label="Alert threshold, percent of the cap" />
              <span className={HINT}>{agency.budget !== null && !capBad && cap.trim() ? `Home shows it when spend passes ${money((Number(cap) * alertAt) / 100)}.` : 'Applies once a cap is set.'}</span>
            </div>
            <span className="flex items-center gap-3">
              <Button type="submit" disabled={busy || !dirty || capBad}>{busy ? 'Saving…' : 'Save'}</Button>
              {saved && !dirty && <span className={HINT} role="status">Saved.</span>}
            </span>
            {error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
          </form>
        </Card>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <span className="flex items-center justify-between border-b border-border px-5 py-3"><span className="text-sm font-semibold">Runs this month</span><span className={HINT}>Newest first</span></span>
        {data && data.rows.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow><TableHead className="pl-5">When</TableHead><TableHead>Card</TableHead><TableHead>Worker</TableHead><TableHead>Model</TableHead><TableHead className="text-right">Tokens in / out</TableHead><TableHead className="pr-5 text-right">Cost</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => {
                  const who = people.get(r.agentId)
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="pl-5 font-mono text-xs whitespace-nowrap text-muted-foreground">{when(r.createdAt)}</TableCell>
                      <TableCell className="max-w-[260px] truncate">{what(r)}{r.status !== 'ok' && <span className="ml-2 text-xs text-muted-foreground">{r.status === 'stopped' ? 'stopped' : r.errorKind === 'credits' ? 'out of credit' : 'failed'}</span>}</TableCell>
                      <TableCell className="whitespace-nowrap">{who ? firstName(who.name) : 'Removed agent'}</TableCell>
                      <TableCell className="max-w-[200px] truncate font-mono text-xs">{r.model ?? (r.provider ? `${r.engine} (its own model)` : r.engine)}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">{r.inputTokens === null ? 'not reported' : `${r.inputTokens.toLocaleString()} / ${(r.outputTokens ?? 0).toLocaleString()}`}</TableCell>
                      <TableCell className="pr-5 text-right whitespace-nowrap">
                        {r.cost === null ? <span className="text-xs text-muted-foreground">not reported</span> : (
                          <span className="inline-flex items-center gap-2"><span className="font-mono text-sm">{exact(r.cost)}</span><Badge variant={r.source === 'actual' ? 'soft' : 'outline'} className="font-normal">{r.source === 'actual' ? 'Actual' : 'Estimated'}</Badge></span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        ) : <p className="px-5 py-6 text-[13px] text-muted-foreground">{data ? `No runs since ${day(data.monthStart)}.` : 'Loading…'}</p>}
      </Card>
      <span className={HINT}>Actual: what OpenRouter charged for the run. Estimated: worked out from token counts and our price list, or the figure Claude Code reports; your provider's invoice is the real number. Not reported: the provider or adapter gave no cost (for example Codex, Gemini CLI, or a model missing from our price list).</span>
    </div>
  )
}
