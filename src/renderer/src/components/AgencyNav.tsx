import type { Route } from '../App'
import { Icon } from './Icon'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from '@/components/ui/sidebar'

type IconName = Parameters<typeof Icon>[0]['name']

/** Inside an agency tab: the sidebar with its own Overview, Chat (the Lead chat and the Inbox as two tabs), Kanban, Channel, Skills, Integrations, Drive, and at the foot Memory and Edit. */
export function AgencyNav({ agencyId, name, leadId, unread, route, onNavigate }: {
  agencyId: string
  name: string
  /** The agency's Lead: Chat opens a chat with it in the agency's folder. */
  leadId: string | null
  /** Unread Lead messages in this agency: shown on Chat (its Inbox tab). */
  unread: number
  route: Route
  onNavigate: (r: Route) => void
}): JSX.Element {
  const items: [string, IconName, Route, boolean][] = [
    ['Overview', 'agency', { name: 'agency', id: agencyId, tab: 'org' }, route.name === 'agency' && route.tab === 'org'],
    // Chat: the Lead chat and the Inbox, as two tabs of one screen (AgencyChatTabs).
    ['Chat', 'chat', leadId ? { name: 'chat', agentId: leadId, projectId: agencyId } : { name: 'agency', id: agencyId, tab: 'chat' },
      (route.name === 'chat' && route.agentId === leadId) || (route.name === 'agency' && route.tab === 'chat')],
    ['Kanban', 'kanban', { name: 'kanban' }, route.name === 'kanban'],
    ['Channel', 'channel', { name: 'connectors' }, route.name === 'connectors'],
    ['Skills', 'skills', { name: 'skills' }, route.name === 'skills'],
    ['Integrations', 'connectors', { name: 'integrations' }, route.name === 'integrations'],
    ['Drive', 'drive', { name: 'drive' }, route.name === 'drive'],
    ['Memory', 'knowledge', { name: 'memory' }, route.name === 'memory'],
    ['Edit', 'settings', { name: 'agency', id: agencyId, tab: 'edit' }, route.name === 'agency' && route.tab === 'edit']
  ]
  const item = ([label, icon, to, on]: (typeof items)[number]): JSX.Element => {
    const badge = label === 'Chat' && unread > 0
    return (
      <SidebarMenuItem key={label}>
        <SidebarMenuButton type="button" isActive={on} aria-current={on ? 'page' : undefined} onClick={() => onNavigate(to)}
          className={cn(
            'h-10 gap-2.5 border border-transparent px-2.5 text-muted-foreground transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
            'hover:bg-accent hover:text-foreground data-[active=true]:border-border data-[active=true]:bg-card data-[active=true]:text-foreground data-[active=true]:shadow-xs data-[active=true]:hover:bg-card',
            badge && 'pr-10'
          )}>
          <Icon name={icon} size={16} /><span className="min-w-0 flex-1 truncate">{label}</span>
        </SidebarMenuButton>
        {badge && (
          <SidebarMenuBadge className="right-2 peer-data-[size=default]/menu-button:top-2.5 px-0">
            <Badge variant="lime" className="h-5 min-w-5 px-1.5 font-mono" aria-label={`${unread} unread`}>{unread}</Badge>
          </SidebarMenuBadge>
        )}
      </SidebarMenuItem>
    )
  }
  return (
    <SidebarProvider className="min-h-0 w-auto flex-none" style={{ '--sidebar-width': '232px' } as React.CSSProperties}>
      <Sidebar collapsible="none" role="navigation" aria-label={`${name} sections`} className="gap-4 overflow-y-auto bg-sidebar p-3 text-foreground">
        <SidebarHeader className="gap-1.5 p-0">
          <SidebarGroupLabel className="h-auto px-2.5 text-xs font-medium text-muted-foreground">Agency</SidebarGroupLabel>
          <span className="flex h-10 min-w-0 items-center gap-2.5 rounded-md border border-border bg-card px-2.5 shadow-xs">
            <span className="inline-flex size-[22px] flex-none items-center justify-center rounded-sm bg-lime text-on-lime"><Icon name="agency" size={13} /></span>
            <strong className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</strong>
          </span>
        </SidebarHeader>
        <SidebarContent className="gap-0">
          <SidebarGroup className="p-0">
            <SidebarMenu className="gap-0.5">{items.slice(0, 7).map(item)}</SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="gap-0.5 border-t border-border p-0 pt-2.5">
          <SidebarMenu className="gap-0.5">{items.slice(7).map(item)}</SidebarMenu>
        </SidebarFooter>
      </Sidebar>
    </SidebarProvider>
  )
}
