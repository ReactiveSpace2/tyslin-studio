import { useEffect, useState } from 'react'
import type { Project } from '@shared/types'
import type { Route } from '../App'
import { useAgencyTabs, useCurrentProject } from '../currentProject'
import { Icon } from './Icon'
import { OrgSwitcher } from './OrgSwitcher'
import { getDefaultProjectIdSafe } from './titleCrumbs'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const menuItem = 'min-h-10 cursor-pointer gap-2.5 rounded-md px-2.5 text-foreground focus:bg-muted [&_svg:not([class*=\'size-\'])]:size-3.5'
const focusRing = 'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40'

/** Workspace bar, under the top bar (design A, 8 Nov 2026: underlined tabs): the organization, then its open agencies as tabs (+ opens or creates one). */
export function WorkspaceBar({ projects, unread, onNewOrg, onNavigate, onSelectAgency, onCloseAgency, onNewAgency }: {
  projects: Project[]
  /** Unread Lead messages by project id: shown on each agency's tab. */
  unread: Record<string, number>
  onNewOrg: () => void
  onNavigate: (r: Route) => void
  onSelectAgency: (id: string) => void
  onCloseAgency: (id: string) => void
  onNewAgency: () => void
}): JSX.Element {
  const [current] = useCurrentProject()
  const [defaultId, setDefaultId] = useState<string | null>(null)
  useEffect(() => { void getDefaultProjectIdSafe().then(setDefaultId) }, [projects.length])
  const tabs = useAgencyTabs()
  const [menu, setMenu] = useState(false)
  const tabProjects = tabs.map((id) => projects.find((p) => p.id === id)).filter((p): p is Project => !!p)
  const closed = projects.filter((p) => p.id !== defaultId && !tabs.includes(p.id)).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="flex h-11 min-w-0 flex-none items-stretch gap-1.5 border-b border-border bg-background px-3 text-foreground" role="navigation" aria-label="Workspace">
      <div className="flex items-center"><OrgSwitcher onNewOrg={onNewOrg} /></div>
      <span className="my-auto h-5 w-px flex-none bg-border" aria-hidden="true" />
      <div className="flex min-w-0 items-stretch gap-1 px-0.5 no-drag" role="tablist" aria-label="Open agencies">
        {tabProjects.map((p) => {
          const on = p.id === current
          return (
            <div key={p.id} className={cn('-mb-px flex max-w-[240px] flex-none items-center border-b-2 border-transparent transition-colors hover:border-border-strong', on && 'border-foreground hover:border-foreground')}>
              <button type="button" role="tab" aria-selected={on} className={cn('inline-flex h-8 min-w-0 items-center gap-1.5 rounded-md pr-1 pl-2.5 text-[13.5px] text-muted-foreground hover:text-foreground', focusRing, on && 'font-medium text-foreground')} onClick={() => onSelectAgency(p.id)} title={p.name}>
                <Icon name="agency" size={13} /><span className="truncate">{p.name}</span>
                {(unread[p.id] ?? 0) > 0 && <Badge variant="lime" className="ml-0.5 h-[18px] min-w-[18px] px-1 font-mono text-[10.5px]" aria-label={`${unread[p.id]} unread from the Lead`}>{unread[p.id]}</Badge>}
              </button>
              <button type="button" className={cn('mr-[3px] grid size-6 flex-none place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground', focusRing)} aria-label={`Close ${p.name}`} onClick={() => onCloseAgency(p.id)}><Icon name="close" size={11} /></button>
            </div>
          )
        })}
        <DropdownMenu open={menu} onOpenChange={setMenu}>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn('relative my-auto grid size-8 flex-none place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground', focusRing)} aria-label={closed.some((p) => unread[p.id]) ? 'Open an agency (unread messages)' : 'Open an agency'}><Icon name="plus" size={13} />{closed.some((p) => unread[p.id]) && <span className="absolute top-[3px] right-[3px] size-2 rounded-full bg-lime ring-2 ring-background" aria-hidden="true" />}</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={6} className="flex max-h-[60vh] w-[260px] min-w-[240px] flex-col gap-0.5 rounded-xl border-border p-1.5 shadow-lg" aria-label="Open an agency">
            {closed.length > 0 && <DropdownMenuLabel className="px-2.5 pt-1.5 pb-1 font-mono text-[11px] font-normal tracking-[0.08em] text-muted-foreground uppercase">Open an agency</DropdownMenuLabel>}
            {closed.map((p) => (
              <DropdownMenuItem key={p.id} className={menuItem} onSelect={() => onSelectAgency(p.id)}>
                <Icon name="agency" size={14} /><span className="min-w-0 flex-1 truncate">{p.name}</span>
                {(unread[p.id] ?? 0) > 0 && <Badge variant="lime" className="ml-auto h-5 min-w-5 px-1.5 font-mono">{unread[p.id]}</Badge>}
              </DropdownMenuItem>
            ))}
            {closed.length > 0 && <DropdownMenuSeparator className="mx-0.5" />}
            <DropdownMenuItem className={menuItem} onSelect={() => onNavigate({ name: 'agencies' })}><Icon name="grid" size={14} /> All agencies</DropdownMenuItem>
            <DropdownMenuItem className={menuItem} onSelect={() => onNewAgency()}><Icon name="plus" size={14} /> New agency</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
