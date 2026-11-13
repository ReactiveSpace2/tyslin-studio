import { useEffect, useState } from 'react'
import type { LeadModel, ProviderSettings } from '@shared/types'
import { DefaultModelPicker } from '../components/ModelSetup'
import { modelLabel, useDefaultModel } from '../defaultModel'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const HINT = 'text-xs leading-normal text-muted-foreground'

export interface AdapterOption { id: string; name: string; sub: string }

/** Which adapter the agency's workers run on: one radio card per choice (New agency and Edit agency). */
export function WorkersRunOn({ idPrefix, value, onChange, options }: { idPrefix: string; value: string; onChange: (id: string) => void; options: AdapterOption[] }): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <span id={`${idPrefix}-ad-label`} className="text-[13px] font-medium">Workers run on</span>
      <RadioGroup value={value} onValueChange={onChange} aria-labelledby={`${idPrefix}-ad-label`} className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <Label key={o.id} htmlFor={`${idPrefix}-ad-${o.id}`} className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 font-normal', value === o.id ? 'border-primary ring-1 ring-primary' : 'border-border')}>
            <RadioGroupItem id={`${idPrefix}-ad-${o.id}`} value={o.id} />
            <span className="flex min-w-0 flex-col"><strong className="text-[13.5px] font-semibold">{o.name}</strong><span className="truncate text-xs text-muted-foreground">{o.sub}</span></span>
          </Label>
        ))}
      </RadioGroup>
      <span className={HINT}>Each adapter uses its own model and your key or account (Settings → Accounts and connectors). You can change one worker on its page.</span>
    </div>
  )
}

/** The Lead's model for one agency: the default model (null), or a provider and model picked here. */
export function LeadModelField({ idPrefix, value, onChange }: { idPrefix: string; value: LeadModel | null; onChange: (v: LeadModel | null) => void }): JSX.Element {
  const dm = useDefaultModel()
  const [settings, setSettings] = useState<ProviderSettings | null>(null)
  useEffect(() => { void window.tyslin.settings.get().then(setSettings).catch(() => undefined) }, [])
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${idPrefix}-lead-model`} className="text-[13px] font-medium">The Lead's model</Label>
      <Select value={value ? 'own' : 'default'} onValueChange={(v) => onChange(v === 'own' ? { provider: dm?.provider ?? 'anthropic', model: dm?.model ?? '' } : null)}>
        <SelectTrigger id={`${idPrefix}-lead-model`} className="w-full bg-card"><SelectValue /></SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="default">The default model{dm ? ` (${modelLabel(dm)})` : ''}</SelectItem>
          <SelectItem value="own">Another model for this agency</SelectItem>
        </SelectContent>
      </Select>
      {value
        ? <DefaultModelPicker settings={settings} value={value} onChange={onChange} idPrefix={`${idPrefix}-lm`} />
        : <span className={HINT}>The Lead plans the work and talks to you. It follows the default model from Settings → Models.</span>}
    </div>
  )
}
