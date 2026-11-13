import { useEffect, useState } from 'react'
import { AGENCY_ADAPTERS, AGENCY_GROUPS, AGENCY_TEMPLATES, agentName, templateAdapters, type AgencyTemplate } from '@shared/agencies'
import { ENGINE_NAMES } from '@shared/engines'
import type { LeadModel } from '@shared/types'
import { LeadModelField, WorkersRunOn } from './RunsOnFields'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))

/** One dialog: template, name, folder, goal, which adapter the workers run on and the Lead's model; Create makes the folder, the team and the board. */
export function NewAgencyDialog({ templateId, onClose, onCreated }: { templateId?: string; onClose: () => void; onCreated: (projectId: string) => void }): JSX.Element {
  const first = AGENCY_TEMPLATES.find((t) => t.id === templateId && !t.comingSoon) ?? AGENCY_TEMPLATES.find((t) => !t.comingSoon)!
  const [tpl, setTpl] = useState<AgencyTemplate>(first)
  const [name, setName] = useState(first.name)
  const [touched, setTouched] = useState(false)
  const [folder, setFolder] = useState<string | null>(null)
  const [defaultFolder, setDefaultFolder] = useState('')
  const [goal, setGoal] = useState('')
  const [adapter, setAdapter] = useState<string>('template')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [leadModel, setLeadModel] = useState<LeadModel | null>(null)
  // Agency names are unique (main refuses a second one), so suggest "Web Design 2" when "Web Design" is taken.
  const [taken, setTaken] = useState<Set<string>>(new Set())
  useEffect(() => { void window.tyslin.agencies.list().then((g) => setTaken(new Set(g.map((a) => a.name.trim().toLowerCase())))).catch(() => undefined) }, [])
  const free = (base: string): string => { let n = 1, out = base; while (taken.has(out.toLowerCase())) out = `${base} ${++n}`; return out }
  useEffect(() => { if (!touched) setName((n) => free(n)) }, [taken])
  useEffect(() => { void window.tyslin.projects.newFolderPath(name.trim() || tpl.name).then(setDefaultFolder).catch(() => setDefaultFolder('')) }, [name, tpl.name])
  const pick = (t: AgencyTemplate): void => { if (t.comingSoon) return; setTpl(t); if (!touched) setName(free(t.name)) }
  const pickFolder = async (): Promise<void> => { const f = await window.tyslin.projects.pickFolder(); if (f) setFolder(f) }
  const create = async (): Promise<void> => {
    setBusy(true); setError('')
    try {
      const a = await window.tyslin.agencies.create({ name: name.trim(), templateId: tpl.id, description: '', goal: goal.trim(), prompt: '', adapter, packs: [], autoRun: false, channel: 'none', notify: 'questions', budget: null, folder, leadModel })
      onCreated(a.projectId)
    } catch (e) { setError(errorText(e)); setBusy(false) }
  }
  const mix = templateAdapters(tpl).map((id) => ENGINE_NAMES[id]).join(', ')

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[calc(100%-48px)] w-[680px] max-w-[calc(100%-32px)] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[calc(100%-32px)]">
        <DialogHeader className="px-6 pt-6 pb-2 text-left"><DialogTitle className="text-xl">New agency</DialogTitle><DialogDescription>A Lead and a team in their own folder. Nothing runs until you give them a task.</DialogDescription></DialogHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); void create() }}>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-4">
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium">Template</span>
              {AGENCY_GROUPS.map((g) => {
                const list = AGENCY_TEMPLATES.filter((t) => t.group === g.id)
                if (!list.length) return null
                return (
                  <div key={g.id} className="flex flex-wrap items-center gap-2">
                    <span className="w-full font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">{g.title}</span>
                    {list.map((t) => (
                      <button key={t.id} type="button" disabled={t.comingSoon} onClick={() => pick(t)} aria-pressed={tpl.id === t.id}
                        className={cn('inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-default disabled:opacity-50', tpl.id === t.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-border-strong')}>
                        {t.name}{t.comingSoon && <Badge variant="secondary" className="h-[18px] px-1.5 text-[10.5px]">Soon</Badge>}
                      </button>
                    ))}
                  </div>
                )
              })}
              <span className="text-xs text-muted-foreground">{tpl.tagline}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5"><Label htmlFor="na-name">Name</Label><Input id="na-name" value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setTouched(true) }} /></div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="na-folder">Folder</Label>
                <span className="flex gap-1.5"><Input id="na-folder" readOnly value={folder ?? defaultFolder} className="font-mono text-xs" /><Button type="button" variant="outline" size="sm" className="h-9" onClick={() => void pickFolder()}>Pick</Button></span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="na-goal">Goal <span className="font-normal text-muted-foreground">· optional, you can write it later</span></Label><Textarea id="na-goal" rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={tpl.goal} /></div>
            <WorkersRunOn idPrefix="na" value={adapter} onChange={setAdapter}
              options={[{ id: 'template', name: "Template's mix", sub: mix || 'each worker on its own adapter' }, ...AGENCY_ADAPTERS.map((a) => ({ id: a.id as string, name: a.name as string, sub: `by ${a.by}` }))]} />
            <LeadModelField idPrefix="na" value={leadModel} onChange={setLeadModel} />
            <div className="rounded-lg bg-muted px-4 py-3 text-[13px] leading-relaxed">
              <strong className="font-semibold">What you get:</strong> {tpl.roster.map(agentName).join(', ')}, their skills, memory files and a folder for their work.
            </div>
            {error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
          </div>
          <DialogFooter className="border-t border-border px-6 py-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy || !name.trim() || (!!leadModel && !leadModel.model.trim())}>{busy ? 'Creating…' : 'Create agency'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

