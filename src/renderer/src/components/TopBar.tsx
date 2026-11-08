import { useEffect, useState } from 'react'
import { useCurrentProject } from '../currentProject'
import type { Agent, Project } from '@shared/types'
import type { Route } from '../App'
import { getDefaultProjectIdSafe } from './titleCrumbs'
import { Icon } from './Icon'
import { Avatar } from './Avatar'
import { ProfileMenu } from './ProfileMenu'
import type { AgencyView } from '../agencies'
import type { Account } from '@shared/types'
import logo from '../assets/logo-horizontal.png'
import mark from '../assets/logo-mark.png'
import wordmarkWhite from '../assets/wordmark-white.png'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const DOCS = 'https://tyslin.ai'
const ISSUES = 'https://github.com/ReactiveSpace2/tyslin-studio/issues'
const menuItem = 'min-h-10 cursor-pointer gap-2.5 rounded-md px-2.5 text-foreground focus:bg-muted [&_svg:not([class*=\'size-\'])]:size-3.5'

interface Props {
  route: Route
  agents: Agent[]
  projects: Project[]
  agencies: AgencyView[]
  mac: boolean
  account: Account | null
  canSignOut: boolean
  onNavigate: (r: Route) => void
  onOpenAgency: (projectId: string) => void
  onOpenChat: (agentId: string, projectId: string | null) => void
  onNewAgency: () => void
  onProfile: () => void
  onSignOut: () => void
}

const TITLES: Partial<Record<Route['name'], string>> = {
  home: 'Home', agencies: 'Agencies', skills: 'Skills', settings: 'Settings', kanban: 'Kanban', drive: 'Drive', connectors: 'Channel', integrations: 'Integrations', memory: 'Memory'
}

interface Crumb { label: string; to?: Route }

/** The screen's title, with the screens above it as a path: Agencies › Support › Edit. */
function crumbsFor(route: Route, agents: Agent[], projects: Project[], agencyId: string | null, defaultId: string | null): Crumb[] {
  const agencies: Crumb = { label: 'Agencies', to: { name: 'agencies' } }
  const agency = (id: string | null): Crumb[] => {
    const p = !id || id === defaultId ? null : projects.find((x) => x.id === id)
    return p ? [agencies, { label: p.name, to: { name: 'agency', id: p.id, tab: 'org' } }] : []
  }
  switch (route.name) {
    case 'newAgency': return [agencies, { label: 'New agency' }]
    case 'agency': {
      const p = projects.find((x) => x.id === route.id)
      return route.tab === 'org'
        ? [agencies, { label: p?.name ?? 'Agency' }]
        : [agencies, { label: p?.name ?? 'Agency', to: { name: 'agency', id: route.id, tab: 'org' } }, { label: route.tab === 'edit' ? 'Edit' : 'Inbox' }]
    }
    case 'kanban': return agencyId ? [...agency(agencyId), { label: 'Board' }] : [{ label: 'Kanban' }]
    case 'editor': {
      const a = agents.find((x) => x.id === route.agentId)
      if (!a) return [agencies, { label: 'Agent' }]
      const up = agency(a.projectId)
      return up.length ? [...up, { label: a.name }] : [agencies, { label: a.name }]
    }
    case 'chat': {
      const a = agents.find((x) => x.id === route.agentId)
      const up = agency(route.projectId)
      return [...up, { label: a?.name ?? 'Chat' }]
    }
    default: return [{ label: TITLES[route.name] ?? '' }]
  }
}

const pill = (on: boolean): string => cn(
  'no-drag inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
  on ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
)

const navBtn = (on: boolean): string => cn(
  'no-drag inline-flex h-8 items-center gap-2 rounded-md px-3 text-[13.5px] outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
  on ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
)
const cmdItem = 'min-h-9 cursor-pointer gap-2.5 rounded-md px-2 text-sm'

/**
 * The window's top bar (the owner's design "A", 8 Nov 2026): the Tyslin logo (Home) and Home / Agencies / Settings at
 * the left; search (shadcn Command dialog, Ctrl/Cmd+K), Help and the profile at the right. It is the window's drag area;
 * on Windows and Linux the system draws the window buttons over its right end (`TITLEBAR_HEIGHT` = 48 in main/index.ts),
 * on macOS the traffic lights sit at its left. The screen's path is the window title.
 */
export function TopBar({ route, agents, projects, agencies, mac, account, canSignOut, onNavigate, onOpenAgency, onOpenChat, onNewAgency, onProfile, onSignOut }: Props): JSX.Element {
  const [current] = useCurrentProject()
  const [defaultId, setDefaultId] = useState<string | null>(null)
  useEffect(() => { void getDefaultProjectIdSafe().then(setDefaultId) }, [projects.length])
  const agencyId = current && current !== defaultId ? current : null
  const title = crumbsFor(route, agents, projects, agencyId, defaultId).map((c) => c.label).filter(Boolean).join(' › ')
  useEffect(() => { document.title = title ? `${title} · Tyslin Studio` : 'Tyslin Studio — run your own AI agency' }, [title])
  const [help, setHelp] = useState(false)
  const [search, setSearch] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) { e.preventDefault(); setSearch((o) => !o) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const go = (fn: () => void): void => { setSearch(false); fn() }
  const inAgencies = !['home', 'settings'].includes(route.name)
  const people = agencies.flatMap((v) => [v.lead, ...v.workers].filter((a): a is Agent => !!a).map((a) => ({ a, v })))

  return (
    <header className={cn('drag-region flex h-12 flex-none items-center gap-3 border-b border-border bg-background text-foreground', mac ? 'pr-3 pl-[84px]' : 'pr-[150px] pl-3')}>
      <button type="button" onClick={() => onNavigate({ name: 'home' })} aria-label="Tyslin Studio, Home"
        className="no-drag inline-flex h-9 items-center rounded-md px-1.5 outline-none hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/40">
        <img src={logo} alt="" className="h-[26px] w-auto dark:hidden" />
        <span className="hidden items-center gap-2 dark:flex"><img src={mark} alt="" className="size-[26px]" /><img src={wordmarkWhite} alt="" className="h-3.5 w-auto" /></span>
      </button>
      <Separator orientation="vertical" className="h-5" />
      <nav aria-label="Main" className="flex items-center gap-0.5">
        <button type="button" className={navBtn(route.name === 'home')} aria-current={route.name === 'home' ? 'page' : undefined} onClick={() => onNavigate({ name: 'home' })}><Icon name="home" size={15} /> Home</button>
        <button type="button" className={navBtn(inAgencies)} aria-current={inAgencies ? 'page' : undefined} onClick={() => onNavigate({ name: 'agencies' })}><Icon name="agency" size={15} /> Agencies</button>
        <button type="button" className={navBtn(route.name === 'settings')} aria-current={route.name === 'settings' ? 'page' : undefined} onClick={() => onNavigate({ name: 'settings' })}><Icon name="settings" size={15} /> Settings</button>
      </nav>
      <span className="flex-1" />
      <Button variant="outline" size="sm" className="no-drag w-[260px] justify-between font-normal text-muted-foreground" onClick={() => setSearch(true)}>
        <span className="inline-flex items-center gap-2"><Icon name="search" size={14} /> Search agencies, agents…</span>
        <kbd className="rounded border border-border bg-muted px-1.5 font-mono text-[11px] text-muted-foreground">{mac ? '⌘K' : 'Ctrl K'}</kbd>
      </Button>
      <DropdownMenu open={help} onOpenChange={setHelp}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="no-drag size-8 text-muted-foreground" aria-label="Help" title="Help"><Icon name="help" size={17} /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="flex min-w-[230px] flex-col gap-0.5 rounded-xl border-border p-1.5 shadow-lg" aria-label="Help">
          <DropdownMenuItem asChild className={menuItem}><a href={DOCS} target="_blank" rel="noreferrer"><Icon name="file" size={14} /> Guides on tyslin.ai</a></DropdownMenuItem>
          <DropdownMenuItem asChild className={menuItem}><a href={ISSUES} target="_blank" rel="noreferrer"><Icon name="github" size={14} /> Report a problem</a></DropdownMenuItem>
          <DropdownMenuSeparator className="mx-0.5" />
          <DropdownMenuItem className={menuItem} onSelect={() => onNavigate({ name: 'settings', tab: 'about' })}><Icon name="idea" size={14} /> About Tyslin Studio</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProfileMenu account={account} canSignOut={canSignOut} onProfile={onProfile} onSignOut={onSignOut} />

      <CommandDialog open={search} onOpenChange={setSearch} title="Search" description="Find a page, an agency or an agent">
        <CommandInput placeholder="Search agencies, agents and pages…" />
        <CommandList className="max-h-[420px]">
          <CommandEmpty>Nothing matches.</CommandEmpty>
          <CommandGroup heading="Go to">
            <CommandItem className={cmdItem} value="home" onSelect={() => go(() => onNavigate({ name: 'home' }))}><Icon name="home" size={14} /> Home</CommandItem>
            <CommandItem className={cmdItem} value="all agencies" onSelect={() => go(() => onNavigate({ name: 'agencies' }))}><Icon name="grid" size={14} /> All agencies</CommandItem>
            <CommandItem className={cmdItem} value="new agency" onSelect={() => go(onNewAgency)}><Icon name="plus" size={14} /> New agency</CommandItem>
            <CommandItem className={cmdItem} value="settings" onSelect={() => go(() => onNavigate({ name: 'settings' }))}><Icon name="settings" size={14} /> Settings</CommandItem>
          </CommandGroup>
          {agencies.length > 0 && (
            <CommandGroup heading="Agencies">
              {agencies.map((v) => (
                <CommandItem key={v.project.id} className={cmdItem} value={`agency ${v.project.name} ${v.project.id}`} onSelect={() => go(() => onOpenAgency(v.project.id))}>
                  {v.lead ? <Avatar shape={v.lead.shape} tone={v.lead.tone} head={v.lead.head} size={20} /> : <Icon name="agency" size={14} />}
                  {v.project.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {people.length > 0 && (
            <CommandGroup heading="Agents">
              {people.map(({ a, v }) => (
                <CommandItem key={a.id} className={cmdItem} value={`agent ${a.name} ${v.project.name} ${a.id}`} onSelect={() => go(() => onOpenChat(a.id, v.project.id))}>
                  <Avatar shape={a.shape} tone={a.tone} head={a.head} size={20} />
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  <span className="text-xs text-muted-foreground">{v.project.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </header>
  )
}
