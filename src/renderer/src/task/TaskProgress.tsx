import type { Agent, KanbanCard, KanbanDoc } from '@shared/types'
import { firstName } from '../boardStats'
import { Icon } from '../components/Icon'
import { finishedAt, mins, startedAt } from './WorkerWork'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/** Where one card of the plan stands, read from the board (owner, 14 Nov 2026: canvas artboard 32, B with D). */
export type CardState = 'done' | 'review' | 'working' | 'failed' | 'planned'

export function cardState(c: KanbanCard, board: KanbanDoc | null): CardState {
  if (c.status === 'running') return 'working'
  if (c.status === 'failed') return 'failed'
  const col = (board?.columns.find((x) => x.cards.some((k) => k.id === c.id))?.title ?? '').toLowerCase()
  if (/done/.test(col)) return 'done'
  if (/review/.test(col)) return 'review'
  if (/progress/.test(col)) return 'working'
  return 'planned'
}

const finished = (s: CardState): boolean => s === 'done' || s === 'review'
const clock = (ms: number): string => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
/** Stop is the boss's choice; cards.ts logs it as "<name> failed: Stopped.". */
const wasStopped = (c: KanbanCard): boolean => [...(c.log ?? [])].reverse().find((l) => / failed: /.test(l.text))?.text.includes('failed: Stopped') ?? false

/** One short line about a card: "Ella · working for 4 min". */
function about(c: KanbanCard, state: CardState, who: string | null, next: boolean): string {
  const from = startedAt(c)
  const to = finishedAt(c)
  const what = state === 'working' ? (from ? `working for ${mins(Date.now() - from)}` : 'working')
    : state === 'failed' ? (wasStopped(c) ? 'stopped' : "couldn't finish")
    : state === 'review' ? `finished${to ? ` ${clock(to)}` : ''}, ready for your review`
    : state === 'done' ? `done${to ? ` ${clock(to)}` : ''}`
    : next ? 'next' : 'planned'
  return who ? `${who} · ${what}` : what.charAt(0).toUpperCase() + what.slice(1)
}

/** Bring a card's work into view: the worker's run when it has one, else its row in the Progress card. */
export function showCard(id: string): void {
  const el = document.getElementById(`cw-${id}`) ?? document.getElementById(`tl-${id}`)
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

interface Props { cards: KanbanCard[]; board: KanbanDoc | null; team: Agent[] }
const whoOf = (team: Agent[], c: KanbanCard): string | null => { const a = team.find((x) => x.id === (c.assignee || c.agentId)); return a ? firstName(a.name) : null }

/**
 * The plan as an upright bar beside the conversation: one piece per card, lime when finished, a lime line
 * moving down the one being worked on, red when it failed. It stays in place while the conversation scrolls.
 */
export function ProgressRail({ cards, board, team }: Props): JSX.Element {
  const states = cards.map((c) => cardState(c, board))
  const done = states.filter(finished).length
  const firstPlanned = states.indexOf('planned')
  return (
    <TooltipProvider delayDuration={100}>
      <nav className="flex w-11 flex-none flex-col items-center gap-2 border-l border-border py-3.5" aria-label={`Progress: ${done} of ${cards.length} cards finished`}>
        <span className="font-mono text-[11.5px] text-muted-foreground" aria-hidden="true">{done}/{cards.length}</span>
        <div className="flex min-h-0 w-11 flex-1 flex-col gap-[3px]">
          {cards.map((c, i) => {
            const s = states[i]
            const line = about(c, s, whoOf(team, c), i === firstPlanned)
            return (
              <Tooltip key={c.id}>
                <TooltipTrigger asChild>
                  <button type="button" className="group flex min-h-1.5 w-11 flex-1 justify-center outline-none" aria-label={`${c.title}. ${line}`} onClick={() => showCard(c.id)}>
                    <span className={cn('relative block h-full w-1.5 overflow-hidden rounded-full group-hover:ring-2 group-hover:ring-ring/50 group-focus-visible:ring-2 group-focus-visible:ring-ring',
                      finished(s) ? 'bg-lime' : s === 'failed' ? 'bg-destructive' : s === 'working' ? 'bg-lime-soft inset-ring inset-ring-lime' : 'bg-border')}>
                      {s === 'working' && <span className="absolute inset-x-0 h-2/5 animate-drop rounded-full bg-lime" />}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={-6} className="max-w-[260px]">
                  <span className="block font-medium">{c.title}</span>
                  <span className="block opacity-80">{line}</span>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </nav>
    </TooltipProvider>
  )
}

/** The same cards written out in the conversation, in order down one line: who, where it stands, and the work. */
export function ProgressTimeline({ cards, board, team }: Props): JSX.Element {
  const states = cards.map((c) => cardState(c, board))
  const done = states.filter(finished).length
  const firstPlanned = states.indexOf('planned')
  return (
    <section className="flex flex-col gap-3.5 rounded-xl border border-border bg-card px-4 pt-3.5 pb-4" aria-label="Progress">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13.5px] font-semibold">Progress</h3>
        <span className="font-mono text-[11.5px] text-muted-foreground">{done} of {cards.length} cards finished</span>
      </div>
      <ol className="flex flex-col">
        {cards.map((c, i) => {
          const s = states[i]
          const last = i === cards.length - 1
          return (
            <li key={c.id} id={`tl-${c.id}`} className={cn('relative grid scroll-mt-4 grid-cols-[20px_minmax(0,1fr)] gap-x-2.5', !last && 'pb-4')}>
              {!last && <span className={cn('absolute top-[22px] bottom-0.5 left-[9px] w-0.5 rounded-full', finished(s) ? 'bg-lime' : 'bg-border')} aria-hidden="true" />}
              <span className={cn('grid size-5 place-items-center rounded-full border-2',
                finished(s) ? 'border-lime bg-lime text-on-lime' : s === 'working' ? 'border-lime bg-card' : s === 'failed' ? 'border-destructive bg-card text-destructive' : 'border-border-strong bg-card')} aria-hidden="true">
                {finished(s) && <Icon name="check" size={11} />}
                {s === 'failed' && <Icon name="warning" size={10} />}
                {s === 'working' && <span className="size-2 animate-blink rounded-full bg-green" />}
              </span>
              <span className={cn('text-[13.5px] leading-5', s === 'planned' ? 'text-muted-foreground' : 'font-medium')}>{c.title}</span>
              <span className="col-start-2 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                <span className={cn(s === 'failed' && !wasStopped(c) && 'text-destructive')}>{about(c, s, whoOf(team, c), i === firstPlanned)}</span>
                {c.sessionId && <><span aria-hidden="true">·</span><Button variant="link" size="sm" className="h-auto p-0 text-xs text-green underline" onClick={() => showCard(c.id)}>Show the work</Button></>}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
