import { useState } from 'react'
import type { Account } from '@shared/types'
import { Icon } from './Icon'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const menuItem = 'min-h-10 cursor-pointer gap-2.5 rounded-md px-2.5 text-sm text-foreground focus:bg-muted [&_svg:not([class*=\'size-\'])]:size-3.5'

/** Title bar, right: the signed-in person, with Profile (Settings → Account) and Log out. */
export function ProfileMenu({ account, canSignOut, onProfile, onSignOut, variant = 'bar' }: {
  /** 'sidebar': the app sidebar's foot (shadcn nav-user: avatar, name, email). */
  variant?: 'bar' | 'sidebar'
  account: Account | null
  /** Builds without sign-in have no Log out. */
  canSignOut: boolean
  onProfile: () => void
  onSignOut: () => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const name = account?.name || 'You'
  return (
    <div className="relative no-drag">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          {variant === 'sidebar' ? (
            <button type="button" className="flex h-12 w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-md px-2 text-left text-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=open]:bg-sidebar-accent" aria-label={`Profile: ${name}`}>
              <Avatar className="size-8 rounded-lg" aria-hidden="true">
                <AvatarFallback className="rounded-lg bg-lime text-xs font-bold text-on-lime">{name.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <strong className="truncate text-[13px] font-semibold">{name}</strong>
                {account?.email && <span className="truncate text-xs text-muted-foreground">{account.email}</span>}
              </span>
              <Icon name="updown" size={14} />
            </button>
          ) : (
          <button type="button" className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border border-transparent bg-transparent pr-2 pl-1 text-[13px] text-foreground outline-none hover:border-border hover:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=open]:border-border data-[state=open]:bg-card" aria-label={`Profile: ${name}`}>
            <Avatar className="size-[26px]" aria-hidden="true">
              <AvatarFallback className="bg-lime text-xs font-bold text-on-lime">{name.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span>{name.split(' ')[0]}</span>
            <Icon name="updown" size={12} />
          </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side={variant === 'sidebar' ? 'right' : 'bottom'} sideOffset={6} className="flex w-[260px] min-w-[230px] flex-col gap-0.5 rounded-xl border-border bg-card p-1.5 shadow-lg" aria-label="Profile">
          <DropdownMenuLabel className="flex flex-col gap-0.5 px-2.5 py-2 font-normal">
            <strong className="font-semibold">{name}</strong>
            {account?.email && <span className="text-xs text-muted-foreground">{account.email}</span>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="mx-1.5" />
          <DropdownMenuItem className={menuItem} onSelect={() => onProfile()}><Icon name="agents" size={14} /> Profile</DropdownMenuItem>
          {canSignOut && <DropdownMenuItem className={menuItem} onSelect={() => onSignOut()}><Icon name="back" size={14} /> Log out</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
