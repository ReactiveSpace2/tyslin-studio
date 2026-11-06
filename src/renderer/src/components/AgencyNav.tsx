import type { Route } from '../App'
import { Icon } from './Icon'

type IconName = Parameters<typeof Icon>[0]['name']

/** Inside an agency tab: the sidebar with its own Overview, Lead chat, Kanban, Channel, Skills, Drive and Edit. */
export function AgencyNav({ agencyId, name, unread, route, onNavigate }: {
  agencyId: string
  name: string
  /** Unread Lead messages in this agency: shown on Lead chat. */
  unread: number
  route: Route
  onNavigate: (r: Route) => void
}): JSX.Element {
  const items: [string, IconName, Route, boolean][] = [
    ['Overview', 'agency', { name: 'agency', id: agencyId, tab: 'org' }, route.name === 'agency' && route.tab === 'org'],
    ['Lead chat', 'chat', { name: 'agency', id: agencyId, tab: 'chat' }, route.name === 'agency' && route.tab === 'chat'],
    ['Kanban', 'kanban', { name: 'kanban' }, route.name === 'kanban'],
    ['Channel', 'channel', { name: 'connectors' }, route.name === 'connectors'],
    ['Skills', 'skills', { name: 'skills' }, route.name === 'skills'],
    ['Drive', 'drive', { name: 'drive' }, route.name === 'drive'],
    ['Edit', 'settings', { name: 'agency', id: agencyId, tab: 'edit' }, route.name === 'agency' && route.tab === 'edit']
  ]
  return (
    <nav className="agency-side" aria-label={`${name} sections`}>
      <span className="agency-side-cap">Agency</span>
      <span className="agency-side-name"><Icon name="agency" size={15} /><strong>{name}</strong></span>
      {items.map(([label, icon, to, on]) => (
        <button key={label} type="button" className={'agency-side-item' + (on ? ' on' : '') + (label === 'Edit' ? ' foot' : '')} aria-current={on ? 'page' : undefined} onClick={() => onNavigate(to)}>
          <Icon name={icon} size={16} /> {label}
          {label === 'Lead chat' && unread > 0 && <span className="tab-count mono" aria-label={`${unread} unread`}>{unread}</span>}
        </button>
      ))}
    </nav>
  )
}
