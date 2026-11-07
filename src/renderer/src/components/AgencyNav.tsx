import type { Route } from '../App'
import { Icon } from './Icon'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

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
  const item = ([label, icon, to, on]: (typeof items)[number]): JSX.Element => (
    <button key={label} type="button" aria-current={on ? 'page' : undefined} onClick={() => onNavigate(to)}
      className={cn(
        'flex min-h-10 w-full items-center gap-2.5 rounded-md border border-transparent px-2.5 text-left text-sm text-muted-foreground outline-none transition-colors',
        'hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40',
        on && 'border-border bg-card font-medium text-foreground shadow-xs hover:bg-card'
      )}>
      <Icon name={icon} size={16} /><span className="min-w-0 flex-1 truncate">{label}</span>
      {label === 'Chat' && unread > 0 && <Badge variant="lime" className="h-5 min-w-5 px-1.5 font-mono" aria-label={`${unread} unread`}>{unread}</Badge>}
    </button>
  )
  return (
    <nav className="tw flex w-[232px] flex-none flex-col gap-4 overflow-y-auto bg-panel p-3 text-foreground" aria-label={`${name} sections`}>
      <div className="flex flex-col gap-1.5">
        <span className="px-2.5 text-xs font-medium text-muted-foreground">Agency</span>
        <span className="flex h-10 min-w-0 items-center gap-2.5 rounded-md border border-border bg-card px-2.5 shadow-xs">
          <span className="inline-flex size-[22px] flex-none items-center justify-center rounded-sm bg-lime text-on-lime"><Icon name="agency" size={13} /></span>
          <strong className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</strong>
        </span>
      </div>
      <div className="flex flex-col gap-0.5">{items.slice(0, 7).map(item)}</div>
      <div className="mt-auto flex flex-col gap-0.5 border-t border-border pt-2.5">{items.slice(7).map(item)}</div>
    </nav>
  )
}
