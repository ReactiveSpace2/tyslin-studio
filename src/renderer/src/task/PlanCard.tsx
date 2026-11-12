import { useEffect, useState } from 'react'
import type { Agent, KanbanCard } from '@shared/types'
import type { AgencyView } from '../agencies'
import { firstName } from '../boardStats'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { useConfirm } from '../components/useConfirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
const menuItem = 'min-h-10 cursor-pointer gap-2.5 rounded-md px-2.5'

/**
 * "Plan ready for your OK": the Lead's planned cards that haven't run. Each row can be run now, given to
 * someone else, edited or removed; Approve runs them one after another (cards.runPlan).
 */
export function PlanCard({ view, cards, workingOn, onAskLead, onChanged, onOpenAgency }: {
  view: AgencyView
  cards: KanbanCard[]
  /** The card running now and who has it, when one is. */
  workingOn?: { title: string; who: string } | null
  onAskLead: () => void
  onChanged: () => void
  onOpenAgency: () => void
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<KanbanCard | null>(null)
  const [confirmEl, confirm] = useConfirm()
  // Approved already (cards.runPlan): the rest are queued, one at a time, so the card stops asking (owner, 12 Nov 2026:
  // it kept saying "Plan ready for your OK" with the Approve button while the approved plan was running).
  const [approved, setApproved] = useState(false)
  const key = cards.map((c) => c.id).join(',') + (workingOn?.title ?? '')
  useEffect(() => {
    let live = true
    void window.tyslin.cards.approved().then((ids) => { if (live) setApproved(ids.includes(view.agency.id)) }).catch(() => undefined)
    return () => { live = false }
  }, [view.agency.id, key, busy])
  const team = [view.lead, ...view.workers].filter((a): a is Agent => !!a)
  const who = (c: KanbanCard): Agent | undefined => team.find((a) => a.id === (c.assignee || c.agentId))
  const lead = view.lead ? firstName(view.lead.name) : 'the Lead'
  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true); setError('')
    try { await fn(); onChanged() } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }

  return (
    <Card className={approved ? 'gap-3 px-4 py-3.5' : 'gap-3 border-green px-4 py-3.5'} role="group" aria-label="Plan">
      {confirmEl}
      <span className="flex items-center justify-between gap-2">
        <strong className="text-[15px] font-semibold">{approved ? 'Plan approved' : 'Plan ready for your OK'}</strong>
        {approved ? <Badge variant="soft">Queued</Badge> : <Badge variant="lime">Needs you</Badge>}
      </span>
      <span className="text-[13.5px] text-muted-foreground">{approved
        ? `${cards.length} card${cards.length === 1 ? '' : 's'} still to run, one at a time. ${workingOn ? `${cards.length === 1 ? 'It starts' : 'The next starts'} when ${workingOn.who} finishes “${workingOn.title}”.` : 'The next one starts on its own.'}`
        : `${cards.length} card${cards.length === 1 ? '' : 's'}. Nothing runs until you approve, because auto-run is off for ${view.agency.name}.`}</span>
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader className="bg-muted/60">
            <TableRow>
              <TableHead className="h-9 text-xs">Card</TableHead>
              <TableHead className="h-9 w-[160px] text-xs">Who</TableHead>
              <TableHead className="h-9 w-11"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cards.map((c) => {
              const a = who(c)
              return (
                <TableRow key={c.id}>
                  <TableCell className="py-2 text-sm whitespace-normal">{c.title}</TableCell>
                  <TableCell className="py-2 text-[13px]">
                    {a ? <span className="flex items-center gap-1.5"><Avatar shape={a.shape} tone={a.tone} head={a.head} size={20} />{firstName(a.name)}</span> : <span className="text-muted-foreground">Nobody yet</span>}
                  </TableCell>
                  <TableCell className="py-1 pr-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-9" aria-label={`Actions for ${c.title}`} disabled={busy}><Icon name="more" size={15} /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[220px] rounded-xl p-1.5 shadow-lg">
                        <DropdownMenuItem className={menuItem} onSelect={() => void run(() => window.tyslin.cards.run(view.agency.id, c.id))}><Icon name="play" size={14} /> Run this card now</DropdownMenuItem>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className={menuItem}><Icon name="agents" size={14} /> Reassign</DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="rounded-xl p-1.5 shadow-lg">
                            {team.map((m) => (
                              <DropdownMenuItem key={m.id} className={menuItem} disabled={m.id === a?.id} onSelect={() => void run(() => window.tyslin.cards.update(view.agency.id, c.id, { assignee: m.id }))}>
                                <Avatar shape={m.shape} tone={m.tone} head={m.head} size={18} /> {firstName(m.name)}{m.id === view.lead?.id ? ' (Lead)' : ''}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuItem className={menuItem} onSelect={() => setEditing(c)}><Icon name="file" size={14} /> Edit the card</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className={`${menuItem} text-destructive focus:text-destructive`} onSelect={() => void confirm({ title: `Remove “${c.title}” from the plan?`, description: `The card and its notes are deleted from the board. Ask ${lead} to plan it again if you need it back.`, action: 'Remove', destructive: true }).then((ok) => { if (ok) void run(() => window.tyslin.cards.remove(view.agency.id, c.id)) })}><Icon name="trash" size={14} /> Remove from the plan</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <span className="flex flex-wrap items-center gap-2">
        {!approved && <Button variant="lime" size="sm" className="min-h-9 font-semibold" disabled={busy} onClick={() => void run(() => window.tyslin.cards.runPlan(view.agency.id))}><Icon name="play" size={12} /> Approve and run the plan</Button>}
        <Button variant="outline" size="sm" className="min-h-9" onClick={onAskLead}>Ask {lead} to change it</Button>
        <Button variant="link" size="sm" className="ml-auto h-9 px-1 text-xs text-muted-foreground" onClick={onOpenAgency}>Auto-run: Agency → Goals → Limits</Button>
      </span>
      {error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
      {editing && (
        <EditCardDialog card={editing} onClose={() => setEditing(null)}
          onSave={(title, notes) => run(() => window.tyslin.cards.update(view.agency.id, editing.id, { title, notes })).then(() => setEditing(null))} />
      )}
    </Card>
  )
}

function EditCardDialog({ card, onClose, onSave }: { card: KanbanCard; onClose: () => void; onSave: (title: string, notes: string) => Promise<void> }): JSX.Element {
  const [title, setTitle] = useState(card.title)
  const [notes, setNotes] = useState(card.notes)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[520px] max-w-[calc(100%-32px)] gap-4 rounded-2xl p-6 sm:max-w-[calc(100%-32px)]">
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void onSave(title, notes) }}>
          <DialogHeader className="text-left">
            <DialogTitle>Edit the card</DialogTitle>
            <DialogDescription className="sr-only">Change the card's title and notes.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5"><Label htmlFor="ec-title">Title</Label><Input id="ec-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} autoFocus /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="ec-notes">What to do</Label><Textarea id="ec-notes" rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!title.trim()}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
