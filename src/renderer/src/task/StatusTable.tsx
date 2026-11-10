import type { Agent, KanbanCard, KanbanDoc } from '@shared/types'
import type { AgencyView } from '../agencies'
import { firstName } from '../boardStats'
import { WorkingDots } from '../components/Working'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

/** Where each card of this task stands, from the board: Planned, Working, Review, Done or Failed. */
export function StatusTable({ view, board, cards }: { view: AgencyView; board: KanbanDoc | null; cards: KanbanCard[] }): JSX.Element {
  const team = [view.lead, ...view.workers].filter((a): a is Agent => !!a)
  const columnOf = (c: KanbanCard): string => board?.columns.find((col) => col.cards.some((k) => k.id === c.id))?.title ?? ''
  const badge = (c: KanbanCard): JSX.Element => {
    const col = columnOf(c).toLowerCase()
    if (c.status === 'running') return <Badge variant="soft" className="gap-1.5"><span className="size-[7px] rounded-full bg-green" aria-hidden="true" />Working<WorkingDots /></Badge>
    if (c.status === 'failed') return <Badge variant="destructive">Failed</Badge>
    if (/done/.test(col)) return <Badge variant="soft">Done</Badge>
    if (/review/.test(col)) return <Badge variant="lime">Review</Badge>
    if (/progress/.test(col)) return <Badge variant="soft">Working</Badge>
    if (/planned/.test(col)) return <Badge variant="secondary">Planned</Badge>
    return <Badge variant="secondary">{columnOf(c) || 'Inbox'}</Badge>
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Table>
        <TableHeader className="bg-muted/60">
          <TableRow><TableHead className="h-9 w-[120px] text-xs">Agent</TableHead><TableHead className="h-9 text-xs">Card</TableHead><TableHead className="h-9 w-[110px] text-xs">Status</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {cards.map((c) => {
            const a = team.find((x) => x.id === (c.assignee || c.agentId))
            return (
              <TableRow key={c.id}>
                <TableCell className="py-2 text-[13px]">{a ? firstName(a.name) : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="py-2 text-sm whitespace-normal">{c.title}</TableCell>
                <TableCell className="py-2">{badge(c)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
