import type { Route } from '../App'
import { Icon } from './Icon'

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
  return (
    <nav className="agency-side" aria-label={`${name} sections`}>
      <span className="agency-side-cap">Agency</span>
      <span className="agency-side-name"><Icon name="agency" size={15} /><strong>{name}</strong></span>
      {items.map(([label, icon, to, on]) => (
        <button key={label} type="button" className={'agency-side-item' + (on ? ' on' : '') + (label === 'Memory' ? ' foot' : '')} aria-current={on ? 'page' : undefined} onClick={() => onNavigate(to)}>
          <Icon name={icon} size={16} /> {label}
          {label === 'Chat' && unread > 0 && <span className="tab-count mono" aria-label={`${unread} unread`}>{unread}</span>}
        </button>
      ))}
    </nav>
  )
}
