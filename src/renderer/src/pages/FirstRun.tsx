import { useEffect, useRef, useState } from 'react'
import type { ProviderId, ProviderSettings } from '@shared/types'
import { AGENCY_GROUPS, AGENCY_TEMPLATES, agentName, type AgencyTemplate } from '@shared/agencies'
import { ENGINE_NAMES } from '@shared/engines'
import { MODEL_SUGGESTIONS } from '@shared/models'
import { refreshDefaultModel } from '../defaultModel'
import { Icon } from '../components/Icon'
import { DefaultModelPicker, ModelKeys, hasKey } from '../components/ModelSetup'
import { Pose } from '../components/Pose'
import logo from '../assets/logo-horizontal.png'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
const STEPS = ['Agency', 'Model', 'First task'] as const

/**
 * First run, three steps: name the organization and pick the first agency; connect a model (keys and
 * the default model); then the team is ready and you can give it a first task. Settings cover the rest.
 */
export function FirstRun({ firstName, onDone }: { firstName?: string; onDone: (projectId: string, firstTask: string) => void }): JSX.Element {
  const [step, setStep] = useState(0)
  // Each step starts at its top (QA, 10 Nov 2026: step 2 opened scrolled down by step 1's offset).
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }) }, [step])
  // The real folder root (Documents can be elsewhere, and names lose / and other characters the way main makes them).
  const [root, setRoot] = useState('Documents/Tyslin Studio')
  useEffect(() => { void window.tyslin.projects.newFolderPath('x').then((p) => setRoot(p.replace(/[\\/][^\\/]+[\\/][^\\/]+$/, ''))).catch(() => undefined) }, [])
  const folderName = (s: string): string => s.replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  const [org, setOrg] = useState(firstName ? `${firstName}'s studio` : 'My studio')
  const [tpl, setTpl] = useState<AgencyTemplate>(AGENCY_TEMPLATES.find((t) => !t.comingSoon)!)
  const [settings, setSettings] = useState<ProviderSettings | null>(null)
  const [pick, setPick] = useState<{ provider: ProviderId; model: string } | null>(null)
  const [task, setTask] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<string | null>(null)
  // "Help me choose": no agency is made here; Home asks what you want to get done and suggests the teams (StartChat).
  const [suggest, setSuggest] = useState(false)
  // The picked provider follows the keys: when the current pick has no key and one provider does, the pick moves
  // there with its first suggested model, so saving an OpenAI key doesn't leave the Lead on "Claude (not connected)".
  const loadSettings = async (): Promise<void> => {
    const s = await window.tyslin.settings.get()
    setSettings(s)
    setPick((p) => {
      const cur = p ?? { provider: s.defaultModel.provider, model: s.defaultModel.model }
      if (hasKey(s, cur.provider)) return cur
      const first = (['anthropic', 'openai', 'gemini', 'openrouter'] as ProviderId[]).find((id) => hasKey(s, id))
      return first ? { provider: first, model: MODEL_SUGGESTIONS[first][0] ?? '' } : cur
    })
  }
  useEffect(() => { void loadSettings() }, [])
  const connected = !!pick && hasKey(settings, pick.provider)
  const ACTIONS = 'sticky bottom-0 -mx-12 -mb-9 mt-auto flex items-center gap-3 border-t border-border bg-background px-12 py-4'

  const finishSetup = async (): Promise<void> => {
    setBusy(true); setError('')
    try {
      // The organization's name and the default model first, so the agency's folder lands under the new name.
      await window.tyslin.onboarding.finish({ orgName: org.trim(), projectName: 'Default project', defaultProvider: pick?.provider ?? null, defaultModel: pick?.model.trim() ?? '' })
      await refreshDefaultModel()
      if (suggest) { onDone('', ''); return }
      const a = await window.tyslin.agencies.create({ name: tpl.name, templateId: tpl.id, description: '', goal: '', prompt: '', adapter: 'template', packs: [], autoRun: false, channel: 'none', notify: 'questions', budget: null })
      setCreated(a.projectId)
      setStep(2)
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const stepBtn = (i: number): string => cn('flex h-10 w-full items-center gap-3 rounded-md px-2 text-left text-sm', i === step ? 'font-semibold' : i > step ? 'text-muted-foreground' : '')
  const dot = (i: number): string => cn('grid size-6 flex-none place-items-center rounded-full border text-xs', i < step ? 'border-lime bg-lime text-on-lime' : i === step ? 'border-foreground font-semibold' : 'border-border-strong text-muted-foreground')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="drag-region flex h-12 flex-none items-center justify-between border-b border-border px-6"><img src={logo} alt="Tyslin" className="h-[22px] w-auto" /><span className="text-xs text-muted-foreground">Setup · about 2 minutes</span></div>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[260px] flex-none flex-col gap-1 border-r border-border px-6 py-9" aria-label="Steps">
          {STEPS.map((s, i) => <button key={s} type="button" className={stepBtn(i)} disabled={i > step || created !== null} onClick={() => setStep(i)}><span className={dot(i)}>{i < step ? <Icon name="check" size={12} /> : i + 1}</span>{s}</button>)}
          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">You can change all of this later in Settings and on the agency's page.</p>
        </aside>
        <main ref={mainRef} className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-12 py-9">
          {step === 0 && (
            <>
              <div className="flex flex-col gap-1.5"><h1 className="text-[26px] font-semibold tracking-tight">Name your organization, pick your first agency</h1><p className="text-sm text-muted-foreground">An organization holds your agencies and their folders. Each agency is a ready-made team: a Lead and workers.</p></div>
              <div className="flex max-w-[420px] flex-col gap-1.5"><Label htmlFor="fr-org">Organization</Label><Input id="fr-org" value={org} maxLength={60} onChange={(e) => setOrg(e.target.value)} autoFocus /><span className="text-xs text-muted-foreground">Folder: {root}/{folderName(org) || 'My studio'}</span></div>
              {AGENCY_GROUPS.map((g) => {
                const list = AGENCY_TEMPLATES.filter((t) => t.group === g.id)
                if (!list.length) return null
                return (
                  <div key={g.id} className="flex flex-col gap-2.5">
                    <span className="font-mono text-[11px] tracking-[0.08em] text-green uppercase">{g.title}</span>
                    <div className="grid gap-3 md:grid-cols-3">
                      {list.map((t) => (
                        <button key={t.id} type="button" disabled={t.comingSoon} aria-pressed={tpl.id === t.id} onClick={() => setTpl(t)}
                          className={cn('flex flex-col gap-1.5 rounded-xl border bg-card p-4 text-left shadow-xs outline-none transition-colors hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-default disabled:opacity-50', tpl.id === t.id ? 'border-primary ring-1 ring-primary' : 'border-border')}>
                          <span className="flex items-center justify-between gap-2"><strong className="text-[14.5px] font-semibold">{t.name}</strong>{t.comingSoon && <Badge variant="secondary">Coming soon</Badge>}</span>
                          <span className="text-xs leading-snug text-muted-foreground">{t.tagline}</span>
                          <span className="mt-1 font-mono text-xs text-muted-foreground">{t.roster.length} agents · {t.roster.find((m) => m.lead)?.first ?? '?'} leads</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
              <div className={ACTIONS}><Button size="lg" disabled={!org.trim()} onClick={() => { setSuggest(false); setStep(1) }}>Continue with {tpl.name}</Button><Button size="lg" variant="outline" disabled={!org.trim()} onClick={() => { setSuggest(true); setStep(1) }}>Not sure? Tyslin helps you choose</Button><span className="text-xs text-muted-foreground">Workers run on {[...new Set(tpl.roster.filter((m) => !m.lead).map((m) => ENGINE_NAMES[m.engine]))].join(', ')}. Change it later per agent.</span></div>
            </>
          )}
          {step === 1 && (
            <>
              <div className="flex flex-col gap-1.5"><h1 className="text-[26px] font-semibold tracking-tight">Connect a model</h1><p className="text-sm text-muted-foreground">The Lead needs an API key. Workers can use the same key, or sign in with your own Claude, ChatGPT or Google account in Settings.</p></div>
              <ModelKeys settings={settings} onSaved={() => loadSettings()} />
              <Card className="gap-3 px-5 py-[18px]"><strong className="text-sm font-semibold">Default model</strong>{pick && <DefaultModelPicker settings={settings} value={pick} onChange={setPick} />}<span className="text-xs text-muted-foreground">Used by the Lead and by anything you don't set otherwise.</span></Card>
              {error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
              <div className={ACTIONS}>
                <Button variant="ghost" size="lg" onClick={() => setStep(0)}>Back</Button>
                <Button size="lg" disabled={busy || !connected} onClick={() => void finishSetup()}>{busy ? 'Setting up…' : 'Continue'}</Button>
                {!connected && <span className="text-xs text-muted-foreground">Add a key above first: the Lead can't run without one.</span>}
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <div className="flex items-end justify-between gap-4"><div className="flex flex-col gap-1.5"><h1 className="text-[26px] font-semibold tracking-tight">Your agency is ready</h1><p className="text-sm text-muted-foreground">{tpl.roster.find((m) => m.lead)?.first} is the Lead. {tpl.roster.filter((m) => !m.lead).map((m) => m.first).join(', ')} work for the Lead. Give them the first task, or do it later from Home.</p></div><Pose pose={2} height={150} className="hidden md:block" /></div>
              <Card className="max-w-[620px] gap-0 overflow-hidden py-0">
                {tpl.roster.map((m) => <div key={m.first} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0"><span className="flex min-w-0 flex-1 flex-col"><strong className="text-sm font-semibold">{agentName(m)}</strong><span className="text-xs text-muted-foreground">{m.lead ? 'Lead' : m.job} · {m.lead ? 'default model' : ENGINE_NAMES[m.engine]}</span></span></div>)}
              </Card>
              <div className="flex max-w-[620px] flex-col gap-2"><Label htmlFor="fr-task">First task</Label><Textarea id="fr-task" rows={3} value={task} onChange={(e) => setTask(e.target.value)} placeholder="What should they do first?" autoFocus /></div>
              <div className={ACTIONS}><Button size="lg" onClick={() => created && onDone(created, task.trim())}>{task.trim() ? 'Start' : 'Go to Home'}</Button></div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
