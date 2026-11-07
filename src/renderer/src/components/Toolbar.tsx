import { useEffect, useRef, useState } from 'react'
import type { Account } from '@shared/types'
import type { Route } from '../App'
import { Icon } from './Icon'
import { ProfileMenu } from './ProfileMenu'
import { cn } from '@/lib/utils'

type IconName = Parameters<typeof Icon>[0]['name']

/** The look of the toolbar's buttons: white with a thin outline when on (as in the agency sidebar). */
const barBtn = (on: boolean): string => cn(
  'inline-flex h-[34px] items-center gap-2 rounded-md border border-transparent px-3 text-[13.5px] text-muted-foreground outline-none transition-colors',
  'hover:bg-card hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40',
  on && 'border-border bg-card font-medium text-foreground shadow-xs'
)
const menuItem = 'flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-foreground outline-none hover:bg-muted focus-visible:bg-muted'

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
    <nav className="tw flex h-11 flex-none items-center justify-between gap-3 border-b border-border bg-panel px-3 text-foreground" aria-label="Main">
      <div className="flex items-center gap-1">
        {items.map(([label, icon, to, on]) => (
          <button key={label} type="button" className={barBtn(on)} aria-current={on ? 'page' : undefined} onClick={() => onNavigate(to)}>
            <Icon name={icon} size={16} /> {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <div className="relative" ref={ref}>
          <button type="button" className={cn(barBtn(help), 'w-9 justify-center px-0')} aria-label="Help" title="Help" aria-haspopup="menu" aria-expanded={help} onClick={() => setHelp((h) => !h)}>
            <Icon name="help" size={17} />
          </button>
          {help && (
            <div className="absolute top-[calc(100%+6px)] right-0 z-30 flex min-w-[230px] flex-col gap-0.5 rounded-xl border border-border bg-popover p-1.5 shadow-lg" role="menu" aria-label="Help">
              <a role="menuitem" className={menuItem} href={DOCS} target="_blank" rel="noreferrer" onClick={() => setHelp(false)}><Icon name="file" size={14} /> Guides on tyslin.ai</a>
              <a role="menuitem" className={menuItem} href={ISSUES} target="_blank" rel="noreferrer" onClick={() => setHelp(false)}><Icon name="github" size={14} /> Report a problem</a>
              <span className="mx-1.5 my-1 h-px bg-border" aria-hidden="true" />
              <button type="button" role="menuitem" className={menuItem} onClick={() => { setHelp(false); onNavigate({ name: 'settings', tab: 'about' }) }}><Icon name="idea" size={14} /> About Tyslin Studio</button>
            </div>
          )}
        </div>
        <ProfileMenu account={account} canSignOut={canSignOut} onProfile={onProfile} onSignOut={onSignOut} />
      </div>
    </nav>
  )
}
