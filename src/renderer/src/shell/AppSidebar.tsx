import { useState } from 'react'
import type { Account, Agent, Session } from '@shared/types'
import type { Route } from '../App'
import type { AgencyView } from '../agencies'
import { Avatar } from '../components/Avatar'
import { Icon, type IconName } from '../components/Icon'
import { WorkingRing } from '../components/Working'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { StarCard } from './StarCard'
import { UserMenu } from './UserMenu'
import logo from '../assets/logo-horizontal.png'
import mark from '../assets/logo-mark.png'
import wordmarkWhite from '../assets/wordmark-white.png'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface Props {
  route: Route
  mac: boolean
  agencies: AgencyView[]
  agents: Agent[]
  sessions: Session[]
  runningIds: Set<string>
  needsYouBySession: Record<string, number>
  account: Account | null
  canSignOut: boolean
  onNavigate: (r: Route) => void
  onSearch: () => void
  onSettings: () => void
  onSignOut: () => void
}

/** Recent tasks per agency in the sidebar (owner, 12 Nov 2026: grouped by agency, no "All tasks" row; Search lists the rest). */
const RECENT_PER_AGENCY = 4
/** Agency groups the user closed, kept per computer. */
const CLOSED_KEY = 'tyslin:sidebar:closed'
const readClosed = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '[]') as string[]) } catch { return new Set() } }

/**
 * The chats worth listing as tasks: not a worker's card run (cards.ts titles them "Card: …"; they show inside
 * the Lead's task), and not a chat nothing was sent in, unless it is the one open now.
 */
export const listedTask = (s: Session, openId?: string | null): boolean =>
  !s.title.startsWith('Card: ') && (s.messageCount > 0 || s.id === openId)

/**
 * The left column, the same on every screen (shadcn sidebar-07, collapses to icons): the logo (the first
 * window drag area), New task / Search / Agencies / Scheduled / Files, recent tasks grouped by agency with what
 * needs you, and the user menu at the foot. Older tasks are found through Search.
 */
export function AppSidebar({ route, mac, agencies, agents, sessions, runningIds, needsYouBySession, account, canSignOut, onNavigate, onSearch, onSettings, onSignOut }: Props): JSX.Element {
  // New task goes Home and puts the cursor in the box (Home's Composer renders it as #composer). There is no Home
  // item (owner, 10 Nov 2026): the logo and New task both lead there, so New task is shown as current on Home.
  const newTask = (): void => {
    onNavigate({ name: 'home' })
    window.setTimeout(() => (document.getElementById('composer') as HTMLTextAreaElement | null)?.focus(), 50)
  }
  // Search sits in the logo row (owner, 10 Nov 2026); in the menu only while the sidebar is collapsed to icons.
  const main: { name: string; icon: IconName; on: boolean; go: () => void; collapsedOnly?: boolean }[] = [
    { name: 'New task', icon: 'plus', on: route.name === 'home', go: newTask },
    { name: 'Search', icon: 'search', on: false, go: onSearch, collapsedOnly: true },
    { name: 'Agencies', icon: 'agency', on: route.name === 'agencies' || route.name === 'agency' || route.name === 'agent', go: () => onNavigate({ name: 'agencies' }) },
    { name: 'Scheduled', icon: 'clock', on: route.name === 'scheduled', go: () => onNavigate({ name: 'scheduled' }) },
    { name: 'Files', icon: 'folder', on: route.name === 'files', go: () => onNavigate({ name: 'files' }) }
  ]
  // Tasks are chats with an agency's agents; the newest first.
  const openTask = route.name === 'task' ? route.sessionId : null
  const [closed, setClosed] = useState<Set<string>>(readClosed)
  const toggleGroup = (id: string, open: boolean): void => {
    setClosed((prev) => { const next = new Set(prev); if (open) next.delete(id); else next.add(id); try { localStorage.setItem(CLOSED_KEY, JSON.stringify([...next])) } catch { /* per-window only */ } return next })
  }
  // One group per agency with recent tasks, the agency with the newest task first; a title that starts with the
  // agency's name ("Web Design: Plan…") drops it, since the group says it.
  const groups = agencies.map((v) => {
    const ids = new Set([v.lead, ...v.workers].filter((a): a is Agent => !!a).map((a) => a.id))
    const tasks = sessions.filter((s) => ids.has(s.agentId) && listedTask(s, openTask)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, RECENT_PER_AGENCY)
    return { view: v, tasks }
  }).filter((g) => g.tasks.length > 0).sort((a, b) => b.tasks[0].updatedAt - a.tasks[0].updatedAt)
  const shortTitle = (title: string, agencyName: string): string => {
    const t = title || 'New task'
    const prefix = new RegExp(`^${agencyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s*[:·-]\s*`, 'i')
    return t.replace(prefix, '') || t
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className={cn('drag-region h-12 flex-none flex-row items-center justify-between gap-1 p-0 pr-2', mac ? 'pl-[84px]' : 'pl-3', 'group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:pr-0 group-data-[collapsible=icon]:pl-0')}>
        <button type="button" onClick={() => onNavigate({ name: 'home' })} aria-label="Tyslin Studio, Home"
          className="no-drag inline-flex h-11 w-fit items-center rounded-md px-1.5 outline-none hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:px-1">
          <img src={logo} alt="" className="h-8 w-auto group-data-[collapsible=icon]:hidden dark:hidden" />
          <img src={mark} alt="" className="hidden size-7 group-data-[collapsible=icon]:block" />
          <span className="hidden items-center gap-2 group-data-[collapsible=icon]:hidden dark:flex"><img src={mark} alt="" className="size-8" /><img src={wordmarkWhite} alt="" className="h-4 w-auto" /></span>
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={onSearch} aria-label={mac ? "Search (Cmd+K)" : "Search (Ctrl+K)"}
              className="no-drag inline-flex size-10 flex-none items-center justify-center rounded-md text-sidebar-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 group-data-[collapsible=icon]:hidden">
              <Icon name="search" size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Search · {mac ? '⌘K' : 'Ctrl+K'}</TooltipContent>
        </Tooltip>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {main.map((m) => (
                <SidebarMenuItem key={m.name} className={cn(m.collapsedOnly && 'hidden group-data-[collapsible=icon]:block')}>
                  <SidebarMenuButton isActive={m.on} tooltip={m.name} onClick={m.go} className="h-9 text-[14px]" aria-current={m.on ? 'page' : undefined}>
                    <Icon name={m.icon} size={16} />
                    <span>{m.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {groups.length === 0 && (
          <SidebarGroup className="pt-0">
            <SidebarGroupLabel>Recent tasks</SidebarGroupLabel>
            <SidebarGroupContent><p className="px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">No tasks yet.</p></SidebarGroupContent>
          </SidebarGroup>
        )}
        {/* Agencies and their tasks sit a little apart from the menu above (owner, 12 Nov 2026). */}
        <div className="mt-3 flex flex-col gap-1 border-t border-sidebar-border pt-3 group-data-[collapsible=icon]:mt-1 group-data-[collapsible=icon]:gap-0.5 group-data-[collapsible=icon]:pt-1">
        {groups.map(({ view, tasks }) => {
          const lead = view.lead
          // The group stays open while its task is the one on screen, so the current task never hides.
          const open = !closed.has(view.agency.id) || tasks.some((s) => s.id === openTask)
          const needs = tasks.reduce((n, s) => n + (needsYouBySession[s.id] ?? 0), 0)
          // Any run in the agency (a task or a worker's card chat) puts the travelling arc round the Lead's head.
          const members = new Set([view.lead, ...view.workers].filter((a): a is Agent => !!a).map((a) => a.id))
          const working = sessions.some((s) => runningIds.has(s.id) && members.has(s.agentId))
          return (
            <Collapsible key={view.agency.id} open={open} onOpenChange={(o) => toggleGroup(view.agency.id, o)} className="group/agency">
              <SidebarGroup className="pt-0 group-data-[collapsible=icon]:p-0">
                {/* Collapsed to icons: one button per agency with the Lead's head, opening its newest task (owner, 12 Nov 2026). */}
                <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive={tasks.some((s) => s.id === openTask)} tooltip={lead ? `${view.agency.name} · ${lead.name}` : view.agency.name} onClick={() => onNavigate({ name: 'task', sessionId: tasks[0].id, agentId: tasks[0].agentId })} className="h-9 justify-center" aria-label={`${view.agency.name}: open its newest task`}>
                      <WorkingRing size={24} on={working}>{lead ? <Avatar shape={lead.shape} tone={lead.tone} head={lead.head} size={24} /> : <span className="grid size-6 flex-none place-items-center rounded-full bg-muted text-[10px] font-bold">{view.agency.name.slice(0, 1)}</span>}</WorkingRing>
                    </SidebarMenuButton>
                    {needs > 0 && <SidebarMenuBadge className="top-0 right-0 size-2 min-w-0 rounded-full bg-lime p-0" aria-label={`${needs} need you`} />}
                  </SidebarMenuItem>
                </SidebarMenu>
                <SidebarGroupLabel asChild className="group-data-[collapsible=icon]:hidden">
                  <CollapsibleTrigger className="h-9 w-full cursor-pointer gap-2 pl-1.5 text-[13px] text-sidebar-foreground hover:bg-sidebar-accent" aria-label={`${view.agency.name}${working ? ', working' : ''}: ${open ? 'hide' : 'show'} its tasks`}>
                    <WorkingRing size={22} on={working}>{lead ? <Avatar shape={lead.shape} tone={lead.tone} head={lead.head} size={22} /> : <span className="grid size-[22px] flex-none place-items-center rounded-full bg-muted text-[10px] font-bold">{view.agency.name.slice(0, 1)}</span>}</WorkingRing>
                    <span className="min-w-0 flex-1 truncate text-left font-medium" title={lead ? `${view.agency.name} · ${lead.name}` : view.agency.name}>{view.agency.name}</span>
                    {!open && needs > 0 && <span className="rounded-md bg-lime px-1.5 font-mono text-[11px] text-on-lime" aria-label={`${needs} need you`}>{needs}</span>}
                    <Icon name="chevronDown" size={13} className="flex-none text-muted-foreground transition-transform group-data-[state=closed]/agency:-rotate-90 motion-reduce:transition-none" />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent className="group-data-[collapsible=icon]:hidden">
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {tasks.map((s) => {
                        const a = agents.find((x) => x.id === s.agentId)
                        const need = needsYouBySession[s.id] ?? 0
                        const running = runningIds.has(s.id)
                        const title = shortTitle(s.title, view.agency.name)
                        return (
                          <SidebarMenuItem key={s.id}>
                            <SidebarMenuButton isActive={openTask === s.id} tooltip={title} onClick={() => onNavigate({ name: 'task', sessionId: s.id, agentId: s.agentId })} className="h-9 pr-9 pl-3" title={a ? `${s.title || 'New task'} · ${a.name}` : s.title || 'New task'}>
                              <Icon name="chat" size={15} className="text-muted-foreground" />
                              <span>{title}</span>
                            </SidebarMenuButton>
                            {need > 0 ? (
                              <SidebarMenuBadge className="rounded-md bg-lime px-1.5 font-mono text-[11px] text-on-lime" aria-label={`${need} need you`}>{need}</SidebarMenuBadge>
                            ) : running ? (
                              <SidebarMenuBadge aria-label="Running"><span className="size-2 animate-blink rounded-full bg-green" /></SidebarMenuBadge>
                            ) : null}
                          </SidebarMenuItem>
                        )
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          )
        })}
        </div>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <StarCard />
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu account={account} canSignOut={canSignOut} onSettings={onSettings} onSignOut={onSignOut} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
