import { useEffect, useRef, useState } from 'react'
import type { Project } from '@shared/types'
import type { Route } from '../App'
import { useAgencyTabs, useCurrentProject } from '../currentProject'
import { Icon } from './Icon'
import { OrgSwitcher } from './OrgSwitcher'
import { getDefaultProjectIdSafe } from './titleCrumbs'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const menuItem = 'flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-foreground outline-none hover:bg-muted focus-visible:bg-muted'
const focusRing = 'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40'

/** Workspace bar, under the toolbar: the organization, then its open agencies as tabs (+ opens or creates one). */
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
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent): void => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false) }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [menu])
  const tabProjects = tabs.map((id) => projects.find((p) => p.id === id)).filter((p): p is Project => !!p)
  const closed = projects.filter((p) => p.id !== defaultId && !tabs.includes(p.id)).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="tw flex h-11 min-w-0 flex-none items-center gap-1.5 border-b border-border bg-background px-3 text-foreground [&_.org-btn]:h-[30px] [&_.org-btn]:rounded-md [&_.org-btn]:px-2.5 [&_.org-btn]:text-[13px]" role="navigation" aria-label="Workspace">
      <OrgSwitcher onNewOrg={onNewOrg} />
      <span className="mx-0.5 flex-none text-base text-border-strong" aria-hidden="true">/</span>
      <div className="flex min-w-0 items-center gap-1 px-0.5 [-webkit-app-region:no-drag]" role="tablist" aria-label="Open agencies">
        {tabProjects.map((p) => {
          const on = p.id === current
          return (
            <div key={p.id} className={cn('flex h-8 max-w-[220px] flex-none items-center rounded-md border border-transparent transition-colors hover:border-border hover:bg-card', on && 'border-border-strong bg-card shadow-xs')}>
              <button type="button" role="tab" aria-selected={on} className={cn('inline-flex h-[30px] min-w-0 items-center gap-1.5 rounded-md pr-1 pl-2.5 text-[13px] text-muted-foreground', focusRing, on && 'font-semibold text-foreground')} onClick={() => onSelectAgency(p.id)} title={p.name}>
                <Icon name="agency" size={13} /><span className="truncate">{p.name}</span>
                {(unread[p.id] ?? 0) > 0 && <Badge variant="lime" className="ml-0.5 h-[18px] min-w-[18px] px-1 font-mono text-[10.5px]" aria-label={`${unread[p.id]} unread from the Lead`}>{unread[p.id]}</Badge>}
              </button>
              <button type="button" className={cn('mr-[3px] grid size-6 flex-none place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground', focusRing)} aria-label={`Close ${p.name}`} onClick={() => onCloseAgency(p.id)}><Icon name="close" size={11} /></button>
            </div>
          )
        })}
        <div className="relative flex-none" ref={menuRef}>
          <button type="button" className={cn('relative grid size-8 place-items-center rounded-md border border-dashed border-border-strong text-foreground hover:bg-card', focusRing)} aria-label={closed.some((p) => unread[p.id]) ? 'Open an agency (unread messages)' : 'Open an agency'} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><Icon name="plus" size={13} />{closed.some((p) => unread[p.id]) && <span className="absolute top-[3px] right-[3px] size-2 rounded-full bg-lime ring-2 ring-background" aria-hidden="true" />}</button>
          {menu && (
            <div className="absolute top-[calc(100%+6px)] left-0 z-30 flex max-h-[60vh] w-[260px] min-w-[240px] flex-col gap-0.5 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-lg" role="menu" aria-label="Open an agency">
              {closed.length > 0 && <span className="px-2.5 pt-1.5 pb-1 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">Open an agency</span>}
              {closed.map((p) => (
                <button key={p.id} type="button" role="menuitem" className={menuItem} onClick={() => { setMenu(false); onSelectAgency(p.id) }}>
                  <Icon name="agency" size={14} /><span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {(unread[p.id] ?? 0) > 0 && <Badge variant="lime" className="ml-auto h-5 min-w-5 px-1.5 font-mono">{unread[p.id]}</Badge>}
                </button>
              ))}
              {closed.length > 0 && <span className="mx-1.5 my-1 h-px bg-border" aria-hidden="true" />}
              <button type="button" role="menuitem" className={menuItem} onClick={() => { setMenu(false); onNavigate({ name: 'agencies' }) }}><Icon name="grid" size={14} /> All agencies</button>
              <button type="button" role="menuitem" className={menuItem} onClick={() => { setMenu(false); onNewAgency() }}><Icon name="plus" size={14} /> New agency</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
