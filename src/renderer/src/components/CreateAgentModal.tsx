import { useEffect, useMemo, useState } from 'react'
import type { Agent, AgentInput, AgentTestResult, EngineStatus, ExternalEngineId, Project, ProviderId, ProviderSettings, Shape, Skill, Tone } from '@shared/types'
import { MODEL_SUGGESTIONS } from '@shared/models'
import { getDefaultModel } from '../defaultModel'
import { getCurrentProject } from '../currentProject'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import { Mark, MARKS } from './RunsOnBadge'
import { HeadPicker } from './HeadPicker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface Props {
  agents: Agent[]
  projects: Project[]
  onClose: () => void
  /** Saved: refresh lists. */
  onCreated: (a: Agent) => void
  onChat: (a: Agent) => void
  onTask: (a: Agent) => void
  onOpen: (a: Agent) => void
  onAskBuilder: () => void
}

const STEPS = ['Basics', 'Runs on', 'Instructions', 'Skills', 'Access', 'Test & finish'] as const
const TONES: [Tone, string, string][] = [['lime', 'Lime', '#7DB800'], ['ink', 'Ink', '#0F0F0D'], ['paper', 'Paper', '#FFFFFF']]
const MODELS: { id: ProviderId; note: string }[] = [
  { id: 'anthropic', note: 'Anthropic' }, { id: 'openai', note: 'GPT models' }, { id: 'gemini', note: 'Google' }, { id: 'ollama', note: 'On this computer' }
]

/** Radix Select can't hold an empty value; stands for "none" (no project, reports to you). */
const NONE = '__none'

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))

/** New agent in six short steps, with a real test before it is created. */
export function CreateAgentModal({ agents, projects, onClose, onCreated, onChat, onTask, onOpen, onAskBuilder }: Props): JSX.Element {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<AgentInput>({
    kind: 'agent', name: '', description: '', instructions: '', shape: 'hex', tone: 'lime',
    // New agents start on the default model.
    provider: getDefaultModel()?.provider ?? 'anthropic', model: getDefaultModel()?.model ?? 'claude-sonnet-5-5',
    skills: [], schedule: 'manual', engine: 'builtin', writeMode: 'ask', isMascot: false,
    projectId: getCurrentProject(), leadId: null, tools: { read: true, write: true }, channels: { telegram: false }, head: 'smile'
  })
  const [keys, setKeys] = useState<ProviderSettings | null>(null)
  const [engines, setEngines] = useState<EngineStatus[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [skillQ, setSkillQ] = useState('')
  const [test, setTest] = useState<AgentTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [created, setCreated] = useState<Agent | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.tyslin.settings.get().then(setKeys)
    void window.tyslin.engines.list().then(setEngines)
    void window.tyslin.skills.list().then(setSkills)
    void window.tyslin.settings.prefs().then((p) => setForm((f) => ({ ...f, writeMode: p.defaultWriteMode })))
  }, [])

  const set = <K extends keyof AgentInput>(k: K, v: AgentInput[K]): void => { setForm((f) => ({ ...f, [k]: v })); setTest(null) }
  const keySet = (p: ProviderId): boolean => p === 'ollama' || !!(keys && { anthropic: keys.anthropicKeySet, openai: keys.openaiKeySet, gemini: keys.geminiKeySet, openrouter: keys.openrouterKeySet }[p as 'anthropic'])
  const team = agents.filter((a) => a.kind === 'agent' && !a.isMascot && form.projectId && a.projectId === form.projectId)
  const shownSkills = useMemo(() => {
    const q = skillQ.toLowerCase()
    return [...skills]
      .filter((s) => !q || (s.name + ' ' + s.description).toLowerCase().includes(q))
      .sort((a, b) => Number(form.skills.includes(b.name)) - Number(form.skills.includes(a.name)))
      .slice(0, 60)
  }, [skills, skillQ, form.skills])

  const runTest = async (): Promise<void> => {
    setTesting(true)
    setTest(await window.tyslin.agents.test({ ...form, name: form.name.trim() || 'Agent' }))
    setTesting(false)
  }
  const create = async (): Promise<void> => {
    setError(null)
    try {
      const a = await window.tyslin.agents.save({ ...form, name: form.name.trim(), description: form.description.trim() })
      setCreated(a)
      onCreated(a)
    } catch (e) {
      setError(errorText(e))
    }
  }

  const canNext = step !== 0 || !!form.name.trim()
  const runsOnName = form.engine === 'builtin' ? `${MARKS[form.provider].label} · ${form.model}` : MARKS[form.engine as ExternalEngineId].label

  const sectionLabel = 'font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase'
  const hint = 'text-xs text-muted-foreground'
  const fieldCls = 'flex flex-col gap-1.5'
  const optionCard = (on: boolean): string => cn(
    'flex min-h-[104px] flex-col items-start gap-1.5 rounded-xl border-[1.5px] p-3 text-left text-foreground outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
    on ? 'border-primary bg-lime-soft' : 'border-border bg-card hover:bg-accent'
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[min(640px,calc(100%-48px))] w-[920px] max-w-[calc(100%-48px)] flex-col gap-0 overflow-hidden rounded-2xl bg-card p-0 sm:max-w-[calc(100%-48px)]">
        <DialogHeader className="h-14 flex-none flex-row items-center border-b border-border pr-14 pl-5 text-left">
          <DialogTitle className="text-base">New agent</DialogTitle>
          <DialogDescription className="sr-only">Create an agent in six short steps.</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1">
          <nav className="flex w-[210px] flex-none flex-col gap-1 border-r border-border bg-background px-2.5 py-3" aria-label="Steps">
            {STEPS.map((label, i) => {
              const on = i === step
              const done = i < step
              return (
                <button key={label} type="button" aria-current={on ? 'step' : undefined}
                  className={cn('flex min-h-11 items-center gap-2.5 rounded-[10px] px-2.5 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-default disabled:opacity-60',
                    on ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground hover:enabled:text-foreground')}
                  disabled={!!created || (i > 0 && !form.name.trim())} onClick={() => setStep(i)}>
                  <span className={cn('grid size-[22px] flex-none place-items-center rounded-full border font-mono text-[11px]',
                    on ? 'border-primary bg-primary text-primary-foreground' : done ? 'border-lime bg-lime text-on-lime' : 'border-border-strong bg-card')}>
                    {done ? <Icon name="check" size={12} /> : i + 1}
                  </span>{label}
                </button>
              )
            })}
          </nav>
          <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-[26px] py-[22px]">
            {step === 0 && (
              <>
                <div className="flex items-center gap-3.5">
                  <div className="flex size-[84px] flex-none items-center justify-center rounded-2xl bg-muted"><Avatar shape={form.shape} tone={form.tone} head={form.head} size={64} /></div>
                  <div className={cn(fieldCls, 'flex-1')}>
                    <Label htmlFor="ca-name">Name</Label>
                    <Input id="ca-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Pitch Coach" autoFocus />
                  </div>
                </div>
                <div className={fieldCls}>
                  <Label htmlFor="ca-job">One-line job</Label>
                  <Input id="ca-job" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What this agent does, in a sentence" />
                </div>
                <HeadPicker head={form.head ?? null} shape={form.shape} tone={form.tone}
                  onHead={(h) => set('head', h)} onShape={(v) => set('shape', v)} onTone={(v) => set('tone', v)} />
                <div className="flex items-center gap-3 rounded-xl border border-dashed border-border-strong px-3.5 py-3 text-[13px] text-muted-foreground">
                  <Avatar shape="round" tone="paper" mascot size={34} />
                  <span className="flex-1">Not sure what to write? Describe the job to Builder and it drafts the name, instructions and skills.</span>
                  <Button variant="outline" onClick={onAskBuilder}>Ask Builder</Button>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <span className={sectionLabel}>Tyslin models · your key</span>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5">
                  {MODELS.map((m) => {
                    const on = form.engine === 'builtin' && form.provider === m.id
                    const ready = keySet(m.id)
                    return (
                      <button key={m.id} type="button" className={optionCard(on)} aria-pressed={on}
                        onClick={() => setForm((f) => ({ ...f, engine: 'builtin', provider: m.id, model: f.provider === m.id ? f.model : MODEL_SUGGESTIONS[m.id][0] }))}>
                        <span className="flex items-center gap-2.5"><Mark id={m.id} size={26} /><strong className="text-sm">{MARKS[m.id].label}</strong></span>
                        <span className={hint}>{m.note}</span>
                        <Badge variant={ready ? 'soft' : 'outline'}>{m.id === 'ollama' ? 'Local' : ready ? 'Ready' : 'Add key in Settings'}</Badge>
                      </button>
                    )
                  })}
                </div>
                <span className={sectionLabel}>Agent engines · run an agent you install</span>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5">
                  {engines.map((e) => {
                    const on = form.engine === e.id
                    const ready = !!e.resolvedPath
                    return (
                      <button key={e.id} type="button" className={optionCard(on)} aria-pressed={on} onClick={() => set('engine', e.id)}>
                        <span className="flex items-center gap-2.5"><Mark id={e.id} size={26} /><strong className="text-sm">{e.name}</strong></span>
                        <span className={hint}>{e.description}</span>
                        <Badge variant={ready ? 'soft' : 'outline'}>{ready ? 'Installed' : e.id === 'custom' && !e.command ? 'Set up in Settings' : 'Install in Settings'}</Badge>
                      </button>
                    )
                  })}
                </div>
                {form.engine === 'builtin' && (
                  <div className={cn(fieldCls, 'max-w-[360px]')}>
                    <Label htmlFor="ca-model">Model</Label>
                    <Input id="ca-model" className="font-mono" list="ca-models" value={form.model} onChange={(e) => set('model', e.target.value)} />
                    <datalist id="ca-models">{MODEL_SUGGESTIONS[form.provider].map((m) => <option key={m} value={m} />)}</datalist>
                  </div>
                )}
              </>
            )}

            {step === 2 && (
              <div className={fieldCls}>
                <Label htmlFor="ca-ins">Instructions</Label>
                <Textarea id="ca-ins" className="font-mono" rows={13} value={form.instructions} onChange={(e) => set('instructions', e.target.value)}
                  placeholder="Describe the job, how the agent should work, and what a good result looks like." />
                <span className={hint}>Your guidelines for every agent (Settings → Agents) and its team in the project are added after these.</span>
              </div>
            )}

            {step === 3 && (
              <>
                <Input type="search" placeholder={`Search ${skills.length} skills`} aria-label="Search skills" value={skillQ} onChange={(e) => setSkillQ(e.target.value)} />
                <div className="flex flex-wrap items-center gap-2">
                  {shownSkills.map((s) => {
                    const on = form.skills.includes(s.name)
                    return (
                      <button key={s.id} type="button" title={s.description} aria-pressed={on}
                        className={cn('inline-flex h-8 items-center rounded-lg border px-3 font-mono text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                          on ? 'border-lime bg-lime text-on-lime' : 'border-border bg-card text-foreground hover:bg-accent')}
                        onClick={() => set('skills', on ? form.skills.filter((x) => x !== s.name) : [...form.skills, s.name])}>{s.name}</button>
                    )
                  })}
                </div>
                <span className={hint}>{form.skills.length} attached. Each attached skill is added to every message, so keep to the ones the job needs.</span>
              </>
            )}

            {step === 4 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className={fieldCls}>
                    <Label htmlFor="ca-proj">Project</Label>
                    <Select value={form.projectId ?? NONE} onValueChange={(v) => setForm((f) => ({ ...f, projectId: v === NONE ? null : v, leadId: null }))}>
                      <SelectTrigger id="ca-proj" className="h-10 w-full bg-card"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>No project yet</SelectItem>
                        {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <span className={hint}>An agent works in one project. Its chats open there.</span>
                  </div>
                  <div className={fieldCls}>
                    <Label htmlFor="ca-lead">Reports to</Label>
                    <Select value={form.leadId ?? NONE} disabled={!form.projectId} onValueChange={(v) => set('leadId', v === NONE ? null : v)}>
                      <SelectTrigger id="ca-lead" className="h-10 w-full bg-card"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>You</SelectItem>
                        {team.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <span className={hint}>Shown on the project's org chart.</span>
                  </div>
                </div>
                <span id="ca-write-label" className={sectionLabel}>File changes</span>
                <RadioGroup aria-labelledby="ca-write-label" className="grid-cols-2 gap-2.5" value={form.writeMode} onValueChange={(v) => set('writeMode', v as AgentInput['writeMode'])}>
                  {([['ask', 'Ask before writing', 'You review each change as a diff.'], ['direct', 'Write directly', 'Only for folders you can restore.']] as const).map(([m, title, desc]) => (
                    <label key={m} htmlFor={'ca-write-' + m}
                      className={cn('flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border-[1.5px] px-3.5 py-3 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40',
                        form.writeMode === m ? 'border-primary bg-lime-soft' : 'border-border bg-card')}>
                      <RadioGroupItem id={'ca-write-' + m} value={m} className="mt-0.5 bg-card" />
                      <span className="flex flex-col gap-0.5 text-sm"><strong>{title}</strong><span className={hint}>{desc}</span></span>
                    </label>
                  ))}
                </RadioGroup>
                <span className={sectionLabel}>What it can do in the project</span>
                <div className="grid grid-cols-2 gap-4">
                  <ToggleRow name="Read project files" desc="List and read files in its project folder." on={form.tools?.read ?? true}
                    onChange={(v) => set('tools', { read: v, write: v ? form.tools?.write ?? true : false })} />
                  <ToggleRow name="Change project files" desc={form.writeMode === 'ask' ? 'Each change waits for your review.' : 'Written straight to disk.'} on={form.tools?.write ?? true}
                    disabled={!(form.tools?.read ?? true)} onChange={(v) => set('tools', { read: form.tools?.read ?? true, write: v })} />
                </div>
                {form.engine !== 'builtin' && <span className={hint}>Agent engines can also run commands with their own tools; they ask you first, in chat or on Telegram.</span>}
              </>
            )}

            {step === 5 && (
              <>
                <div className="flex items-center gap-3.5 rounded-xl border border-border bg-card px-4 py-3.5">
                  <span className="grid size-10 flex-none place-items-center rounded-full bg-muted" aria-hidden="true"><Icon name="play" size={14} /></span>
                  <div className="min-w-0 flex-1">
                    <strong className="text-sm">Test {form.name.trim() || 'your agent'}</strong>
                    <div className={cn(hint, '[overflow-wrap:anywhere]')}>{test ? (test.ok ? `Answered in ${(test.ms / 1000).toFixed(1)} s: ${test.detail}` : test.detail) : `Sends one short message to ${runsOnName}.`}</div>
                  </div>
                  {test && <span className={cn('text-[13px]', test.ok ? 'text-green' : 'text-destructive')}>{test.ok ? 'Working' : 'Failed'}</span>}
                  <Button variant="outline" onClick={() => void runTest()} disabled={testing}>{testing ? 'Testing…' : test ? 'Test again' : 'Run test'}</Button>
                </div>
                {created ? (
                  <div className="flex flex-col gap-3 rounded-[14px] border border-green bg-lime-soft px-[18px] py-4">
                    <strong className="text-base">{created.name} is ready</strong>
                    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm [&>span:nth-child(odd)]:text-muted-foreground">
                      <span>Runs on</span><span>{runsOnName}</span>
                      <span>Project</span><span>{projects.find((p) => p.id === created.projectId)?.name ?? 'No project yet'}{created.leadId ? ` · reports to ${agents.find((a) => a.id === created.leadId)?.name}` : ' · reports to You'}</span>
                      <span>Skills</span><span>{created.skills.length} attached</span>
                      <span>File changes</span><span>{created.writeMode === 'ask' ? 'Ask before writing' : 'Write directly'}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="lime" onClick={() => onChat(created)}>Start a chat</Button>
                      <Button variant="outline" onClick={() => onTask(created)}>Give it a task</Button>
                      <Button variant="outline" onClick={() => onOpen(created)}>Open agent page</Button>
                    </div>
                  </div>
                ) : (
                  <p className={hint}>You can create it without a test and set up keys or engines later; it will show "Needs setup" until then.</p>
                )}
                {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
              </>
            )}
          </div>
        </div>
        <DialogFooter className="h-16 flex-none flex-row items-center justify-between border-t border-border px-5 sm:justify-between">
          <Button variant="outline" onClick={onClose}>{created ? 'Close' : 'Cancel'}</Button>
          {!created && (
            <div className="flex items-center gap-2">
              {step > 0 && <Button variant="outline" onClick={() => setStep(step - 1)}>Back</Button>}
              {step < STEPS.length - 1
                ? <Button disabled={!canNext} onClick={() => setStep(step + 1)}>{step === 4 ? 'Test & finish' : 'Next'}</Button>
                : <Button disabled={!form.name.trim()} onClick={() => void create()}>Create agent</Button>}
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ToggleRow({ name, desc, on, disabled, onChange }: { name: string; desc: string; on: boolean; disabled?: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5">
      <span className="flex min-w-0 flex-col gap-0.5 text-sm"><strong>{name}</strong><span className="text-xs text-muted-foreground">{desc}</span></span>
      <Switch checked={on} aria-label={name} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}
