import { useEffect, useMemo, useState } from 'react'
import type { ClaudeSkill, EngineStatus, ProviderId, ProviderSettings, SkillPack, TelegramStatus } from '@shared/types'
import {
  AGENCY_ADAPTERS, AGENCY_COLUMNS, AGENCY_TEMPLATES, agentName, planOwner, templateAdapters, templateSummary,
  type AgencyAdapterId, type AgencyMember, type AgencyNotify, type AgencyTemplate
} from '@shared/agencies'
import { PROVIDER_NAME } from '@shared/models'
import { HEAD_SRC } from '../heads'
import { refreshDefaultModel } from '../defaultModel'
import { DefaultModelPicker, ModelKeys } from './ModelSetup'
import { Icon } from './Icon'
import logo from '../assets/logo-mark.png'
import claudeLogo from '../assets/providers/claude.svg'
import geminiLogo from '../assets/providers/gemini.svg'
import hermesLogo from '../assets/providers/hermes.png'
import { Pose } from './Pose'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const STEPS = ['Agency', 'Adapter', 'Model', 'Skills', 'Kanban', 'Channel', 'Review'] as const

const ADAPTER_LOGO: Partial<Record<AgencyAdapterId, string>> = { 'claude-code': claudeLogo, 'gemini-cli': geminiLogo, hermes: hermesLogo }
const CLAUDE_PACK = 'anthropic-skills'

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))

function Head({ id, size = 32 }: { id: string; size?: number }): JSX.Element {
  return <img src={HEAD_SRC[id] ?? HEAD_SRC.smile} alt="" width={size} height={size} className="shrink-0 rounded-full bg-muted object-contain" style={{ width: size, height: size }} />
}

/** A step's body, a logo tile, a selectable card (ink ring when picked), a pack row and its checkbox. */
const BODY = 'flex flex-1 flex-col gap-5 p-7'
const TILE = 'grid size-10 shrink-0 place-items-center rounded-[10px] border border-border bg-card'
const choice = (on: boolean): string => cn(
  'flex min-h-11 cursor-pointer flex-col items-stretch gap-2 rounded-xl border bg-card p-4 text-left text-foreground shadow-xs outline-none transition-[border-color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/40',
  on ? 'border-foreground ring-1 ring-foreground' : 'border-border hover:border-border-strong'
)
const packRow = (on: boolean): string => cn(
  'flex cursor-pointer items-start gap-3.5 rounded-xl border bg-card px-4 py-3.5 shadow-xs',
  on ? 'border-foreground ring-1 ring-foreground' : 'border-border hover:border-border-strong'
)
const CHECK = 'mt-0.5 bg-card'

function Check(): JSX.Element {
  return <span className="grid size-5 shrink-0 place-items-center rounded-full bg-lime text-on-lime"><Icon name="check" size={12} /></span>
}

function Intro({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 id="aw-h" className="text-[26px] leading-tight font-semibold tracking-[-0.02em]">{title}</h1>
      <p className="max-w-[70ch] text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  )
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-[13px]">{label}</Label>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      {children}
    </div>
  )
}

/** A numbered setup step for the channel (lime number once done; faded until the step before it is done). */
function ChannelStep({ n, done, off, children }: { n: number; done: boolean; off?: boolean; children: React.ReactNode }): JSX.Element {
  return (
    <section className={cn('flex gap-3.5 rounded-xl border border-border bg-card p-4', off && 'opacity-55')}>
      <span className={cn('grid size-7 shrink-0 place-items-center rounded-full border font-mono text-xs', done ? 'border-transparent bg-lime text-on-lime' : 'border-border-strong text-muted-foreground')}>
        {done ? <Icon name="check" size={13} /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
    </section>
  )
}

function Stem(): JSX.Element {
  return <span aria-hidden="true" className="h-4 w-0.5 shrink-0 bg-border-strong" />
}

function AdapterMark({ id, name }: { id: AgencyAdapterId; name: string }): JSX.Element {
  const src = ADAPTER_LOGO[id]
  return src
    ? <span className={TILE}><img src={src} alt="" width={26} height={26} className="size-[26px] object-contain" /></span>
    : <span className={cn(TILE, 'border-foreground bg-primary font-mono text-[13px] font-semibold text-primary-foreground')} aria-hidden="true">{name.slice(0, 2)}</span>
}

interface Draft {
  org: string
  name: string
  description: string
  templateId: string | null
  goal: string
  /** Shared by every agent in the agency (saved once agencies are stored). */
  prompt: string
  plan: string[]
  roster: AgencyMember[]
  /** 'template' = each worker on the engine its template names. */
  adapter: AgencyAdapterId | 'template'
  model: { provider: ProviderId; model: string } | null
  packs: string[]
  autoRun: boolean
  channel: 'telegram' | 'slack' | 'none'
  notify: AgencyNotify
}

/**
 * Agency setup: seven steps that turn a template (or a description) into an agency: a Lead, its workers,
 * skills, a Kanban board and a channel to you. Shown after sign-in on first run.
 */
export function AgencyWizard({ firstName, firstRun, first, templateId, onDone, onCancel }: {
  firstName?: string
  /** The organization has no agencies yet (titles say "your first agency"). */
  first?: boolean
  /** Opens with this template picked (from Home's template grid). */
  templateId?: string
  /** First run asks the organization and shows the key fields; from New agency it doesn't. */
  firstRun: boolean
  /** Created; from New agency, with the new agency's project id. */
  onDone: (projectId?: string) => void
  onCancel?: () => void
}): JSX.Element {
  const [step, setStep] = useState(0)
  const [d, setD] = useState<Draft>({
    org: '', name: '', description: '', templateId: null, goal: '', prompt: '', plan: [], roster: [],
    adapter: 'template', model: null, packs: [], autoRun: false, channel: 'none', notify: 'questions'
  })
  const set = (p: Partial<Draft>): void => setD((v) => ({ ...v, ...p }))
  const [query, setQuery] = useState('')
  const [settings, setSettings] = useState<ProviderSettings | null>(null)
  const [engines, setEngines] = useState<EngineStatus[]>([])
  const [packs, setPacks] = useState<SkillPack[] | null>(null)
  const [catalog, setCatalog] = useState<ClaudeSkill[] | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [skillTab, setSkillTab] = useState<'claude' | 'openai' | 'github'>('claude')
  const [tg, setTg] = useState<TelegramStatus | null>(null)
  const [tgToken, setTgToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSettings = async (): Promise<ProviderSettings> => { const s = await window.tyslin.settings.get(); setSettings(s); return s }
  useEffect(() => {
    void window.tyslin.onboarding.status().then((st) => set({ org: st.orgName }))
    void loadSettings().then((s) => set({ model: { provider: s.defaultModel.provider, model: s.defaultModel.model } }))
    void window.tyslin.engines.list().then(setEngines)
    void window.tyslin.telegram.status().then(setTg)
  }, [])
  // Skills load when that step opens, since they come from GitHub.
  useEffect(() => {
    if (step !== 3 || packs) return
    void window.tyslin.skillPacks.list().then(setPacks).catch(() => setPacks([]))
    void window.tyslin.skillPacks.claudeCatalog().then(setCatalog).catch((e) => setCatalogError(errorText(e)))
  }, [step, packs])

  const pickTemplate = (id: string): void => {
    const t = AGENCY_TEMPLATES.find((x) => x.id === id)
    if (!t) return
    set({
      templateId: id, description: t.tagline, goal: t.goal, plan: t.plan, roster: t.roster, name: d.name.trim() ? d.name : t.name,
      prompt: `${t.tagline} Work in this agency's folder. Keep each change small and send it for review. Write in plain English. Ask before adding a paid service or a new dependency.`
    })
  }
  useEffect(() => { if (templateId) pickTemplate(templateId) }, [templateId])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? AGENCY_TEMPLATES.filter((t) => `${t.name} ${t.tagline}`.toLowerCase().includes(q)) : AGENCY_TEMPLATES
  }, [query])

  const lead = d.roster.find((m) => m.lead)
  const workers = d.roster.filter((m) => !m.lead)
  const template = AGENCY_TEMPLATES.find((t) => t.id === d.templateId) ?? null
  const included = template ? template.skills : []
  const adapterName = (id: AgencyMember['engine'] | 'template'): string => id === 'template' ? 'Template\'s mix' : id === 'builtin' ? 'Default model' : AGENCY_ADAPTERS.find((a) => a.id === id)!.name
  /** What a worker will run on after the Adapter step. */
  const engineFor = (m: AgencyMember): AgencyMember['engine'] => m.lead || d.adapter === 'template' ? m.engine : d.adapter
  const engineOf = (id: string): EngineStatus | undefined => engines.find((e) => e.id === id)
  const togglePack = (id: string): void => set({ packs: d.packs.includes(id) ? d.packs.filter((p) => p !== id) : [...d.packs, id] })
  const folder = `Documents/Tyslin Studio/${d.org.trim() || '…'}/${d.name.trim() || '…'}`

  const keySaved = async (): Promise<void> => {
    const s = await loadSettings()
    if (d.model && !(d.model.provider === 'ollama' || s[`${d.model.provider}KeySet` as 'anthropicKeySet'])) {
      set({ model: { provider: s.defaultModel.provider, model: s.defaultModel.model } })
    }
  }

  const canNext = [
    !!d.name.trim() && (!firstRun || !!d.org.trim()) && (!!d.description.trim() || !!d.templateId),
    true,
    !!d.model?.model.trim(),
    true, true, true, true
  ][step]

  const create = async (): Promise<void> => {
    if (!d.model) return
    setBusy(true); setError(null)
    try {
      if (firstRun) {
        // The organization's name and the default model first; the Default project is only a fallback folder.
        await window.tyslin.onboarding.finish({ orgName: d.org.trim(), projectName: 'Default project', defaultProvider: d.model.provider, defaultModel: d.model.model.trim() })
        await refreshDefaultModel()
      }
      const a = await window.tyslin.agencies.create({
        name: d.name.trim(), templateId: d.templateId, description: d.description.trim(), goal: d.goal.trim(), prompt: d.prompt,
        adapter: d.adapter, packs: d.packs, autoRun: d.autoRun, channel: d.channel, notify: d.notify, budget: null
      })
      onDone(a.projectId)
    } catch (e) {
      setError(errorText(e)); setBusy(false)
    }
  }
  const next = (): void => { if (!canNext) return; if (step < STEPS.length - 1) setStep(step + 1); else void create() }

  return (
    // Below the title bar (44 px), which stays draggable.
    <main className="fixed inset-x-0 top-12 bottom-0 z-[100] flex justify-center overflow-y-auto bg-background px-4 pt-8 text-foreground">
      <form className="mb-auto flex min-h-[calc(100%-2rem)] w-full max-w-[980px] flex-col rounded-t-2xl border border-b-0 border-border bg-card shadow-xs"
        onSubmit={(e) => { e.preventDefault(); next() }} aria-labelledby="aw-h">
        <header className="flex flex-col gap-4 border-b border-border px-7 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <img src={logo} alt="" width={40} height={40} className="size-10 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-mono text-xs tracking-[0.08em] text-green uppercase">{firstRun ? 'Set up your agency' : 'New agency'} · step {step + 1} of {STEPS.length}</span>
              <p className="text-[15px] font-semibold">{firstName ? `Welcome, ${firstName}` : 'Welcome'}</p>
            </div>
          </div>
          <ol className="grid grid-cols-7 gap-2" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s} aria-current={i === step ? 'step' : undefined}>
                <button type="button" title={s} aria-label={`Step ${i + 1}: ${s}`} disabled={i > step || busy} onClick={() => setStep(i)}
                  className={cn('group flex min-h-11 w-full flex-col justify-center gap-2 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 enabled:cursor-pointer disabled:cursor-default',
                    i <= step ? 'text-foreground' : 'text-muted-foreground')}>
                  <span aria-hidden="true" className={cn('h-1 w-full rounded-full', i < step ? 'bg-foreground' : i === step ? 'bg-lime' : 'bg-border')} />
                  <span className={cn('truncate text-xs', i === step ? 'font-semibold' : 'font-medium', i < step && 'group-hover:underline')}>{i + 1} · {s}</span>
                </button>
              </li>
            ))}
          </ol>
        </header>

        {step === 0 && (
          <section className={BODY}>
            <Intro title={firstRun || first ? 'Set up your first agency' : 'Set up a new agency'}>
              You get a Lead and a team of agents with a goal, a plan, a board and a line to you. Start from a template or describe the work.
            </Intro>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
              {firstRun && (
                <Field label="Organization" htmlFor="aw-org">
                  <Input id="aw-org" maxLength={60} value={d.org} onChange={(e) => set({ org: e.target.value })} placeholder="e.g. ReactiveSpace" />
                </Field>
              )}
              <Field label="Agency name" htmlFor="aw-name">
                <Input id="aw-name" autoFocus maxLength={80} value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Launch Studio" />
              </Field>
            </div>
            <Field label="What does this agency do?" htmlFor="aw-desc">
              <Textarea id="aw-desc" rows={2} className="resize-y" value={d.description} onChange={(e) => set({ description: e.target.value })}
                placeholder="Describe the work in a sentence or two, or start from a template below." />
            </Field>
            <Field label="Goal" htmlFor="aw-goal">
              <Input id="aw-goal" value={d.goal} onChange={(e) => set({ goal: e.target.value })} placeholder="One sentence: what done looks like" />
            </Field>
            <Field label="Agency prompt" htmlFor="aw-prompt" hint="Every agent in this agency follows this, the Lead and the workers. Each agent also keeps its own job instructions.">
              <Textarea id="aw-prompt" rows={3} className="resize-y" value={d.prompt} onChange={(e) => set({ prompt: e.target.value })}
                placeholder="How this agency works: tools, style, what to ask you before doing." />
            </Field>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Start from a template</h2>
              <Input className="w-full max-w-[260px]" type="search" placeholder="Search templates" aria-label="Search templates" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3" role="radiogroup" aria-label="Templates">
              {shown.map((t) => {
                const l = t.roster.find((m) => m.lead)!
                const on = d.templateId === t.id
                return (
                  <button key={t.id} type="button" role="radio" aria-checked={on} className={cn(choice(on), 'p-3.5')} onClick={() => pickTemplate(t.id)}>
                    <span className="flex items-center gap-2.5"><Head id={l.head} size={30} /><strong className="min-w-0 flex-1 text-sm font-semibold">{t.name}</strong>{on && <Check />}</span>
                    <span className="text-[13px] leading-snug text-muted-foreground">{t.tagline}</span>
                    <span className="mt-auto flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">{templateSummary(t)}</span>
                      <span className="inline-flex shrink-0 items-center gap-1.5" aria-label={`Runs on ${templateAdapters(t).map((id) => AGENCY_ADAPTERS.find((a) => a.id === id)!.name).join(', ')}`}>
                        {templateAdapters(t).map((id) => {
                          const a = AGENCY_ADAPTERS.find((x) => x.id === id)!
                          return ADAPTER_LOGO[id]
                            ? <img key={id} src={ADAPTER_LOGO[id]} alt="" title={a.name} width={16} height={16} className="size-4 object-contain" />
                            : <span key={id} className="grid size-4 place-items-center rounded-sm bg-primary font-mono text-[8px] font-semibold text-primary-foreground" title={a.name} aria-hidden="true">{a.name.slice(0, 2)}</span>
                        })}
                      </span>
                    </span>
                  </button>
                )
              })}
              {shown.length === 0 && <p className="text-sm text-muted-foreground">No template matches. Describe the agency above instead.</p>}
            </div>
          </section>
        )}

        {step === 1 && (
          <section className={BODY}>
            <Intro title="How do your agents run?">
              Your workers run on the agents you already use. Keep the template's mix or put every worker on one; the Lead runs on your default model. You can change any agent later on its page. Goose, ZeroClaw, OpenClaw and custom agents are in Settings → Agent engines.
            </Intro>
            <button type="button" role="radio" aria-checked={d.adapter === 'template'} className={choice(d.adapter === 'template')} onClick={() => set({ adapter: 'template' })}>
              <span className="flex items-center gap-3"><span className={cn(TILE, 'border-foreground bg-primary font-mono text-xs font-semibold text-primary-foreground')} aria-hidden="true">Mix</span>
                <span className="flex min-w-0 flex-1 flex-col"><strong className="text-sm font-semibold">Use the template's mix</strong><span className="text-xs text-muted-foreground">Recommended</span></span>
                {d.adapter === 'template' && <Check />}</span>
              <span className="text-[13px] leading-snug text-muted-foreground">{template ? template.roster.filter((m) => !m.lead).map((m) => `${agentName(m)}: ${adapterName(m.engine)}`).join(' · ') : 'Pick a template first; each worker then has an agent named for it.'}</span>
            </button>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3" role="radiogroup" aria-label="One adapter for every worker">
              {AGENCY_ADAPTERS.map((a) => {
                const e = engineOf(a.id)
                const installed = !!e?.resolvedPath
                const on = d.adapter === a.id
                return (
                  <button key={a.id} type="button" role="radio" aria-checked={on} className={choice(on)} onClick={() => set({ adapter: a.id })}>
                    <span className="flex items-center gap-3"><AdapterMark id={a.id} name={a.name} />
                      <span className="flex min-w-0 flex-1 flex-col"><strong className="text-sm font-semibold">{a.name}</strong><span className="text-xs text-muted-foreground">{a.by}</span></span>
                      {on && <Check />}</span>
                    <span className="text-[13px] leading-snug text-muted-foreground">{a.description}</span>
                    <span className="mt-auto flex items-center justify-between gap-2">
                      <Badge variant={installed ? 'soft' : 'secondary'}>{installed ? 'Installed' : 'Not installed'}</Badge>
                      {!installed && <span className={buttonVariants({ variant: 'outline', size: 'sm' })} aria-hidden="true">Install</span>}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">Install shows you the official command before anything runs. You can finish without installing; agents then wait until it's installed.</p>
          </section>
        )}

        {step === 2 && d.model && (
          <section className={BODY}>
            <Intro title="Pick the Lead's model">
              Your Lead plans and reviews with this model, and it becomes your default. Keys are encrypted on this computer and only go to their own provider. Ollama runs locally and needs no key.
            </Intro>
            {firstRun ? <ModelKeys settings={settings} onSaved={keySaved} /> : <p className="text-sm text-muted-foreground">Model keys are in Settings → Models.</p>}
            <div className="flex max-w-[480px] flex-col gap-2">
              <h2 className="text-lg font-semibold">Lead's model</h2>
              <DefaultModelPicker settings={settings} value={d.model} onChange={(m) => set({ model: m })} idPrefix="aw-dm" />
            </div>
          </section>
        )}

        {step === 3 && (
          <section className={BODY}>
            <Intro title="Skills">
              Your agents get the skills this kind of work needs, already included. Add packs for more; they install when you create the agency.
            </Intro>
            {included.length > 0 && (
              <div className="flex flex-col gap-2"><span className="text-[13px] font-medium">Included with {template?.name}</span>
                <span className="flex flex-wrap gap-1.5">{included.map((s) => <Badge key={s} variant="secondary" className="font-mono text-foreground">{s}</Badge>)}</span>
              </div>
            )}
            <TabsList aria-label="Skill sources">
              {(['claude', 'openai', 'github'] as const).map((t) => (
                <TabsTrigger key={t} active={skillTab === t} onClick={() => setSkillTab(t)}>
                  {t === 'claude' ? 'Claude' : t === 'openai' ? 'OpenAI' : 'GitHub'}
                </TabsTrigger>
              ))}
            </TabsList>
            {skillTab === 'claude' && (
              catalogError ? <p className="rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive" role="alert">Couldn't load Anthropic's skills from GitHub. {catalogError}</p>
                : !catalog ? <p className="text-sm text-muted-foreground" role="status">Loading from GitHub…</p>
                  : (
                    <label className={packRow(d.packs.includes(CLAUDE_PACK))}>
                      <Checkbox className={CHECK} checked={d.packs.includes(CLAUDE_PACK)} onCheckedChange={() => togglePack(CLAUDE_PACK)} />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2"><strong className="text-sm font-semibold">Anthropic's open skills</strong><Badge variant="secondary">Apache 2.0</Badge></span>
                        <span className="text-[13px] leading-snug text-muted-foreground">The Apache 2.0 skills from github.com/anthropics/skills. Source-available ones are not installed.</span>
                        <span className="mt-1.5 flex flex-wrap gap-1.5">{catalog.filter((c) => c.installable).map((c) => <Badge key={c.folder} variant="outline" className="font-mono">{c.name}</Badge>)}</span>
                      </span>
                    </label>
                  )
            )}
            {skillTab === 'openai' && <p className="text-sm text-muted-foreground">OpenAI skills: coming soon.</p>}
            {skillTab === 'github' && (
              !packs ? <p className="text-sm text-muted-foreground" role="status">Loading…</p> : (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-2.5">
                  {packs.filter((p) => p.group !== 'claude' && p.featured).map((p) => (
                    <label key={p.id} className={cn(packRow(d.packs.includes(p.id) || p.installed), (p.installed || !p.installable) && 'cursor-default')}>
                      <Checkbox className={CHECK} disabled={p.installed || !p.installable} checked={p.installed || d.packs.includes(p.id)} onCheckedChange={() => togglePack(p.id)} />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <strong className="text-sm font-semibold">{p.name}</strong>
                        <span className="font-mono text-xs text-muted-foreground">{[p.author, p.license || 'no licence'].join(' · ')}{p.installed ? ' · installed' : ''}</span>
                        <span className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">{p.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )
            )}
          </section>
        )}

        {step === 4 && (
          <section className={BODY}>
            <Intro title="Where the work lives">
              You drop a brief in Inbox; the Lead turns it into cards, gives each one an owner and moves them along. Finished work waits in Review for you.
            </Intro>
            <div className="grid grid-cols-[repeat(5,minmax(150px,1fr))] gap-2.5 overflow-x-auto pb-1" aria-label="Board preview">
              {AGENCY_COLUMNS.map((c, i) => (
                <div key={c} className="flex min-h-[240px] flex-col gap-2 rounded-xl border border-border bg-muted p-2.5">
                  <span className="flex items-center justify-between text-[13px] font-semibold">{c}<Badge variant="outline" className="bg-card font-mono">{i === 0 ? d.plan.length : 0}</Badge></span>
                  {i === 0 && d.plan.map((p) => {
                    const m = template ? planOwner(template, p) : undefined
                    return (
                      <div key={p} className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-2.5 text-[13px] shadow-xs">
                        <span className="font-medium">{p}</span>
                        {m && <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Head id={m.head} size={18} />{agentName(m)}</span>}
                      </div>
                    )
                  })}
                  {i === 0 && d.plan.length === 0 && <span className="text-xs text-muted-foreground">The Lead writes the first cards from your description.</span>}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-[18px] py-4 shadow-xs">
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <Label htmlFor="aw-autorun" className="text-sm font-semibold">Let the Lead run cards automatically</Label>
                <span className="text-[13px] text-muted-foreground">{d.autoRun ? 'The Lead plans the cards and starts them with their owners.' : 'The Lead only plans. You start each card when you\'re ready.'}</span>
              </span>
              <Switch id="aw-autorun" checked={d.autoRun} onCheckedChange={(v) => set({ autoRun: v })} />
            </div>
          </section>
        )}

        {step === 5 && (
          <section className={BODY}>
            <Intro title="How the Lead talks to you">
              Your Lead messages you when there's news or a question: briefs, questions, work to review and digests. Only accounts you link can reply. Skip this and set it up later on the agency's Channel tab.
            </Intro>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3" role="radiogroup" aria-label="Channel">
              {([['telegram', 'Telegram', 'Your own bot; link your account with a one-time code.'], ['slack', 'Slack', 'A bot in your workspace, linked to one channel.'], ['none', 'Not now', 'Set it up later on the Channel tab.']] as const).map(([id, name, desc]) => (
                <button key={id} type="button" role="radio" aria-checked={d.channel === id} className={choice(d.channel === id)} onClick={() => set({ channel: id })}>
                  <span className="flex items-center gap-3"><span className={cn(TILE, 'border-transparent bg-muted')} aria-hidden="true"><Icon name={id === 'none' ? 'close' : 'chat'} size={16} /></span>
                    <strong className="min-w-0 flex-1 text-sm font-semibold">{name}</strong>
                    {id === 'telegram' && tg?.connected && <Badge variant="soft">Connected</Badge>}
                    {d.channel === id && <Check />}</span>
                  <span className="text-[13px] leading-snug text-muted-foreground">{desc}</span>
                </button>
              ))}
            </div>

            {d.channel === 'telegram' && tg && (
              <div className="flex flex-col gap-2">
                <ChannelStep n={1} done={tg.connected}>
                  <strong className="text-sm font-semibold">Your bot</strong>
                  <span className="text-[13px] text-muted-foreground">In Telegram, message BotFather, send /newbot and paste the token here. It's stored encrypted on this computer.</span>
                  {tg.connected ? <span className="text-[13px] text-green">Connected to {tg.botName ? `@${tg.botName}` : 'your bot'}</span> : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input className="min-w-[220px] flex-1" type="password" placeholder="Bot token" aria-label="Telegram bot token" value={tgToken} onChange={(e) => setTgToken(e.target.value)} />
                      <Button type="button" disabled={!tgToken.trim() || busy}
                        onClick={() => { setBusy(true); setError(null); void window.tyslin.telegram.setToken(tgToken).then((s) => { setTg(s); setTgToken('') }, (e) => setError(errorText(e))).finally(() => setBusy(false)) }}>
                        Connect
                      </Button>
                    </div>
                  )}
                </ChannelStep>
                <ChannelStep n={2} done={tg.linked.length > 0} off={!tg.connected}>
                  <strong className="text-sm font-semibold">Link your account</strong>
                  {tg.linked.map((l) => <span key={l.chatId} className="text-[13px] text-green">Linked: {l.name}</span>)}
                  {tg.linkCode
                    ? <div className="rounded-lg border border-green bg-lime-soft px-3 py-2.5 text-[13px]">Send <code className="font-mono font-semibold">/start {tg.linkCode}</code> to {tg.botName ? `@${tg.botName}` : 'your bot'}. The code works for 10 minutes.</div>
                    : <Button type="button" variant="outline" className="self-start" disabled={!tg.connected} onClick={() => void window.tyslin.telegram.linkCode().then(setTg)}>Get a link code</Button>}
                </ChannelStep>
              </div>
            )}
            {d.channel === 'slack' && (
              <ChannelStep n={1} done={false} off>
                <strong className="text-sm font-semibold">Your Slack bot</strong>
                <span className="text-[13px] text-muted-foreground">Paste the bot token from your Slack app, then link one channel with a one-time code. Do this on the agency's Channel tab once it exists.</span>
                <Input type="password" placeholder="xoxb-…" aria-label="Slack bot token" disabled />
              </ChannelStep>
            )}
            {d.channel !== 'none' && (
              <fieldset className="m-0 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2 rounded-xl border border-border p-4 pt-2">
                <legend className="px-1.5 text-[13px] font-medium">What the Lead sends</legend>
                <RadioGroup className="contents" aria-label="What the Lead sends" value={d.notify} onValueChange={(v) => set({ notify: v as typeof d.notify })}>
                {([['all', 'Everything', 'Briefs, questions, reviews and the daily digest'], ['questions', 'Questions and reviews', 'Only when the Lead needs you'], ['digest', 'Digest only', 'One summary a day']] as const).map(([id, name, desc]) => (
                  <label key={id} className={cn('flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5', d.notify === id ? 'border-foreground ring-1 ring-foreground' : 'border-border hover:border-border-strong')}>
                    <RadioGroupItem value={id} className="mt-0.5 bg-card" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5"><strong className="text-sm font-semibold">{name}</strong><span className="text-[13px] text-muted-foreground">{desc}</span></span>
                  </label>
                ))}
                </RadioGroup>
              </fieldset>
            )}
          </section>
        )}

        {step === 6 && (
          <section className={BODY}>
            <div className="flex items-end gap-[18px]">
              <Pose pose={2} height={96} />
              <Intro title="Review and create">{d.goal || d.description}</Intro>
            </div>
            <div className="flex flex-col items-center gap-0 rounded-xl border border-border bg-card p-5 shadow-xs">
              <span className="flex items-center gap-2 rounded-full border border-border py-1.5 pr-3 pl-1.5">
                <span className="grid size-6 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground" aria-hidden="true">{(firstName ?? 'Y').slice(0, 1).toUpperCase()}</span>
                <strong className="text-sm font-semibold">You</strong>
              </span>
              {lead && (
                <>
                  <Stem />
                  <div className="flex w-full max-w-[420px] items-center gap-3 rounded-xl border-2 border-foreground bg-card px-3.5 py-2.5">
                    <Head id={lead.head} size={40} />
                    <span className="flex min-w-0 flex-col"><strong className="text-sm font-semibold">{agentName(lead)}</strong>
                      <small className="text-xs leading-snug text-muted-foreground">Plans the work, hands out cards and reports to you · {adapterName('builtin')}</small></span>
                  </div>
                </>
              )}
              {workers.length > 0 && (
                <>
                  <Stem />
                  <div className="grid w-full gap-2.5" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${workers.length > 4 ? 120 : 150}px, 1fr))` }}>
                    {workers.map((m) => (
                      <div key={m.first} className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card p-3 text-center">
                        <Head id={m.head} size={36} />
                        <strong className="text-sm font-semibold">{agentName(m)}</strong>
                        <small className="text-xs leading-snug text-muted-foreground">{m.job}</small>
                        <Badge variant="secondary" className="mt-1 font-mono text-foreground">{adapterName(engineFor(m))}</Badge>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {!lead && <p className="mt-3 text-sm text-muted-foreground">The Lead drafts the roster from your description after it's created.</p>}
            </div>
            <dl className="m-0 grid grid-cols-[140px_1fr] gap-x-4 gap-y-2.5 text-sm [&_dd]:m-0 [&_dd]:[overflow-wrap:anywhere] [&_dt]:text-muted-foreground">
              <dt>Folder</dt><dd className="font-mono text-[13px]">{folder}</dd>
              <dt>Adapter</dt><dd>{adapterName(d.adapter)}{d.adapter !== 'template' && !engineOf(d.adapter)?.resolvedPath ? ' (not installed yet)' : ''}</dd>
              <dt>Lead's model</dt><dd className="font-mono text-[13px]">{d.model ? `${PROVIDER_NAME[d.model.provider]} · ${d.model.model}` : ''}</dd>
              <dt>Skills</dt><dd>{included.length} included{d.packs.length ? `, ${d.packs.length} pack${d.packs.length > 1 ? 's' : ''} to install` : ''}</dd>
              <dt>Board</dt><dd>{AGENCY_COLUMNS.join(' → ')} · {d.plan.length} cards · {d.autoRun ? 'Lead runs cards' : 'you run cards'}</dd>
              <dt>Channel</dt><dd>{d.channel === 'none' ? 'Not now' : `${d.channel === 'telegram' ? 'Telegram' : 'Slack'} · ${d.notify === 'all' ? 'everything' : d.notify === 'questions' ? 'questions and reviews' : 'digest only'}`}</dd>
              <dt>Lead's task</dt><dd>{template ? `${template.leadTask.schedule.repeat === 'weekly' ? 'Mondays' : 'Weekdays'} at ${template.leadTask.schedule.time}: ${template.leadTask.prompt}` : 'Weekdays at 09:00: plan the Inbox'}</dd>
            </dl>
          </section>
        )}

        {error && <p className="mx-7 mb-4 rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive" role="alert">{error}</p>}
        <footer className="sticky bottom-0 mt-auto flex items-center justify-between gap-3 border-t border-border bg-card px-7 py-4">
          {step > 0 ? <Button type="button" variant="outline" onClick={() => setStep(step - 1)} disabled={busy}>Back</Button>
            : onCancel ? <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button> : <span />}
          <span className="font-mono text-xs text-muted-foreground">{STEPS[step]}</span>
          <Button type="submit" variant={step < STEPS.length - 1 ? 'default' : 'lime'} disabled={!canNext || busy}>
            {step < STEPS.length - 1 ? 'Continue' : busy ? 'Creating…' : 'Create agency'}
          </Button>
        </footer>
      </form>
    </main>
  )
}
