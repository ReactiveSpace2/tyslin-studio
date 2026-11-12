import { useEffect, useState } from 'react'
import type { Account, Organization, OrgColor } from '@shared/types'
import { ORG_COLORS } from '@shared/types'
import { refreshAppearance } from '../appearance'
import { Icon, type IconName } from '../components/Icon'
import { ColorSwatches } from '../components/ColorSwatches'
import { NewOrgModal } from '../components/NewOrgModal'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SidebarMenuButton } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

const DOCS = 'https://tyslin.ai'
const ISSUES = 'https://github.com/ReactiveSpace2/tyslin-studio/issues'
const item = 'min-h-10 cursor-pointer gap-2.5 rounded-md px-2.5 [&_svg:not([class*=\'size-\'])]:size-3.5'

interface Props {
  account: Account | null
  canSignOut: boolean
  /** Places that moved off the sidebar into this menu (blueprint: Agencies, Skills, Files, Scheduled). */
  links?: { name: string; icon: IconName; go: () => void }[]
  onSettings: () => void
  onSignOut: () => void
}

/**
 * The menu at the foot of the left column: who is signed in, the organizations (switch, new, rename or
 * recolour), Agencies, Skills, Files and Scheduled, Settings, help, feedback and Sign out. Switching or creating an organization reloads the window,
 * as every screen reads the current organization's database.
 */
export function UserMenu({ account, canSignOut, links = [], onSettings, onSignOut }: Props): JSX.Element {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [open, setOpen] = useState(false)
  const [newOrg, setNewOrg] = useState(false)
  const [editOrg, setEditOrg] = useState(false)
  const load = (): void => { void window.tyslin.orgs.list().then(setOrgs) }
  useEffect(load, [])
  const current = orgs.find((o) => o.current) ?? null
  const name = account?.name || 'You'
  const initial = name.slice(0, 1).toUpperCase()

  const switchOrg = async (id: string): Promise<void> => {
    if (id === current?.id) return
    try {
      await window.tyslin.orgs.switch(id)
      window.location.reload()
    } catch (e) {
      window.alert(e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
    }
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={(o) => { setOpen(o); if (o) load() }}>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton size="lg" className="no-drag data-[state=open]:bg-sidebar-accent" aria-label="Your menu: settings, organizations, sign out">
            <span className="grid size-8 flex-none place-items-center rounded-lg text-xs font-bold text-on-lime" style={{ background: ORG_COLORS[current?.color ?? 'lime'].fill }}>{initial}</span>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-sm font-medium">{name}</span>
              <span className="truncate text-xs text-muted-foreground">{current?.name ?? ''}</span>
            </span>
            <Icon name="updown" size={14} className="text-muted-foreground" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={8} className="flex w-[260px] flex-col gap-0.5 rounded-xl border-border p-1.5 shadow-lg">
          <DropdownMenuLabel className="flex flex-col gap-0.5 px-2.5 py-2">
            <span className="text-sm font-semibold">{name}</span>
            {account?.email && <span className="text-xs font-normal text-muted-foreground">{account.email}</span>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="mx-0.5" />
          <DropdownMenuLabel className="px-2.5 py-1 text-[11px] font-semibold text-muted-foreground uppercase">Organization</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={current?.id ?? ''} onValueChange={(id) => void switchOrg(id)}>
            {orgs.map((o) => (
              <DropdownMenuRadioItem key={o.id} value={o.id} className={cn(item, 'pl-2.5 [&>span:first-child]:hidden')}>
                <span className="size-3.5 flex-none rounded-[4px]" style={{ background: ORG_COLORS[o.color].fill }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{o.name}</span>
                {o.current && <Icon name="check" size={13} className="text-muted-foreground" />}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuItem className={item} onSelect={() => setNewOrg(true)}><Icon name="plus" size={14} /> New organization…</DropdownMenuItem>
          {current && <DropdownMenuItem className={item} onSelect={() => setEditOrg(true)}><Icon name="art" size={14} /> Rename or recolour {current.name}</DropdownMenuItem>}
          <DropdownMenuSeparator className="mx-0.5" />
          {links.map((l) => <DropdownMenuItem key={l.name} className={item} onSelect={l.go}><Icon name={l.icon} size={14} /> {l.name}</DropdownMenuItem>)}
          {links.length > 0 && <DropdownMenuSeparator className="mx-0.5" />}
          <DropdownMenuItem className={item} onSelect={onSettings}><Icon name="settings" size={14} /> Settings</DropdownMenuItem>
          <DropdownMenuItem asChild className={item}><a href={DOCS} target="_blank" rel="noreferrer"><Icon name="help" size={14} /> Help and docs</a></DropdownMenuItem>
          <DropdownMenuItem asChild className={item}><a href={ISSUES} target="_blank" rel="noreferrer"><Icon name="github" size={14} /> Send feedback on GitHub</a></DropdownMenuItem>
          {canSignOut && (
            <>
              <DropdownMenuSeparator className="mx-0.5" />
              <DropdownMenuItem className={item} onSelect={onSignOut}><Icon name="back" size={14} /> Sign out</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {newOrg && <NewOrgModal onClose={() => setNewOrg(false)} />}
      {editOrg && current && <EditOrgDialog org={current} onClose={() => { setEditOrg(false); load() }} />}
    </>
  )
}

/** Rename the current organization or change its colour (the colour feeds the "organization" accent preset). */
function EditOrgDialog({ org, onClose }: { org: Organization; onClose: () => void }): JSX.Element {
  const [name, setName] = useState(org.name)
  const [color, setColor] = useState<OrgColor>(org.color)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async (): Promise<void> => {
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      if (name.trim() !== org.name) await window.tyslin.orgs.rename(org.id, name.trim())
      if (color !== org.color) await window.tyslin.orgs.setColor(org.id, color)
      await refreshAppearance()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[440px] max-w-[calc(100%-32px)] gap-4 rounded-2xl p-6 sm:max-w-[calc(100%-32px)]">
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save() }}>
          <DialogHeader className="text-left">
            <DialogTitle>Rename or recolour</DialogTitle>
            <DialogDescription className="sr-only">Change the organization's name or colour.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eo-name">Name</Label>
            <Input id="eo-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="mb-2 text-[13px] font-semibold">Colour</legend>
            <ColorSwatches value={color} onChange={setColor} name="edit-org-color" />
          </fieldset>
          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!name.trim() || busy}>{busy ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
