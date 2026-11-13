import { RunFix } from './RunProblem'
import { useEffect, useState } from 'react'
import type { Agent, KanbanCard, PendingChange } from '@shared/types'
import { firstName } from '../boardStats'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { activityLabel, type WorkerRun } from './useTask'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export const startedAt = (c: KanbanCard): number | null => {
  const hit = [...(c.log ?? [])].reverse().find((l) => /^Started with /.test(l.text))
  return hit?.at ?? null
}
export const finishedAt = (c: KanbanCard): number | null => {
  const hit = [...(c.log ?? [])].reverse().find((l) => / finished| failed: /.test(l.text))
  return hit?.at ?? null
}
export const mins = (ms: number): string => { const m = Math.max(1, Math.round(ms / 60_000)); return `${m} min` }
/** Why a card failed, from its log ("<name> failed: …" written by cards.ts), when the live run's error is gone. */
const failedReason = (c: KanbanCard): string | null => {
  const hit = [...(c.log ?? [])].reverse().find((l) => / failed: |^Could not start: /.test(l.text))
  return hit ? hit.text.replace(/^.*? failed: |^Could not start: /, '') : null
}

/**
 * One worker's run on its card, folded to a line: "Sam worked for 6 min · read 4 files, edited 3". Open
 * shows every tool line; when the run left changes, "Review the changes" opens the Changes panel.
 */
export function WorkerWork({ card, run, agent, onReview }: { card: KanbanCard; run: WorkerRun | undefined; agent: Agent | undefined; onReview: (changes: PendingChange[], card: KanbanCard) => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [changes, setChanges] = useState<PendingChange[]>([])
  const running = run?.running ?? card.status === 'running'
  const activity = run?.activity ?? []
  const reads = activity.filter((a) => /^read/i.test(a.name)).length
  const edits = activity.filter((a) => /write|edit/i.test(a.name)).length
  const name = agent ? firstName(agent.name) : 'A worker'
  const from = startedAt(card)
  const to = finishedAt(card)
  const span = from ? mins((running || !to ? Date.now() : to) - from) : null
  // Loaded while the run is going too: an adapter's write waits for review, so the run only ends once it is
  // answered (QA, 10 Nov 2026: the task said "No changes to review" while the worker sat waiting).
  useEffect(() => {
    if (!card.sessionId) return
    let live = true
    void window.tyslin.changes.list(card.sessionId).then((c) => { if (live) setChanges(c) })
    return () => { live = false }
  }, [card.sessionId, running, card.status, run?.staged])
  const pending = changes.filter((c) => c.status === 'pending')
  // The live run's error while the task is open; afterwards the reason stays in the card's log.
  const reason = running ? null : run?.error || (card.status === 'failed' ? failedReason(card) : null)
  // Stop is the boss's choice, not a failure (QA, 10 Nov 2026); cards.ts logs it as "<name> failed: Stopped.".
  const stopped = !!reason && /^Stopped\b/.test(reason)
  const summary = [reads && `read ${reads} file${reads === 1 ? '' : 's'}`, edits && `edited ${edits}`].filter(Boolean).join(', ')
  const line = running ? `${name} is working on “${card.title}”${span ? ` · ${span}` : ''}${summary ? ` · ${summary}` : ''}`
    : card.status === 'failed' && stopped ? `${name} was stopped on “${card.title}”`
    : card.status === 'failed' ? `${name} couldn't finish “${card.title}”` : `${name} worked on “${card.title}”${span ? ` for ${span}` : ''}${summary ? ` · ${summary}` : ''}`

  return (
    <Collapsible id={`cw-${card.id}`} open={open} onOpenChange={setOpen} className="w-full scroll-mt-4">
      <div className={cn('rounded-xl border bg-card', card.status === 'failed' && !stopped ? 'border-destructive/40' : 'border-border')}>
        <CollapsibleTrigger className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3.5 py-2 text-left text-[13.5px] text-foreground/80 outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/40">
          {agent ? <Avatar shape={agent.shape} tone={agent.tone} head={agent.head} size={22} /> : <Icon name="agents" size={16} />}
          <span className="min-w-0 flex-1 truncate">{line}</span>
          {running && <span className="size-2 flex-none animate-blink rounded-full bg-green" aria-label="Running" />}
          <span className="flex-none text-muted-foreground" aria-hidden="true"><Icon name={open ? 'minus' : 'plus'} size={14} /></span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-2 px-3.5 pb-3">
            {activity.length === 0 && !reason && <span className="text-xs text-muted-foreground">{running ? 'Starting…' : 'No tool calls were recorded for this run.'}</span>}
            {activity.length > 0 && (
              <ul className="flex flex-col gap-0.5 font-mono text-[12.5px] leading-relaxed" aria-label="Tool calls">
                {activity.map((a) => (
                  <li key={a.id} className={cn('flex items-center gap-2', a.isError ? 'text-destructive' : 'text-muted-foreground')}>
                    <Icon name={a.isError ? 'warning' : a.done ? 'check' : 'file'} size={12} /><span className="truncate">{activityLabel(a)}</span>
                  </li>
                ))}
              </ul>
            )}
            {reason && !stopped && <p className="rounded-md bg-destructive-soft px-2.5 py-1.5 text-[13px] leading-relaxed break-words text-destructive">{reason}</p>}
            {reason && !stopped && <RunFix error={reason} agent={agent} />}
            {card.result && !running && <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-foreground/85">{card.result.length > 600 ? card.result.slice(0, 600) + '…' : card.result}</p>}
            {changes.length > 0 && (
              <span className="flex flex-wrap items-center gap-2">
                <Button variant={pending.length ? 'lime' : 'outline'} size="sm" className={cn('min-h-9', pending.length && 'font-semibold')} onClick={() => onReview(changes, card)}>
                  {pending.length ? `Review the changes (${pending.length})` : `See the ${changes.length} file${changes.length === 1 ? '' : 's'}`}
                </Button>
              </span>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
