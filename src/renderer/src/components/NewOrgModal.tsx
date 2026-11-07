import { useState } from 'react'
import { ORG_COLORS, type OrgColor } from '@shared/types'
import { ColorSwatches } from './ColorSwatches'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Names a new organization, creates it and moves into it (the window reloads). */
export function NewOrgModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [name, setName] = useState('')
  const [color, setColor] = useState<OrgColor>('teal')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async (): Promise<void> => {
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const org = await window.tyslin.orgs.create(name.trim(), color)
      await window.tyslin.orgs.switch(org.id)
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[440px] max-w-[calc(100%-32px)] gap-4 rounded-2xl p-6 sm:max-w-[calc(100%-32px)]">
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void create() }}>
          <DialogHeader className="text-left">
            <DialogTitle>New organization</DialogTitle>
            <DialogDescription className="sr-only">Name a new organization and pick its colour.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="no-name">Name</Label>
            <Input id="no-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme" autoFocus />
            <span className="text-xs text-muted-foreground">
              An organization has its own agencies, agents, chats and skills, kept apart from your other organizations.
              Your sign-in, API keys and theme are shared.
            </span>
          </div>
          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="mb-2 text-[13px] font-semibold">Colour</legend>
            <ColorSwatches value={color} onChange={setColor} name="new-org-color" />
            <span className="text-xs text-muted-foreground">Marks the organization in the switcher, so you can tell them apart. {ORG_COLORS[color].label} selected.</span>
          </fieldset>
          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!name.trim() || busy}>{busy ? 'Creating…' : 'Create organization'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
