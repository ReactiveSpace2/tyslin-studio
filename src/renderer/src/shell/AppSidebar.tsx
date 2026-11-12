import { useState } from 'react'
import type { Account, Agent, ChannelMessage, Session } from '@shared/types'
import type { AgencyTab, Route } from '../App'
import type { AgencyView } from '../agencies'
import { firstName } from '../boardStats'
import { Avatar } from '../components/Avatar'
import { Icon, type IconName } from '../components/Icon'
import { UserMenu } from './UserMenu'
import { CreateMenu } from './CreateMenu'
import { ActivityPopover, type Waiting } from './ActivityPopover'
import { shortTime } from './time'
import logo from '../assets/logo-horizontal.png'
import mark from '../assets/logo-mark.png'
import wordmarkWhite from '../assets/wordmark-white.png'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupAction, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
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
  channelMessages: ChannelMessage[]
  waiting: Waiting
  activeAgency: string | null
  account: Account | null
  canSignOut: boolean
  onNavigate: (r: Route) => void
  /** An agent's newest chat, or a new one. */
  onOpenAgent: (agent: Agent) => void
  onOpenTask: (sessionId: string, agentId: string, focus?: string) => void
  onOpenAgency: (id: string, tab: AgencyTab) => void
  onNewTask: (agencyId?: string) => void
  onNewAgency: () => void
  onSearch: () => void
  onSettings: () => void
  onSignOut: () => void
}

/**
 * The chats worth listing as tasks: not a worker's card run (cards.ts titles them "Card: …"; they show inside
 * the Lead's task), and not a chat nothing was sent in, unless it is the one open now.
 */
export const listedTask = (s: Session, openId?: string | null): boolean =>
  !s.title.startsWith('Card: ') && (s.messageCount > 0 || s.id === openId)

const COLLAPSED_KEY = 'tyslin:sidebar:closed'
const readClosed = (): string[] => { try { return JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[] } catch { return [] } }
const writeClosed = (ids: string[]): void => { try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(ids)) } catch { /* private window: not remembered */ } }
const headerButton = 'no-drag inline-flex size-9 flex-none items-center justify-center rounded-md text-sidebar-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=open]:bg-sidebar-accent'
const menuItem = 'min-h-10 cursor-pointer gap-2.5 rounded-md px-2.5'

/**
 * The left column (blueprint shell; shadcn sidebar-07, collapses to icons). Header: the logo (the first window drag
 * area), Search, Activity and Create. Body: New task, then each agency as a collapsible group: its team chat (the
 * Lead's newest task, with the team's heads stacked) and one row per agent with its newest chat and time. Footer:
 * the Connectors pill and the account menu (Settings, Skills, Files, Scheduled, organizations).
 */
export function AppSidebar(p: Props): JSX.Element {
  const { route, mac, agencies, sessions, runningIds, needsYouBySession, activeAgency, onNavigate } = p
  const [closed, setClosed] = useState<string[]>(readClosed)
  const toggle = (id: string, open: boolean): void => {
    const next = open ? closed.filter((x) => x !== id) : [...closed, id]
    setClosed(next)
    writeClosed(next)
  }
  const openTask = route.name === 'task' ? route.sessionId : null
  const openAgentId = route.name === 'task' ? route.agentId : null
  const chatsOf = (agentId: string): Session[] => sessions.filter((s) => s.agentId === agentId && (s.messageCount > 0 || s.id === openTask)).sort((a, b) => b.updatedAt - a.updatedAt)
  const isNewTask = route.name === 'home'
  const target = agencies.find((v) => v.agency.id === activeAgency) ?? agencies[0] ?? null
  const links: { name: string; icon: IconName; go: () => void }[] = [
    { name: 'Agencies', icon: 'agency', go: () => onNavigate({ name: 'agencies' }) },
    ...(target ? [{ name: 'Skills', icon: 'skills' as IconName, go: () => p.onOpenAgency(target.agency.id, 'skills') }] : []),
    { name: 'Files', icon: 'folder', go: () => onNavigate({ name: 'files' }) },
    { name: 'Scheduled', icon: 'clock', go: () => onNavigate({ name: 'scheduled' }) }
  ]

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className={cn('drag-region h-12 flex-none flex-row items-center justify-between gap-0.5 p-0 pr-1.5', mac ? 'pl-[84px]' : 'pl-3', 'group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:pr-0 group-data-[collapsible=icon]:pl-0')}>
        <button type="button" onClick={() => onNavigate({ name: 'home' })} aria-label="Tyslin Studio, Home"
          className="no-drag mr-auto inline-flex h-11 w-fit min-w-0 items-center rounded-md px-1.5 outline-none hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:px-1">
          <img src={logo} alt="" className={cn('h-8 w-auto group-data-[collapsible=icon]:hidden dark:hidden', mac && 'h-6')} />
          <img src={mark} alt="" className="hidden size-7 group-data-[collapsible=icon]:block" />
          <span className="hidden items-center gap-2 group-data-[collapsible=icon]:hidden dark:flex"><img src={mark} alt="" className="size-7" />{!mac && <img src={wordmarkWhite} alt="" className="h-4 w-auto" />}</span>
        </button>
        <div className="flex items-center gap-0.5 group-data-[collapsible=icon]:hidden">
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={p.onSearch} aria-label={mac ? 'Search (Cmd+K)' : 'Search (Ctrl+K)'} className={headerButton}><Icon name="search" size={16} /></button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Search · {mac ? '⌘K' : 'Ctrl+K'}</TooltipContent>
          </Tooltip>
          <ActivityPopover agencies={agencies} agents={p.agents} sessions={sessions} runningIds={runningIds} channelMessages={p.channelMessages} waiting={p.waiting}
            onOpenTask={p.onOpenTask} onOpenAgency={p.onOpenAgency} className={headerButton} />
          <CreateMenu agencies={agencies} activeAgency={activeAgency} onNewTask={() => p.onNewTask()} onNewAgency={p.onNewAgency} onOpenAgent={p.onOpenAgent}
            onNewAgent={(agencyId) => onNavigate({ name: 'agent', agencyId, agentId: null })} className={headerButton} />
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-0">
        <SidebarGroup className="pb-1">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={isNewTask} tooltip="New task" onClick={() => p.onNewTask()} className="h-9 text-[14px]" aria-current={isNewTask ? 'page' : undefined}>
                  <Icon name="plus" size={16} /><span>New task</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem className="hidden group-data-[collapsible=icon]:block">
                <SidebarMenuButton tooltip="Search" onClick={p.onSearch} className="h-9"><Icon name="search" size={16} /><span>Search</span></SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {agencies.length === 0 && (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <p className="px-2 text-xs leading-snug text-muted-foreground">No agencies yet. Make one with the + above.</p>
          </SidebarGroup>
        )}

        {agencies.map((v) => {
          const team = [v.lead, ...v.workers].filter((a): a is Agent => !!a)
          const open = !closed.includes(v.agency.id)
          const leadChats = v.lead ? chatsOf(v.lead.id).filter((s) => listedTask(s, openTask)) : []
          const squad = leadChats[0] ?? null
          const squadNeeds = leadChats.reduce((n, s) => n + (needsYouBySession[s.id] ?? 0), 0)
          const squadRunning = leadChats.some((s) => runningIds.has(s.id))
          const squadOn = !!v.lead && openAgentId === v.lead.id
          const agencyOn = (route.name === 'agency' && route.id === v.agency.id) || (route.name === 'agent' && route.agencyId === v.agency.id)
          return (
            <Collapsible key={v.agency.id} open={open} onOpenChange={(o) => toggle(v.agency.id, o)} className="group/agency">
              <SidebarGroup className="py-1">
                <SidebarGroupLabel asChild className={cn('h-8 cursor-pointer pr-8 text-[12px] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground', agencyOn && 'text-sidebar-foreground')}>
                  <CollapsibleTrigger>
                    <Icon name="chevronRight" size={12} className="mr-1 flex-none transition-transform group-data-[state=open]/agency:rotate-90" />
                    <span className="min-w-0 flex-1 truncate text-left">{v.agency.name}</span>
                    {v.paused && <span className="ml-1 font-mono text-[10px] text-muted-foreground">Paused</span>}
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarGroupAction className="top-2.5 size-6 w-6 group-data-[collapsible=icon]:hidden" aria-label={`${v.agency.name} actions`}><Icon name="more" size={14} /></SidebarGroupAction>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="start" className="min-w-[220px] rounded-xl p-1.5 shadow-lg">
                    <DropdownMenuItem className={menuItem} onSelect={() => p.onNewTask(v.agency.id)}><Icon name="chat" size={14} /> New task</DropdownMenuItem>
                    <DropdownMenuItem className={menuItem} onSelect={() => onNavigate({ name: 'agent', agencyId: v.agency.id, agentId: null })}><Icon name="agents" size={14} /> New agent</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className={menuItem} onSelect={() => p.onOpenAgency(v.agency.id, 'team')}><Icon name="agency" size={14} /> Open the agency</DropdownMenuItem>
                    <DropdownMenuItem className={menuItem} onSelect={() => p.onOpenAgency(v.agency.id, 'skills')}><Icon name="skills" size={14} /> Skills</DropdownMenuItem>
                    <DropdownMenuItem className={menuItem} onSelect={() => p.onOpenAgency(v.agency.id, 'connectors')}><Icon name="connectors" size={14} /> Connectors</DropdownMenuItem>
                    <DropdownMenuItem className={menuItem} onSelect={() => p.onOpenAgency(v.agency.id, 'schedule')}><Icon name="clock" size={14} /> Schedule</DropdownMenuItem>
                    <DropdownMenuItem className={menuItem} onSelect={() => onNavigate({ name: 'files', agencyId: v.agency.id })}><Icon name="folder" size={14} /> Files</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu className="gap-0.5">
                      {v.lead && (
                        <SidebarMenuItem>
                          <SidebarMenuButton size="lg" isActive={squadOn} tooltip={`${v.agency.name} team`} className="h-14 gap-2.5 pr-2"
                            onClick={() => (squad ? p.onOpenTask(squad.id, v.lead!.id) : p.onNewTask(v.agency.id))}>
                            <Stack agents={team} />
                            <Row name={`Team · ${firstName(v.lead.name)}`} preview={squad?.title || 'Start a task for the team'} at={squad?.updatedAt}
                              needs={squadNeeds} running={squadRunning} />
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      {v.workers.map((a) => {
                        const chats = chatsOf(a.id)
                        const last = chats[0] ?? null
                        const on = openAgentId === a.id
                        return (
                          <SidebarMenuItem key={a.id}>
                            <SidebarMenuButton size="lg" isActive={on} tooltip={a.name} className="h-14 gap-2.5 pr-2" onClick={() => p.onOpenAgent(a)}>
                              <span className="relative flex size-8 flex-none items-center justify-center">
                                <Avatar shape={a.shape} tone={a.tone} head={a.head} size={32} />
                                {a.paused && <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-sidebar bg-muted-foreground" aria-hidden="true" />}
                              </span>
                              <Row name={a.name} preview={last?.title.replace(/^Card: /, '') || a.description || 'No chats yet'} at={last?.updatedAt}
                                needs={chats.reduce((n, s) => n + (needsYouBySession[s.id] ?? 0), 0)} running={chats.some((s) => runningIds.has(s.id))} />
                            </SidebarMenuButton>
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
      </SidebarContent>
      <SidebarFooter className="gap-1.5 border-t border-sidebar-border">
        {target && (
          <button type="button" onClick={() => p.onOpenAgency(target.agency.id, 'connectors')}
            className="no-drag inline-flex h-9 w-fit items-center gap-2 rounded-full border border-sidebar-border bg-background px-3 text-[13px] font-medium outline-none hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 group-data-[collapsible=icon]:hidden">
            <Icon name="connectors" size={14} /> Connectors
          </button>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu account={p.account} canSignOut={p.canSignOut} links={links} onSettings={p.onSettings} onSignOut={p.onSignOut} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

/** Name, newest chat and time for an agent or team row; a lime count when something needs you, a dot while working. */
function Row({ name, preview, at, needs, running }: { name: string; preview: string; at?: number; needs: number; running: boolean }): JSX.Element {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight group-data-[collapsible=icon]:hidden">
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{name}</span>
        {needs > 0 ? (
          <SidebarMenuBadge className="static h-[18px] min-w-[18px] rounded-md bg-lime px-1 font-mono text-[11px] text-on-lime" aria-label={`${needs} need you`}>{needs}</SidebarMenuBadge>
        ) : running ? (
          <span className="size-2 flex-none animate-blink rounded-full bg-green" aria-label="Working" />
        ) : at ? (
          <span className="flex-none font-mono text-[11px] text-muted-foreground">{shortTime(at)}</span>
        ) : null}
      </span>
      <span className="truncate text-[13px] text-muted-foreground">{preview}</span>
    </span>
  )
}

/** The team's heads overlapped (Lead first), with "+n" past three. */
function Stack({ agents }: { agents: Agent[] }): JSX.Element {
  const shown = agents.slice(0, 3)
  const more = agents.length - shown.length
  return (
    <span className="relative flex h-8 w-8 flex-none items-center" aria-hidden="true">
      {shown.map((a, i) => (
        <span key={a.id} className="absolute rounded-full ring-2 ring-sidebar" style={{ left: i * 7, top: i % 2 ? 9 : 0, zIndex: 3 - i }}>
          <Avatar shape={a.shape} tone={a.tone} head={a.head} size={i === 0 ? 24 : 20} />
        </span>
      ))}
      {more > 0 && <span className="absolute -right-1.5 -bottom-1 z-10 rounded-full bg-sidebar-accent px-1 font-mono text-[9px] leading-[14px] text-muted-foreground">+{more}</span>}
    </span>
  )
}
