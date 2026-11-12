import { useState } from 'react'
import type { Agent, Session } from '@shared/types'
import type { AgencyView } from '../agencies'
import { firstName } from '../boardStats'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { PAGE_ICON, shownPages } from '../agency/pages'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

/** The right panel; `page:<id>` is one of the agency's pages (agency/pages). */
export type Pane = 'agent' | 'details' | 'changes' | 'preview' | '' | `page:${string}`
const menuItem = 'min-h-10 cursor-pointer gap-2.5 rounded-md px-2.5'

interface Props {
  session: Session | null
  agent: Agent
  view: AgencyView | null
  running: boolean
  pane: Pane
  pendingChanges: number
  onPane: (p: Pane) => void
  onRenamed: () => void
  onOpenAgency: () => void
  onTalkTo: (agent: Agent) => void
  onDeleted: () => void
}

/** The task's title as a menu (rename, open the agency or folder, talk to one agent, delete) and the panel switches. */
export function TaskHeader({ session, agent, view, running, pane, pendingChanges, onPane, onRenamed, onOpenAgency, onTalkTo, onDeleted }: Props): JSX.Element {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const title = session?.title || 'New task'
  const others = view ? [view.lead, ...view.workers].filter((a): a is Agent => !!a && a.id !== agent.id) : []
  const rename = async (): Promise<void> => {
    if (!session || renaming === null) return
    const t = renaming.trim()
    setRenaming(null)
    if (t && t !== session.title) { await window.tyslin.sessions.rename(session.id, t); onRenamed() }
  }
  const remove = async (): Promise<void> => { if (session) { await window.tyslin.sessions.remove(session.id); onDeleted() } }
  const toggle = 'h-9 w-11 rounded-md text-muted-foreground hover:text-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground'

  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {renaming !== null ? (
          <form className="flex min-w-0 flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); void rename() }}>
            <Input autoFocus value={renaming} onChange={(e) => setRenaming(e.target.value)} onBlur={() => void rename()} onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(null) }} className="h-8 max-w-[420px]" aria-label="Task name" maxLength={80} />
          </form>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 min-w-0 max-w-[520px] shrink gap-1.5 px-2 text-[15px] font-medium" aria-label={`${title}: task menu`}>
                <span className="truncate">{title}</span><Icon name="arrowDown" size={12} className="flex-none text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={6} className="min-w-[240px] rounded-xl p-1.5 shadow-lg">
              <DropdownMenuItem className={menuItem} disabled={!session} onSelect={() => setRenaming(title)}><Icon name="file" size={14} /> Rename</DropdownMenuItem>
              {view && <DropdownMenuItem className={menuItem} onSelect={onOpenAgency}><Icon name="agency" size={14} /> Open {view.agency.name}</DropdownMenuItem>}
              {view && <DropdownMenuItem className={menuItem} onSelect={() => void window.tyslin.drive.reveal(view.project.id, '')}><Icon name="folder" size={14} /> Open the folder</DropdownMenuItem>}
              {others.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className={menuItem}><Icon name="agents" size={14} /> Talk to one agent</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="rounded-xl p-1.5 shadow-lg">
                    {others.map((a) => (
                      <DropdownMenuItem key={a.id} className={menuItem} onSelect={() => onTalkTo(a)}>
                        <Avatar shape={a.shape} tone={a.tone} head={a.head} size={18} /> {firstName(a.name)}{a.id === view?.lead?.id ? ' (Lead)' : ''}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className={cn(menuItem, 'text-destructive focus:text-destructive')} disabled={!session} onSelect={() => setConfirmDelete(true)}><Icon name="trash" size={14} /> Delete task</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {/* The name pill (blueprint): the agent's head and name; opens its panel. */}
        <Button variant="outline" aria-pressed={pane === 'agent'} onClick={() => onPane(pane === 'agent' ? '' : 'agent')}
          className={cn('h-8 flex-none gap-2 rounded-full pr-3 pl-1 text-[13px] font-medium', pane === 'agent' && 'bg-accent')} aria-label={`${agent.name}: open the agent panel`}>
          <Avatar shape={agent.shape} tone={agent.tone} head={agent.head} size={22} />
          {firstName(agent.name)}
          {running && <span className="size-2 animate-blink rounded-full bg-green" aria-label="Working" />}
        </Button>
      </div>
      <ToggleGroup type="single" spacing={1} value={pane} onValueChange={(v) => onPane((v || '') as Pane)} aria-label="Panels">
        <ToggleGroupItem value="details" className={toggle} aria-label="Details" title="Details"><Icon name="list" size={17} /></ToggleGroupItem>
        <ToggleGroupItem value="changes" className={cn(toggle, 'relative')} aria-label={pendingChanges ? `Changes, ${pendingChanges} to review` : 'Changes'} title="Changes">
          <Icon name="file" size={17} />
          {pendingChanges > 0 && <span className="absolute top-1 right-1.5 size-2 rounded-full bg-lime" aria-hidden="true" />}
        </ToggleGroupItem>
        {view && <ToggleGroupItem value="preview" className={toggle} aria-label="Preview" title="Preview"><Icon name="eye" size={17} /></ToggleGroupItem>}
        {shownPages(view).map((p) => <ToggleGroupItem key={p.id} value={`page:${p.id}`} className={toggle} aria-label={p.title} title={p.title}><Icon name={PAGE_ICON[p.kind]} size={17} /></ToggleGroupItem>)}
      </ToggleGroup>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
            <AlertDialogDescription>The conversation and any changes still waiting for review are deleted. Files already accepted stay in the folder.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => void remove()}>Delete task</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
