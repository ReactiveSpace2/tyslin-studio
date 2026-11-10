import { useEffect, useState } from 'react'
import type { CostTotal, UsageRow } from '@shared/types'
import { PROVIDER_NAME } from '@shared/models'
import type { AgencyView } from '../agencies'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const usd = (n: number): string => (n > 0 && n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`)
const HINT = 'text-xs leading-normal text-muted-foreground'

const add = (a: CostTotal, b: CostTotal): CostTotal => ({
  runs: a.runs + b.runs, cost: a.cost + b.cost, actual: a.actual + b.actual, estimated: a.estimated + b.estimated,
  unreported: a.unreported + b.unreported, inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens
})
const EMPTY: CostTotal = { runs: 0, cost: 0, actual: 0, estimated: 0, unreported: 0, inputTokens: 0, outputTokens: 0 }

/** The cost split, honest: actual (billed by OpenRouter) and estimated parts, and runs that reported nothing. */
function Split({ t }: { t: CostTotal }): JSX.Element {
  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className="font-mono text-sm">{t.runs === t.unreported ? <span className="text-xs text-muted-foreground">not reported</span> : usd(t.cost)}</span>
      <span className="text-[11px] text-muted-foreground">
        {[t.actual > 0 && `${usd(t.actual)} actual`, t.estimated > 0 && `${usd(t.estimated)} estimated`, t.unreported > 0 && `${t.unreported} not reported`].filter(Boolean).join(' · ')}
      </span>
    </span>
  )
}

/**
 * Settings → Usage (10 Nov 2026): this month's spend for this organization from the cost ledger, one row per agency
 * and provider. Organizations keep separate databases, so another organization's spend shows when you switch to it.
 */
export function UsageTab({ agencies }: { agencies: AgencyView[] }): JSX.Element {
  const [rows, setRows] = useState<UsageRow[] | null>(null)
  useEffect(() => { void window.tyslin.costs.usage().then(setRows).catch(() => setRows([])) }, [])
  const name = (id: string | null): string => (id ? agencies.find((v) => v.agency.id === id)?.agency.name ?? 'A removed agency' : 'Outside any agency')
  const provider = (p: string | null): string => (p ? PROVIDER_NAME[p as keyof typeof PROVIDER_NAME] ?? p : 'Not known')
  const total = (rows ?? []).reduce((s, r) => add(s, r.total), EMPTY)
  const month = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <div className="flex flex-col gap-3">
      <Card className="gap-0 overflow-hidden py-0">
        <span className="flex items-center justify-between border-b border-border px-5 py-3"><span className="text-sm font-semibold">{month}</span><span className={HINT}>This organization</span></span>
        {rows === null ? <p className="px-5 py-6 text-[13px] text-muted-foreground">Loading…</p> : rows.length === 0 ? <p className="px-5 py-6 text-[13px] text-muted-foreground">No runs this month yet.</p> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow><TableHead className="pl-5">Agency</TableHead><TableHead>Provider</TableHead><TableHead className="text-right">Runs</TableHead><TableHead className="text-right">Tokens in / out</TableHead><TableHead className="pr-5 text-right">Cost</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${r.agencyId}:${r.provider}`}>
                    <TableCell className="pl-5">{name(r.agencyId)}</TableCell>
                    <TableCell>{provider(r.provider)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{r.total.runs}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{r.total.inputTokens || r.total.outputTokens ? `${r.total.inputTokens.toLocaleString()} / ${r.total.outputTokens.toLocaleString()}` : 'not reported'}</TableCell>
                    <TableCell className="pr-5 text-right"><Split t={r.total} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow><TableCell className="pl-5 font-semibold" colSpan={2}>Total</TableCell><TableCell className="text-right font-mono text-xs">{total.runs}</TableCell><TableCell /><TableCell className="pr-5 text-right"><Split t={total} /></TableCell></TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </Card>
      <span className={HINT}>Actual: what OpenRouter billed. Estimated: worked out from token counts and Tyslin's price list, or the figure Claude Code reports; your provider's invoice is the real number. Not reported: the provider or adapter gave no cost (Codex, Gemini CLI, or a model missing from the price list). Provider "Anthropic", "OpenAI" or "Gemini" on an adapter run means its own key or sign-in.</span>
    </div>
  )
}
