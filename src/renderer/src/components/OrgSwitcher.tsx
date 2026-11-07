import { useEffect, useState, type CSSProperties } from 'react'
import { ORG_COLORS, type Organization } from '@shared/types'
import { Icon } from './Icon'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const tileBase = 'grid flex-none place-items-center font-bold'
const menuItem = 'min-h-10 cursor-pointer gap-2.5 rounded-md px-2.5 text-sm text-foreground focus:bg-muted [&_svg:not([class*=\'size-\'])]:size-3.5'

const initial = (name: string): string => name.trim().slice(0, 1).toUpperCase() || '?'
/** Each organization's own colour, whatever the accent setting (ink text on every fill). */
const tile = (o?: Organization): CSSProperties => ({ background: ORG_COLORS[o?.color ?? 'lime'].fill, color: '#0F0F0D' })

/**
 * Organization switcher (in the title bar, after the screen name). The menu opens downward. Switching
 * reopens the app inside the other organization, so every screen starts fresh.
 */
export function OrgSwitcher({ onNewOrg }: { onNewOrg: () => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = (): void => { void window.tyslin.orgs.list().then(setOrgs) }
    load()
    window.addEventListener('tyslin:orgs-changed', load)
    return () => window.removeEventListener('tyslin:orgs-changed', load)
  }, [])

  const current = orgs.find((o) => o.current)
  const name = current?.name ?? 'Tyslin'

  const switchTo = async (o: Organization): Promise<void> => {
    setOpen(false)
    if (o.current) return
    try {
      await window.tyslin.orgs.switch(o.id)
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
      setTimeout(() => setError(null), 4000)
    }
  }

  return (
    <div className="relative no-drag">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button type="button" className="inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-2.5 text-[13px] font-semibold whitespace-nowrap text-foreground outline-none hover:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=open]:bg-card [&_svg]:text-muted-foreground"
            aria-label={`Organization: ${name}. Switch organization`}>
            <span className={cn(tileBase, 'size-4 rounded-[4px] text-[10px]')} aria-hidden="true" style={tile(current)}>{initial(name)}</span>
            {name}
            <Icon name="updown" size={12} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={6} className="flex max-h-[60vh] w-[260px] flex-col gap-0.5 rounded-xl border-border bg-card p-1.5 shadow-lg" aria-label="Organizations">
          <DropdownMenuLabel className="px-2.5 pt-1.5 pb-1 font-mono text-[11px] font-normal tracking-[0.08em] text-muted-foreground uppercase">Organizations</DropdownMenuLabel>
          {orgs.map((o) => (
            <DropdownMenuItem key={o.id} role="menuitemradio" aria-checked={o.current} className={menuItem} onSelect={() => void switchTo(o)}>
              <span className={cn(tileBase, 'size-[22px] rounded-md text-[11px]')} aria-hidden="true" style={tile(o)}>{initial(o.name)}</span>
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              {o.current && <Icon name="check" size={14} />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator className="mx-1.5" />
          <DropdownMenuItem className={menuItem} onSelect={() => onNewOrg()}>
            <Icon name="plus" size={14} /> New organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && <span className="absolute top-[calc(100%+6px)] left-0 z-30 w-[280px] rounded-[10px] border border-destructive bg-destructive-soft px-3 py-2.5 text-[13px] text-destructive" role="alert">{error}</span>}
    </div>
  )
}
