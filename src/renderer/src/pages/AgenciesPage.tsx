import { useState } from 'react'
import type { AgencyView } from '../agencies'
import { agencyStatus } from '../agencies'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { RunsOnBadge, runsOnLabel } from '../components/RunsOnBadge'
import { plural } from '../boardStats'
import { STATUS_LABEL, useAgentStatuses } from '../agentStatus'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface Props {
  agencies: AgencyView[]
  onOpen: (projectId: string) => void
  onBoard: (projectId: string) => void
  onEdit: (projectId: string) => void
  onNew: () => void
}

type Filter = 'all' | 'active' | 'paused'
const FILTERS: [Filter, string][] = [['all', 'All'], ['active', 'Active'], ['paused', 'Paused']]

const th = 'h-10 px-4 text-xs font-medium text-muted-foreground'
const td = 'px-4 py-3 text-sm whitespace-normal'

/** Status as a badge: Ready (soft lime), Needs setup / Last run failed (destructive), Paused or No Lead yet (muted). */
function StatusBadge({ tone, label, reason }: { tone: 'on' | 'off' | 'idle' | 'warn'; label: string; reason?: string }): JSX.Element {
  return (
    <Badge variant={tone === 'on' ? 'soft' : tone === 'warn' ? 'destructive' : 'secondary'} className="gap-1.5" title={reason || undefined}>
      <span className={cn('size-[7px] rounded-full', tone === 'on' ? 'bg-green' : tone === 'warn' ? 'bg-destructive' : 'bg-muted-foreground')} aria-hidden="true" />{label}
    </Badge>
  )
}

/** Agency → the organization's agencies: Lead, team, status, with Board and Edit. */
export function AgenciesPage({ agencies, onOpen, onBoard, onEdit, onNew }: Props): JSX.Element {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const statuses = useAgentStatuses()
  /** Ready only when the Lead can run (same rule as Home and the agency page). */
  const statusOf = (v: AgencyView): { label: string; tone: 'on' | 'off' | 'idle' | 'warn'; reason?: string } => {
    const s = v.lead && !v.paused ? statuses.get(v.lead.id) : undefined
    return s && (s.state === 'setup' || s.state === 'failed') ? { label: STATUS_LABEL[s.state], tone: 'warn', reason: s.reason } : agencyStatus(v)
  }
  const shown = agencies
    .filter((v) => !q.trim() || v.project.name.toLowerCase().includes(q.trim().toLowerCase()))
    .filter((v) => filter === 'all' || (filter === 'paused' ? v.paused : !v.paused))
  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6 px-10 pt-8 pb-12 text-foreground">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-xs tracking-[0.08em] text-green uppercase">Studio</span>
          <h1 className="text-[28px] font-semibold tracking-tight">Agencies</h1>
          <p className="text-sm text-muted-foreground">Each agency is a Lead and its team, with a goal, a plan, a board and a line to you.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="relative flex items-center">
            <span className="pointer-events-none absolute left-3 text-muted-foreground"><Icon name="search" size={14} /></span>
            <Input type="search" className="w-[240px] pl-8" placeholder="Search agencies" aria-label="Search agencies" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <Button type="button" onClick={onNew}><Icon name="plus" size={12} /> New agency</Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList aria-label="Filter agencies">
          {FILTERS.map(([id, label]) => <TabsTrigger key={id} active={filter === id} onClick={() => setFilter(id)}>{label}</TabsTrigger>)}
        </TabsList>
        <span className="font-mono text-xs text-muted-foreground" role="status">{plural(shown.length, 'agency', 'agencies')}</span>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="overflow-x-auto">
          <Table aria-label="Agencies">
            <TableHeader className="bg-muted/60">
              <TableRow><TableHead className={th}>Agency</TableHead><TableHead className={th}>Lead</TableHead><TableHead className={th}>Team</TableHead><TableHead className={th}>Status</TableHead><TableHead className={cn(th, 'w-px')}><span className="sr-only">Actions</span></TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((v) => {
                const st = statusOf(v)
                return (
                  <TableRow key={v.project.id} className="transition-colors last:[&>td]:border-b-0 hover:bg-muted/50">
                    <TableCell className={cn(td, 'max-w-[320px]')}>
                      <button type="button" className="min-h-7 rounded-sm text-left font-semibold outline-none hover:text-green focus-visible:ring-[3px] focus-visible:ring-ring/40" onClick={() => onOpen(v.project.id)}>{v.project.name}</button>
                      <span className="block truncate font-mono text-[11.5px] text-muted-foreground">{v.project.folder ?? 'No folder'}</span>
                    </TableCell>
                    <TableCell className={td}>
                      {v.lead ? (
                        <span className="flex min-w-0 items-center gap-2.5">
                          <Avatar shape={v.lead.shape} tone={v.lead.tone} head={v.lead.head} size={32} />
                          <span className="flex min-w-0 flex-col">
                            <strong className="text-sm font-semibold">{v.lead.name}</strong>
                            <span className="flex items-center gap-1.5 font-mono text-[11.5px] text-muted-foreground"><RunsOnBadge agent={v.lead} size={14} />{runsOnLabel(v.lead)}</span>
                          </span>
                        </span>
                      ) : <span className="text-[13px] text-muted-foreground">None yet</span>}
                    </TableCell>
                    <TableCell className={td}>
                      <span className="flex items-center">
                        {v.workers.slice(0, 5).map((w) => <span key={w.id} className="-mr-1.5"><Avatar shape={w.shape} tone={w.tone} head={w.head} size={26} /></span>)}
                        {v.workers.length === 0 && <span className="text-[13px] text-muted-foreground">No workers</span>}
                        {v.workers.length > 5 && <span className="ml-3 font-mono text-xs text-muted-foreground">+{v.workers.length - 5}</span>}
                      </span>
                    </TableCell>
                    <TableCell className={td}><StatusBadge tone={st.tone} label={st.label} reason={st.reason} /></TableCell>
                    <TableCell className={td}>
                      <span className="flex justify-end gap-1.5">
                        <Button type="button" variant="outline" size="sm" onClick={() => onBoard(v.project.id)}>Board</Button>
                        <Button type="button" variant="outline" size="icon" className="size-8" aria-label={`Edit ${v.project.name}`} onClick={() => onEdit(v.project.id)}><Icon name="settings" size={14} /></Button>
                      </span>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        {shown.length === 0 && <p className="p-[18px] text-sm text-muted-foreground">{agencies.length ? 'No agency matches.' : 'No agencies yet. Start one from a template.'}</p>}
      </Card>
    </div>
  )
}
