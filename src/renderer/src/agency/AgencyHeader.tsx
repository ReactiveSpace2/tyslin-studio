import { useState } from 'react'
import type { Agent } from '@shared/types'
import type { AgencyView } from '../agencies'
import { useAgentStatuses } from '../agentStatus'
import { firstName, plural } from '../boardStats'
import { Icon } from '../components/Icon'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
const menuItem = 'min-h-10 cursor-pointer gap-2.5 rounded-md px-2.5'

interface Props {
  view: AgencyView
  agencies: AgencyView[]
  onPick: (agencyId: string) => void
  onNewAgency: () => void
  onNewTask: () => void
  onChanged: () => void
  onDeleted: () => void
}

/** The agency pills, the agency's name and folder, New task here, and the ⋯ menu (rename, pause, folder, delete). */
export function AgencyHeader({ view, agencies, onPick, onNewAgency, onNewTask, onChanged, onDeleted }: Props): JSX.Element {
  const { agency, project, lead, workers } = view
  const statuses = useAgentStatuses()
  const [renaming, setRenaming] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState('')
  const leadStatus = lead ? statuses.get(lead.id) : undefined
  const run = async (fn: () => Promise<unknown>): Promise<void> => { setError(''); try { await fn(); onChanged() } catch (e) { setError(errorText(e)) } }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Agencies">
        {agencies.map((v) => {
          const on = v.agency.id === agency.id
          const s = v.lead ? statuses.get(v.lead.id) : undefined
          return (
            <button key={v.agency.id} type="button" role="tab" aria-selected={on} onClick={() => onPick(v.agency.id)}
              className={cn('inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-border-strong')}>
              {v.agency.name}
              {s?.state === 'setup' && !on && <Badge variant="secondary" className="h-[18px] px-1.5 text-[10.5px]">Setup</Badge>}
            </button>
          )
        })}
        <Button variant="outline" className="h-9 rounded-full border-dashed text-muted-foreground" onClick={onNewAgency}><Icon name="plus" size={13} /> New agency</Button>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-[52px] flex-none place-items-center rounded-[14px] bg-lime text-xl font-bold text-on-lime">{agency.name.slice(0, 1).toUpperCase()}</span>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <h1 className="text-[26px] leading-tight font-semibold tracking-tight">{agency.name}</h1>
              {agency.paused && <Badge variant="secondary">Paused</Badge>}
              {leadStatus?.state === 'setup' && <Badge variant="destructive" title={leadStatus.reason}>Needs setup</Badge>}
            </span>
            <span className="text-[13.5px] text-muted-foreground">{lead ? `Lead: ${firstName(lead.name)}` : 'No Lead yet'} · {plural(workers.length, 'worker')} · <span className="font-mono text-xs break-all">{project.folder}</span></span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onNewTask} disabled={!lead || agency.paused}>New task here</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="size-11" aria-label={`More for ${agency.name}`}><Icon name="more" size={16} /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px] rounded-xl p-1.5 shadow-lg">
              <DropdownMenuItem className={menuItem} onSelect={() => setRenaming(true)}><Icon name="file" size={14} /> Rename</DropdownMenuItem>
              <DropdownMenuItem className={menuItem} onSelect={() => void run(() => window.tyslin.agencies.update(agency.id, { paused: !agency.paused }))}>
                <Icon name={agency.paused ? 'play' : 'pause'} size={14} /> {agency.paused ? 'Resume agency' : 'Pause agency'}
              </DropdownMenuItem>
              <DropdownMenuItem className={menuItem} onSelect={() => void window.tyslin.drive.reveal(project.id, '')}><Icon name="folder" size={14} /> Open the folder</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className={cn(menuItem, 'text-destructive focus:text-destructive')} onSelect={() => setConfirm(true)}><Icon name="trash" size={14} /> Delete agency…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {error && <p className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
      {renaming && <RenameDialog name={agency.name} onClose={() => setRenaming(false)} onSave={(name) => run(() => window.tyslin.agencies.update(agency.id, { name })).then(() => setRenaming(false))} />}
      <DeleteDialog open={confirm} onOpenChange={setConfirm} view={view} members={[lead, ...workers].filter((a): a is Agent => !!a).length}
        onDelete={() => run(() => window.tyslin.agencies.remove(agency.id)).then(onDeleted)} />
    </div>
  )
}

function RenameDialog({ name, onClose, onSave }: { name: string; onClose: () => void; onSave: (name: string) => Promise<void> }): JSX.Element {
  const [value, setValue] = useState(name)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[440px] max-w-[calc(100%-32px)] gap-4 rounded-2xl p-6 sm:max-w-[calc(100%-32px)]">
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (value.trim()) void onSave(value.trim()) }}>
          <DialogHeader className="text-left"><DialogTitle>Rename the agency</DialogTitle><DialogDescription className="sr-only">Change the agency's name.</DialogDescription></DialogHeader>
          <div className="flex flex-col gap-1.5"><Label htmlFor="ag-rename">Name</Label><Input id="ag-rename" value={value} maxLength={80} onChange={(e) => setValue(e.target.value)} autoFocus /><span className="text-xs text-muted-foreground">The folder keeps its name.</span></div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!value.trim()}>Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Delete needs the name typed back: the agents, their chats, the Lead's task and the board go; the folder stays. */
function DeleteDialog({ open, onOpenChange, view, members, onDelete }: { open: boolean; onOpenChange: (o: boolean) => void; view: AgencyView; members: number; onDelete: () => Promise<void> }): JSX.Element {
  const [typed, setTyped] = useState('')
  const ok = typed.trim() === view.agency.name
  return (
    <AlertDialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setTyped('') }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {view.agency.name}?</AlertDialogTitle>
          <AlertDialogDescription>Its {plural(members, 'agent')}, their chats, scheduled tasks and the board are removed. The folder and its files stay where they are.</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-1.5"><Label htmlFor="ag-del">Type the name to confirm</Label><Input id="ag-del" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={view.agency.name} autoFocus /></div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" disabled={!ok} onClick={() => void onDelete()}>Delete agency</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
