import type { Agent } from '@shared/types'
import { AGENCY_TEMPLATES } from '@shared/agencies'
import type { AgencyView } from '../agencies'
import { useAgentStatuses } from '../agentStatus'
import { money, plural } from '../boardStats'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Pose } from '../components/Pose'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  agencies: AgencyView[]
  runningByAgency: Record<string, number>
  needsYouByAgency: Record<string, number>
  onOpen: (agencyId: string) => void
  onNew: (templateId?: string) => void
  onSettings: () => void
}

/** Every agency as a card: the team, what needs you, what's running and the month's spend; then the templates you can add. */
export function AgenciesPage({ agencies, runningByAgency, needsYouByAgency, onOpen, onNew, onSettings }: Props): JSX.Element {
  const statuses = useAgentStatuses()
  const card = 'flex flex-col gap-3.5 rounded-xl border bg-card p-5 text-left shadow-xs outline-none transition-colors hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/40'
  return (
    <div className="flex flex-col gap-6 px-10 pt-7 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-[32px] font-semibold tracking-tight">Your agencies</h1>
          <p className="text-[15px] font-medium text-green">Every agent you run. One studio.</p>
          <span className="font-mono text-xs text-muted-foreground">{plural(agencies.length, 'agency', 'agencies')}{Object.values(runningByAgency).reduce((a, b) => a + b, 0) ? ` · ${plural(Object.values(runningByAgency).reduce((a, b) => a + b, 0), 'task')} running` : ''}</span>
          <Button className="mt-1 self-start" onClick={() => onNew()}><Icon name="plus" size={13} /> New agency</Button>
        </div>
        <div className="relative hidden h-[200px] w-[360px] items-end justify-center lg:flex" aria-hidden="true">
          <span className="absolute right-8 bottom-0 size-[200px] rounded-full bg-lime-soft" />
          <Pose pose={5} height={160} className="relative -mr-5 z-[1]" />
          <Pose pose={1} height={200} className="relative" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {agencies.map((v) => {
          const team = [v.lead, ...v.workers].filter((a): a is Agent => !!a)
          const ls = v.lead ? statuses.get(v.lead.id) : undefined
          const setup = ls?.state === 'setup'
          const need = needsYouByAgency[v.agency.id] ?? 0
          const running = runningByAgency[v.agency.id] ?? 0
          return (
            <button key={v.agency.id} type="button" className={cn(card, setup && 'border-dashed bg-transparent shadow-none')} onClick={() => onOpen(v.agency.id)}>
              <span className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-center gap-3">
                  <span className={cn('grid size-10 flex-none place-items-center rounded-xl text-base font-bold', setup ? 'border border-dashed border-border text-muted-foreground' : 'bg-lime text-on-lime')}>{v.agency.name.slice(0, 1).toUpperCase()}</span>
                  <span className="flex min-w-0 flex-col"><strong className="truncate text-base font-semibold">{v.agency.name}</strong><span className="text-xs text-muted-foreground">{v.lead ? `Lead ${v.lead.name.replace(/\s*\([^)]*\)$/, '')}` : 'No Lead'} · {plural(v.workers.length, 'worker')}</span></span>
                </span>
                {need > 0 ? <Badge variant="lime">Needs you · {need}</Badge> : v.agency.paused ? <Badge variant="secondary">Paused</Badge> : setup ? <Badge variant="destructive">Needs setup</Badge> : running ? <Badge variant="soft">Running</Badge> : <Badge variant="secondary">Idle</Badge>}
              </span>
              <span className="flex">{team.map((a, i) => <span key={a.id} className={cn('rounded-full border-2 border-card bg-muted', i > 0 && '-ml-1.5')}><Avatar shape={a.shape} tone={a.tone} head={a.head} size={26} /></span>)}</span>
              <span className="text-[13.5px] text-foreground/80">
                {setup ? <span className="text-destructive">{ls?.reason || 'The Lead needs a model key.'}</span>
                  : <>{running ? `${plural(running, 'task')} running` : 'Nothing running'} · <span className="font-mono">{money(v.agency.spent)}</span>{v.agency.budget !== null ? <> of <span className="font-mono">${v.agency.budget}</span></> : ''} this month</>}
              </span>
              {setup && <span className="inline-flex h-8 items-center self-start rounded-md border border-border bg-card px-3 text-[13px] font-medium" onClick={(e) => { e.stopPropagation(); onSettings() }}>Finish setup</span>}
            </button>
          )
        })}
      </div>
      <div className="flex flex-col gap-2.5">
        <span className="font-mono text-[11px] tracking-[0.08em] text-green uppercase">Templates you can add</span>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {AGENCY_TEMPLATES.filter((t) => !agencies.some((v) => v.agency.templateId === t.id)).map((t) => (
            <button key={t.id} type="button" disabled={t.comingSoon} onClick={() => onNew(t.id)}
              className={cn('flex flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3.5 text-left shadow-xs outline-none transition-colors hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-default disabled:opacity-55 disabled:hover:border-border')}>
              <strong className="text-sm font-semibold">{t.name}</strong>
              <span className="text-xs text-muted-foreground">{t.comingSoon ? 'Coming soon' : t.tagline}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
