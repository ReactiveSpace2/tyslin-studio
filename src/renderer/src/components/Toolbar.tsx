import { useEffect, useRef, useState } from 'react'
import type { Account } from '@shared/types'
import type { Route } from '../App'
import { Icon } from './Icon'
import { ProfileMenu } from './ProfileMenu'

type IconName = Parameters<typeof Icon>[0]['name']

const DOCS = 'https://tyslin.ai'
const ISSUES = 'https://github.com/ReactiveSpace2/tyslin-studio/issues'

/** Toolbar under the title bar: Home, Agencies and Settings at the left; Help and your profile at the right. Lead messages live in each agency's Inbox. */
export function Toolbar({ route, onNavigate, account, canSignOut, onProfile, onSignOut }: {
  route: Route
  onNavigate: (r: Route) => void
  account: Account | null
  canSignOut: boolean
  onProfile: () => void
  onSignOut: () => void
}): JSX.Element {
  const inAgencies = ['agencies', 'agency', 'newAgency', 'kanban', 'drive', 'connectors', 'skills'].includes(route.name)
  const items: [string, IconName, Route, boolean][] = [
    ['Home', 'home', { name: 'home' }, route.name === 'home'],
    ['Agencies', 'agency', { name: 'agencies' }, inAgencies],
    ['Settings', 'settings', { name: 'settings' }, route.name === 'settings']
  ]
  const [help, setHelp] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!help) return
    const onDown = (e: MouseEvent): void => { if (!ref.current?.contains(e.target as Node)) setHelp(false) }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setHelp(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [help])

  return (
    <nav className="toolbar" aria-label="Main">
      <div className="toolbar-left">
        {items.map(([label, icon, to, on]) => (
          <button key={label} type="button" className={'toolbar-btn' + (on ? ' on' : '')} aria-current={on ? 'page' : undefined} onClick={() => onNavigate(to)}>
            <Icon name={icon} size={16} /> {label}
          </button>
        ))}
      </div>
      <div className="toolbar-right">
        <div className="help" ref={ref}>
          <button type="button" className="toolbar-btn icon-only" aria-label="Help" title="Help" aria-haspopup="menu" aria-expanded={help} onClick={() => setHelp((h) => !h)}>
            <Icon name="help" size={17} />
          </button>
          {help && (
            <div className="switch-menu help-menu" role="menu" aria-label="Help">
              <a role="menuitem" href={DOCS} target="_blank" rel="noreferrer" onClick={() => setHelp(false)}><Icon name="file" size={14} /> Guides on tyslin.ai</a>
              <a role="menuitem" href={ISSUES} target="_blank" rel="noreferrer" onClick={() => setHelp(false)}><Icon name="github" size={14} /> Report a problem</a>
              <span className="switch-sep" aria-hidden="true" />
              <button type="button" role="menuitem" onClick={() => { setHelp(false); onNavigate({ name: 'settings', tab: 'about' }) }}><Icon name="idea" size={14} /> About Tyslin Studio</button>
            </div>
          )}
        </div>
        <ProfileMenu account={account} canSignOut={canSignOut} onProfile={onProfile} onSignOut={onSignOut} />
      </div>
    </nav>
  )
}
