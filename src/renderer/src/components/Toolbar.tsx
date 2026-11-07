import { useState } from 'react'
import type { Account } from '@shared/types'
import type { Route } from '../App'
import { Icon } from './Icon'
import { ProfileMenu } from './ProfileMenu'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

type IconName = Parameters<typeof Icon>[0]['name']

/** The look of the toolbar's buttons: white with a thin outline when on (as in the agency sidebar). */
const barBtn = (on: boolean): string => cn(
  'inline-flex h-[34px] items-center gap-2 rounded-md border border-transparent px-3 text-[13.5px] text-muted-foreground outline-none transition-colors',
  'hover:bg-card hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40',
  on && 'border-border bg-card font-medium text-foreground shadow-xs'
)
const menuItem = 'min-h-10 cursor-pointer gap-2.5 rounded-md px-2.5 text-foreground focus:bg-muted [&_svg:not([class*=\'size-\'])]:size-3.5'

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

  return (
    <nav className="flex h-11 flex-none items-center justify-between gap-3 border-b border-border bg-panel px-3 text-foreground" aria-label="Main">
      <div className="flex items-center gap-1">
        {items.map(([label, icon, to, on]) => (
          <button key={label} type="button" className={barBtn(on)} aria-current={on ? 'page' : undefined} onClick={() => onNavigate(to)}>
            <Icon name={icon} size={16} /> {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <DropdownMenu open={help} onOpenChange={setHelp}>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn(barBtn(help), 'w-9 justify-center px-0')} aria-label="Help" title="Help">
              <Icon name="help" size={17} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="flex min-w-[230px] flex-col gap-0.5 rounded-xl border-border p-1.5 shadow-lg" aria-label="Help">
            <DropdownMenuItem asChild className={menuItem}><a href={DOCS} target="_blank" rel="noreferrer"><Icon name="file" size={14} /> Guides on tyslin.ai</a></DropdownMenuItem>
            <DropdownMenuItem asChild className={menuItem}><a href={ISSUES} target="_blank" rel="noreferrer"><Icon name="github" size={14} /> Report a problem</a></DropdownMenuItem>
            <DropdownMenuSeparator className="mx-0.5" />
            <DropdownMenuItem className={menuItem} onSelect={() => onNavigate({ name: 'settings', tab: 'about' })}><Icon name="idea" size={14} /> About Tyslin Studio</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ProfileMenu account={account} canSignOut={canSignOut} onProfile={onProfile} onSignOut={onSignOut} />
      </div>
    </nav>
  )
}
