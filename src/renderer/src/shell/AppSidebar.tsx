import type { Account, Agent, Session } from '@shared/types'
import type { Route } from '../App'
import type { AgencyView } from '../agencies'
import { Icon, type IconName } from '../components/Icon'
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

const RECENT = 8

/**
 * The chats worth listing as tasks: not a worker's card run (cards.ts titles them "Card: …"; they show inside
 * the Lead's task), and not a chat nothing was sent in, unless it is the one open now.
 */
export const listedTask = (s: Session, openId?: string | null): boolean =>
  !s.title.startsWith('Card: ') && (s.messageCount > 0 || s.id === openId)

/**
 * The left column, the same on every screen (shadcn sidebar-07, collapses to icons): the logo (the first
 * window drag area), New task / Search / Agencies / Scheduled / Files, the most recent tasks with what
 * needs you, and the user menu at the foot.
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
  const agencyAgents = new Set(agencies.flatMap((v) => [v.lead, ...v.workers].filter((a): a is Agent => !!a).map((a) => a.id)))
  const openTask = route.name === 'task' ? route.sessionId : null
  const recent = [...sessions].filter((s) => agencyAgents.has(s.agentId) && listedTask(s, openTask)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, RECENT)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className={cn('drag-region h-12 flex-none flex-row items-center justify-between gap-1 p-0 pr-2', mac ? 'pl-[84px]' : 'pl-3', 'group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:pr-0 group-data-[collapsible=icon]:pl-0')}>
        <button type="button" onClick={() => onNavigate({ name: 'home' })} aria-label="Tyslin Studio, Home"
          className="no-drag inline-flex h-9 w-fit items-center rounded-md px-1.5 outline-none hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:px-1">
          <img src={logo} alt="" className="h-[24px] w-auto group-data-[collapsible=icon]:hidden dark:hidden" />
          <img src={mark} alt="" className="hidden size-6 group-data-[collapsible=icon]:block" />
          <span className="hidden items-center gap-2 group-data-[collapsible=icon]:hidden dark:flex"><img src={mark} alt="" className="size-6" /><img src={wordmarkWhite} alt="" className="h-3 w-auto" /></span>
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
        <SidebarGroup className="pt-0">
          <SidebarGroupLabel>Recents</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {recent.length === 0 && <li className="px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">No tasks yet.</li>}
              {recent.map((s) => {
                const a = agents.find((x) => x.id === s.agentId)
                const need = needsYouBySession[s.id] ?? 0
                const running = runningIds.has(s.id)
                const title = s.title || 'New task'
                return (
                  <SidebarMenuItem key={s.id}>
                    <SidebarMenuButton isActive={openTask === s.id} tooltip={title} onClick={() => onNavigate({ name: 'task', sessionId: s.id, agentId: s.agentId })} className="h-9 pr-9" title={a ? `${title} · ${a.name}` : title}>
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
              {sessions.length > 0 && (
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={onSearch} className="h-8 text-xs text-muted-foreground" tooltip="All tasks">
                    <Icon name="list" size={14} />
                    <span>All tasks</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu account={account} canSignOut={canSignOut} onSettings={onSettings} onSignOut={onSignOut} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
