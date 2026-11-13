import { useState } from 'react'
import { AGENCY_ADAPTERS, AGENCY_TEMPLATES, templateAdapters } from '@shared/agencies'
import { ENGINE_NAMES } from '@shared/engines'
import type { AgencyUpdateInput, LeadModel } from '@shared/types'
import type { AgencyView } from '../agencies'
import { firstName } from '../boardStats'
import { getDefaultModel } from '../defaultModel'
import { LeadModelField, WorkersRunOn } from './RunsOnFields'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
const KEEP = 'keep'

/** Edit agency: its name, the adapter every worker runs on, and the Lead's model. Only what changed is saved. */
export function EditAgencyDialog({ view, onClose, onSaved }: { view: AgencyView; onClose: () => void; onSaved: () => void }): JSX.Element {
  const { agency, lead, workers } = view
  const dm = getDefaultModel()
  const onDefault = !lead || (!!dm && lead.provider === dm.provider && lead.model === dm.model)
  const before: LeadModel | null = onDefault || !lead?.provider ? null : { provider: lead.provider, model: lead.model }
  const [name, setName] = useState(agency.name)
  const [adapter, setAdapter] = useState(KEEP)
  const [leadModel, setLeadModel] = useState<LeadModel | null>(before)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const tpl = AGENCY_TEMPLATES.find((t) => t.id === agency.templateId)
  const now = [...new Set(workers.map((w) => ENGINE_NAMES[w.engine as keyof typeof ENGINE_NAMES] ?? 'Built-in model'))].join(', ')
  const options = [
    { id: KEEP, name: 'Keep as they are', sub: now || 'no workers yet' },
    ...AGENCY_ADAPTERS.map((a) => ({ id: a.id as string, name: a.name as string, sub: `every worker · by ${a.by}` })),
    ...(tpl ? [{ id: 'template', name: "Template's mix", sub: templateAdapters(tpl).map((id) => ENGINE_NAMES[id]).join(', ') || 'each worker on its own adapter' }] : [])
  ]
  const sameModel = (leadModel?.provider ?? null) === (before?.provider ?? null) && (leadModel?.model.trim() ?? '') === (before?.model ?? '')

  const save = async (): Promise<void> => {
    const input: AgencyUpdateInput = {}
    if (name.trim() !== agency.name) input.name = name.trim()
    if (adapter !== KEEP) input.adapter = adapter
    if (lead && !sameModel) {
      // Back to "the default model" means the Lead takes the default's provider and model again.
      const to = leadModel ?? (dm ? { provider: dm.provider, model: dm.model } : null)
      if (to) input.leadModel = { provider: to.provider, model: to.model.trim() }
    }
    if (!Object.keys(input).length) { onClose(); return }
    setBusy(true); setError('')
    try { await window.tyslin.agencies.update(agency.id, input); onSaved() } catch (e) { setError(errorText(e)); setBusy(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[calc(100%-48px)] w-[620px] max-w-[calc(100%-32px)] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[calc(100%-32px)]">
        <DialogHeader className="px-6 pt-6 pb-2 text-left">
          <DialogTitle className="text-xl">Edit {agency.name}</DialogTitle>
          <DialogDescription>The name, what the workers run on and the Lead's model. The goal and rules are on the Goals tab; each agent has its own page.</DialogDescription>
        </DialogHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); void save() }}>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ea-name">Name</Label>
              <Input id="ea-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
              <span className="text-xs text-muted-foreground">The folder keeps its name.</span>
            </div>
            {workers.length > 0 && <WorkersRunOn idPrefix="ea" value={adapter} onChange={setAdapter} options={options} />}
            {lead && (
              <div className="flex flex-col gap-1.5">
                <LeadModelField idPrefix="ea" value={leadModel} onChange={setLeadModel} />
                <span className="text-xs text-muted-foreground">{firstName(lead.name)} is the Lead. A change applies from the next run.</span>
              </div>
            )}
            {error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
          </div>
          <DialogFooter className="border-t border-border px-6 py-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy || !name.trim() || (!!leadModel && !leadModel.model.trim())}>{busy ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
