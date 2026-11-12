import { useEffect, useState } from 'react'
import type { Agent, KanbanCard, KanbanDoc } from '@shared/types'
import type { AgencyView } from '../agencies'
import { firstName, money } from '../boardStats'
import { Avatar } from '../components/Avatar'
import { WorkingDots } from '../components/Working'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

const when = (ms: number): string => new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/**
 * The agency's board, to look at (owner, 12 Nov 2026: the Lead still plans on it, so show it, last among the
 * tabs). Columns and cards from `boards/<agency>.board.json`, live while it changes. Read-only on purpose: the
 * Lead and main are the board's writers, and cards are changed from the task's Plan card. A card opens a sheet
 * with what to do, the result and what happened to it.
 */
export function BoardTab({ view, onOpenTask }: { view: AgencyView; onOpenTask: (sessionId: string, agentId: string) => void }): JSX.Element {
  const [doc, setDoc] = useState<KanbanDoc | null | undefined>(undefined)
  const [open, setOpen] = useState<{ card: KanbanCard; column: string } | null>(null)
  const { agency } = view
  useEffect(() => {
    let live = true
    const load = (): void => {
      void window.tyslin.studio.read(agency.projectId, agency.boardPath)
        .then((t) => { if (live) setDoc(JSON.parse(t) as KanbanDoc) })
        .catch(() => { if (live) setDoc(null) })
    }
    load()
    const off = window.tyslin.cards.onBoardChanged(() => load())
    return () => { live = false; off() }
  }, [agency.id, agency.projectId, agency.boardPath])
  const team = [view.lead, ...view.workers].filter((a): a is Agent => !!a)
  const who = (c: KanbanCard): Agent | undefined => team.find((a) => a.id === (c.assignee || c.agentId))

  if (doc === undefined) return <p className="text-[13px] text-muted-foreground">Loading…</p>
  if (!doc || doc.columns.every((c) => c.cards.length === 0)) {
    return (
      <Empty className="border border-dashed border-border">
        <EmptyHeader><EmptyTitle>No cards yet</EmptyTitle><EmptyDescription>When you give {view.lead ? firstName(view.lead.name) : 'the Lead'} a task, the plan shows here as cards: who does what, and where each one stands.</EmptyDescription></EmptyHeader>
      </Empty>
    )
  }
  const stateOf = (c: KanbanCard): JSX.Element | null =>
    c.status === 'running' ? <Badge variant="lime" className="gap-0.5">Working<WorkingDots /></Badge>
      : c.status === 'failed' ? <Badge variant="destructive">Did not finish</Badge>
        : null

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-muted-foreground">How {view.lead ? firstName(view.lead.name) : 'the Lead'} organises the work. To change a card, use the plan in its task.</p>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {doc.columns.map((col) => (
          <section key={col.id ?? col.title} className="flex min-h-[calc(100vh-420px)] min-w-[230px] flex-1 flex-col gap-2 rounded-xl bg-muted p-2.5" aria-label={`${col.title}, ${col.cards.length} cards`}>
            <span className="flex items-center justify-between px-1 text-[13px] font-semibold">{col.title}<span className="font-mono text-xs font-normal text-muted-foreground">{col.cards.length}</span></span>
            {col.cards.length === 0 && <span className="px-1 pb-1 text-xs text-muted-foreground">Nothing here.</span>}
            {col.cards.map((c) => {
              const a = who(c)
              return (
                <Card key={c.id} className="relative gap-2 px-3 py-2.5 shadow-xs transition-colors hover:border-border-strong has-[button:focus-visible]:ring-[3px] has-[button:focus-visible]:ring-ring/40">
                  <strong className="text-[13.5px] leading-snug font-medium">{c.title}</strong>
                  <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="flex min-w-0 items-center gap-1.5">{a ? <><Avatar shape={a.shape} tone={a.tone} head={a.head} size={18} /><span className="truncate">{firstName(a.name)}</span></> : 'Nobody yet'}</span>
                    {stateOf(c) ?? (c.cost !== undefined ? <span className="font-mono">{money(c.cost)}</span> : null)}
                  </span>
                  <button type="button" className="absolute inset-0 cursor-pointer rounded-xl outline-none" aria-label={`Open the card ${c.title}`} onClick={() => setOpen({ card: c, column: col.title })} />
                </Card>
              )
            })}
          </section>
        ))}
      </div>
      <Sheet open={!!open} onOpenChange={(o) => { if (!o) setOpen(null) }}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[520px]">
          {open && (() => {
            const c = open.card
            const a = who(c)
            return (
              <>
                <SheetHeader className="border-b border-border px-5 py-4 text-left">
                  <SheetTitle className="pr-8 text-base leading-snug">{c.title}</SheetTitle>
                  <SheetDescription className="flex flex-wrap items-center gap-2 text-[13px]">
                    <Badge variant="secondary">{open.column}</Badge>
                    {a && <span className="flex items-center gap-1.5"><Avatar shape={a.shape} tone={a.tone} head={a.head} size={18} />{firstName(a.name)}</span>}
                    {c.cost !== undefined && <span className="font-mono text-xs">{money(c.cost)} est.</span>}
                  </SheetDescription>
                </SheetHeader>
                <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4 text-sm">
                  {c.notes.trim() && <div className="flex flex-col gap-1.5"><span className="text-[13px] font-medium">What to do</span><p className="leading-relaxed whitespace-pre-wrap text-foreground/90">{c.notes.trim()}</p></div>}
                  {c.result?.trim() && <div className="flex flex-col gap-1.5"><span className="text-[13px] font-medium">Result</span><p className="max-h-[260px] overflow-y-auto rounded-md bg-muted px-3 py-2 leading-relaxed whitespace-pre-wrap">{c.result.trim()}</p></div>}
                  {(c.log ?? []).length > 0 && (
                    <div className="flex flex-col gap-1.5"><span className="text-[13px] font-medium">What happened</span>
                      <ul className="flex flex-col gap-1.5">{(c.log ?? []).map((l, i) => <li key={i} className="flex gap-3 text-[13px]"><span className="w-[108px] flex-none font-mono text-xs text-muted-foreground">{when(l.at)}</span><span className="min-w-0 break-words whitespace-pre-wrap">{l.text}</span></li>)}</ul>
                    </div>
                  )}
                  {c.sessionId && a && <span><Button variant="outline" size="sm" onClick={() => { setOpen(null); onOpenTask(c.sessionId!, a.id) }}>Open {firstName(a.name)}'s work on it</Button></span>}
                </div>
              </>
            )
          })()}
        </SheetContent>
      </Sheet>
    </div>
  )
}
