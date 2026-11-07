import { useEffect, useMemo, useState } from 'react'
import type { Agent, AgentTestResult, DashboardStats, EngineId, EngineStatus, Preferences, Project, ProviderId, ScheduledTask, Session, Skill, TelegramStatus } from '@shared/types'
import { describeSchedule } from '@shared/schedule'
import { refreshStatuses, useAgentStatuses } from '../agentStatus'
import { Avatar } from '../components/Avatar'
import { HeadPicker } from '../components/HeadPicker'
import { Icon } from '../components/Icon'
import { RunsOnBadge, runsOnLabel } from '../components/RunsOnBadge'
import { StatusPill } from '../components/StatusPill'
import { MODEL_SUGGESTIONS } from '@shared/models'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type Section = 'overview' | 'instructions' | 'skills' | 'runs' | 'access' | 'channels' | 'tasks' | 'activity'

interface Props {
  agentId: string
  agents: Agent[]
  projects: Project[]
  sessions: Session[]
  onBack: () => void
  onChat: (a: Agent) => void
  onTask: (a: Agent) => void
  onOpenChat: (agentId: string, projectId: string | null, sessionId?: string) => void
  onOrgChart: () => void
  onConnectors: () => void
  /** Shown inside an agency (its sidebar is on screen): the sections become tabs above the page. */
  inAgency?: boolean
  onChanged: () => void
  onDeleted: () => void
}

const when = (t: number): string => new Date(t).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))

const HINT = 'text-[13px] leading-snug text-muted-foreground'
const SECTION_LABEL = 'font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground'
const SELECT = 'w-full min-w-0 bg-card'
/** Radix Select can't use an empty value; this stands for "none" (no project, reports to you). */
const NONE = '__none__'
const LI = 'flex min-h-10 w-full items-center gap-2.5 border-t border-border py-2 text-left text-[13px] text-foreground first:border-t-0'
const LI_RIGHT = 'ml-auto whitespace-nowrap font-mono text-xs text-muted-foreground'

/** One card per group of settings. */
function Box({ title, action, className, children }: { title?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }): JSX.Element {
  return (
    <Card className={cn('gap-3 px-5 py-4', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3">
          {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </Card>
  )
}

/** Label above its field. */
function Field({ id, label, className, children }: { id: string; label: string; className?: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

/** A named setting with a switch on the right. */
function SwitchRow({ name, desc, on, disabled, onChange }: { name: string; desc: string; on: boolean; disabled?: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <div className={cn('flex min-h-11 items-center gap-4 rounded-lg border border-border bg-card px-4 py-2.5', disabled && 'opacity-60')}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <strong className="text-sm font-medium">{name}</strong>
        <span className={HINT}>{desc}</span>
      </span>
      <Switch checked={on} disabled={disabled} aria-label={name} onCheckedChange={onChange} />
    </div>
  )
}

/** An agent's page: status and actions on top, sections on the left, one Save bar for edits. */
export function AgentPage({ agentId, agents, projects, sessions, onBack, onChat, onTask, onOpenChat, onOrgChart, onConnectors, inAgency, onChanged, onDeleted }: Props): JSX.Element {
  const saved = agents.find((a) => a.id === agentId)
  const [form, setForm] = useState<Agent | null>(saved ?? null)
  const [section, setSection] = useState<Section>('overview')
  const [skills, setSkills] = useState<Skill[]>([])
  const [skillQ, setSkillQ] = useState('')
  const [engines, setEngines] = useState<EngineStatus[]>([])
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [reviews, setReviews] = useState<DashboardStats['reviews']>([])
  const [telegram, setTelegram] = useState<TelegramStatus | null>(null)
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [test, setTest] = useState<AgentTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const statuses = useAgentStatuses()

  useEffect(() => { setForm(saved ?? null) }, [saved?.updatedAt, agentId])
  useEffect(() => {
    void window.tyslin.skills.list().then(setSkills)
    void window.tyslin.engines.list().then(setEngines)
    void window.tyslin.tasks.list().then((t) => setTasks(t.filter((x) => x.agentId === agentId)))
    void window.tyslin.app.dashboard().then((d) => setReviews(d.reviews.filter((r) => r.agentId === agentId)))
    void window.tyslin.telegram.status().then(setTelegram)
    void window.tyslin.settings.prefs().then(setPrefs)
  }, [agentId])

  const dirty = !!saved && !!form && JSON.stringify({ ...saved, updatedAt: 0 }) !== JSON.stringify({ ...form, updatedAt: 0 })
  const shownSkills = useMemo(() => {
    if (!form) return []
    const q = skillQ.toLowerCase()
    return [...skills].filter((s) => !q || (s.name + ' ' + s.description).toLowerCase().includes(q))
      .sort((a, b) => Number(form.skills.includes(b.name)) - Number(form.skills.includes(a.name))).slice(0, 80)
  }, [skills, skillQ, form])

  if (!saved || !form) return <div className="p-8"><p className="text-base text-muted-foreground">This agent no longer exists.</p></div>

  const set = <K extends keyof Agent>(k: K, v: Agent[K]): void => setForm({ ...form, [k]: v })
  const project = projects.find((p) => p.id === saved.projectId) ?? null
  const lead = agents.find((a) => a.id === saved.leadId) ?? null
  const team = agents.filter((a) => a.leadId === saved.id && a.projectId === saved.projectId)
  const projectTeam = agents.filter((a) => a.kind === 'agent' && !a.isMascot && form.projectId && a.projectId === form.projectId && a.id !== form.id)
  const chats = sessions.filter((s) => s.agentId === saved.id)
  const inProject = !saved.isMascot

  const save = async (patch?: Partial<Agent>): Promise<void> => {
    setError(null)
    try {
      await window.tyslin.agents.save({ ...(patch ? saved : form), ...patch })
      onChanged()
      refreshStatuses()
    } catch (e) {
      setError(errorText(e))
    }
  }
  const remove = async (): Promise<void> => {
    if (!window.confirm(`Delete ${saved.name}? Its chats and scheduled tasks are deleted too.`)) return
    await window.tyslin.agents.remove(saved.id)
    onDeleted()
  }
  const runTest = async (): Promise<void> => {
    setTesting(true)
    setTest(await window.tyslin.agents.test(form))
    setTesting(false)
  }

  const NAV: [string, [Section, string, string?][]][] = [
    ['Agent', [['overview', 'Overview'], ['instructions', 'Look & instructions'], ['skills', 'Skills', String(form.skills.length)]]],
    ['How it runs', [['runs', 'Runs on'], ['access', 'Project & access'], ['channels', 'Channels', form.channels.telegram ? '1' : '']]],
    ['Work', [['tasks', 'Tasks', String(tasks.length || '')], ['activity', 'Activity']]]
  ]

  const backButton = (
    <Button variant="outline" size="sm" className="self-start" onClick={onBack}><Icon name="back" size={12} /> {inAgency ? 'Back' : 'Agents'}</Button>
  )

  return (
    <div className={cn('flex h-full min-h-0 text-foreground', inAgency ? 'flex-col' : 'flex-row')}>
      {!inAgency && (
        <nav className="flex w-[220px] flex-none flex-col gap-1.5 overflow-y-auto border-r border-border px-3 py-4" aria-label="Agent sections">
          <div className="mb-2">{backButton}</div>
          {NAV.map(([group, items]) => (
            <div key={group} className="flex flex-col gap-0.5">
              <span className={cn(SECTION_LABEL, 'px-2.5 pt-2.5 pb-1')}>{group}</span>
              {items.map(([id, label, count]) => (
                <button key={id} type="button" aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}
                  className={cn('flex min-h-10 items-center gap-2.5 rounded-lg border px-2.5 text-left text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
                    section === id ? 'border-border bg-card font-semibold text-foreground shadow-xs' : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground')}>
                  {label}{count ? <span className="ml-auto font-mono text-[11px]">{count}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-[18px] overflow-y-auto px-8 py-6">
          {inAgency && backButton}
          <header className="flex flex-wrap items-center gap-4">
            <div className="grid size-[72px] flex-none place-items-center rounded-2xl bg-panel">
              <Avatar shape={saved.shape} tone={saved.tone} head={saved.head} mascot={saved.isMascot} size={60} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{saved.name}</h1>
                <StatusPill status={statuses.get(saved.id)} />
              </span>
              {saved.description && <p className="text-sm text-muted-foreground">{saved.description}</p>}
              <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                <RunsOnBadge agent={saved} size={18} />
                <span className="font-mono">{saved.engine === 'builtin' ? `${runsOnLabel(saved)} · ${saved.model}` : runsOnLabel(saved)}</span>
                <span aria-hidden="true">·</span>{saved.isMascot ? 'Every project' : project?.name ?? 'No project yet'}
                {inProject && <><span aria-hidden="true">·</span>Reports to {lead?.name ?? 'You'}</>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="lime" onClick={() => onChat(saved)} disabled={saved.paused}><Icon name="chat" size={14} /> Chat</Button>
              <Button variant="outline" onClick={() => onTask(saved)}><Icon name="plus" size={12} /> Give it a task</Button>
              <Button variant="outline" onClick={() => void save({ paused: !saved.paused })}><Icon name={saved.paused ? 'play' : 'pause'} size={13} /> {saved.paused ? 'Resume' : 'Pause'}</Button>
              {!saved.isMascot && <Button variant="outline" onClick={() => void remove()}><Icon name="trash" size={13} /> Delete</Button>}
            </div>
          </header>
          {saved.paused && <p className={HINT}>Paused: it won't chat, answer on Telegram or run its tasks until you resume it.</p>}
          {error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}

          {inAgency && (
            <TabsList aria-label="Agent sections" className="h-auto flex-wrap self-start">
              {NAV.flatMap(([, items]) => items).map(([id, label, count]) => (
                <TabsTrigger key={id} active={section === id} onClick={() => setSection(id)} className="h-[30px] flex-none">
                  {label}{count ? <Badge variant="secondary" className="h-[18px] px-1.5 font-mono">{count}</Badge> : null}
                </TabsTrigger>
              ))}
            </TabsList>
          )}

          {section === 'overview' && (
            <>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Box title="Team">
                  {inProject ? (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-sm">
                      <dt className="text-muted-foreground">Project</dt><dd>{project?.name ?? 'No project yet'}</dd>
                      <dt className="text-muted-foreground">Reports to</dt><dd>{lead?.name ?? 'You'}</dd>
                      <dt className="text-muted-foreground">Leads</dt><dd>{team.length ? team.map((a) => a.name).join(', ') : 'Nobody yet'}</dd>
                    </dl>
                  ) : <p className={HINT}>Builder helps in every project and stays off the org charts.</p>}
                  {inProject && (
                    <div className="flex flex-wrap gap-4">
                      <Button variant="link" className="h-auto p-0" onClick={onOrgChart}>Open the org chart</Button>
                      <Button variant="link" className="h-auto p-0" onClick={() => setSection('access')}>Move to another project</Button>
                    </div>
                  )}
                </Box>
                <Box title="Runs on">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-sm">
                    <dt className="text-muted-foreground">{saved.engine === 'builtin' ? 'Model' : 'Engine'}</dt>
                    <dd className="font-mono text-[13px]">{saved.engine === 'builtin' ? `${runsOnLabel(saved)} · ${saved.model}` : runsOnLabel(saved)}</dd>
                    <dt className="text-muted-foreground">Status</dt><dd>{statuses.get(saved.id)?.reason ?? '…'}</dd>
                  </dl>
                  <Button variant="link" className="h-auto self-start p-0" onClick={() => setSection('runs')}>Test or change</Button>
                </Box>
                <Box title="Waiting for you">
                  {reviews.length ? (
                    <div>
                      {reviews.map((r) => (
                        <div key={r.sessionId} className={LI}>{r.count} {r.count === 1 ? 'file change' : 'file changes'} in "{r.title}"
                          <Button variant="outline" size="sm" className="ml-auto" onClick={() => onOpenChat(r.agentId, r.projectId, r.sessionId)}>Review</Button></div>
                      ))}
                    </div>
                  ) : <p className={HINT}>Nothing to review.</p>}
                </Box>
                <Box title="Next tasks">
                  {tasks.some((t) => t.enabled && t.nextRunAt) && (
                    <div>
                      {tasks.filter((t) => t.enabled && t.nextRunAt).slice(0, 4).map((t) => (
                        <div key={t.id} className={LI}>{t.name}<span className={LI_RIGHT}>{when(t.nextRunAt!)}</span></div>
                      ))}
                    </div>
                  )}
                  {!tasks.some((t) => t.enabled) && <p className={HINT}>No scheduled tasks. <Button variant="link" className="h-auto p-0 text-[13px]" onClick={() => onTask(saved)}>Give it one</Button></p>}
                </Box>
              </div>
              <Box title="Recent chats">
                {chats.length > 0 && (
                  <div>
                    {chats.slice(0, 5).map((s) => (
                      <button key={s.id} type="button" className={cn(LI, 'cursor-pointer outline-none hover:text-green focus-visible:text-green')} onClick={() => onOpenChat(s.agentId, s.projectId, s.id)}>{s.title}<span className={LI_RIGHT}>{when(s.updatedAt)}</span></button>
                    ))}
                  </div>
                )}
                {!chats.length && <p className={HINT}>No chats yet.</p>}
              </Box>
            </>
          )}

          {section === 'instructions' && (
            <>
              {!saved.isMascot && (
                <Box title="Look">
                  <HeadPicker head={form.head} shape={form.shape} tone={form.tone}
                    onHead={(h) => set('head', h)} onShape={(v) => set('shape', v)} onTone={(v) => set('tone', v)} />
                </Box>
              )}
              <Box title="Job and instructions">
                <div className="flex flex-col gap-3.5">
                  <Field id="ap-desc" label="One-line job">
                    <Input id="ap-desc" value={form.description} onChange={(e) => set('description', e.target.value)} />
                  </Field>
                  <Field id="ap-ins" label="Instructions">
                    <Textarea id="ap-ins" className="font-mono text-[13px]" rows={14} value={form.instructions} onChange={(e) => set('instructions', e.target.value)} />
                  </Field>
                </div>
              </Box>
              <Card className="gap-1.5 bg-panel px-5 py-4 shadow-none">
                <span className={SECTION_LABEL}>Added automatically</span>
                <span className={HINT}>
                  {inProject ? `Reports to ${lead?.name ?? 'you'}.${team.length ? ` Team in ${project?.name}: ${team.map((a) => `${a.name} (${a.description || 'agent'})`).join(', ')}.` : ''} ` : ''}
                  {prefs?.sharedInstructions ? 'Your guidelines for every agent (Settings → Agents).' : 'No shared guidelines set (Settings → Agents).'} Attached skills follow.
                </span>
              </Card>
            </>
          )}

          {section === 'skills' && (
            <Box title="Skills" action={<span className={SECTION_LABEL}>On for {saved.name} · {form.skills.length}</span>}>
              <Input type="search" placeholder={`Search ${skills.length} skills`} aria-label="Search skills" value={skillQ} onChange={(e) => setSkillQ(e.target.value)} />
              <div className="flex flex-col gap-2">
                {shownSkills.map((s) => (
                  <SwitchRow key={s.id} name={s.name} desc={s.description} on={form.skills.includes(s.name)}
                    onChange={(v) => set('skills', v ? [...form.skills, s.name] : form.skills.filter((x) => x !== s.name))} />
                ))}
              </div>
            </Box>
          )}

          {section === 'runs' && (
            <>
              <Box title="Runs on">
                <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                  <Field id="ap-engine" label="Runs on">
                    <Select value={form.engine} onValueChange={(v) => set('engine', v as EngineId)}>
                      <SelectTrigger id="ap-engine" className={SELECT}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="builtin">Tyslin (a model with your key)</SelectItem>
                        {engines.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}{e.resolvedPath ? '' : ' (not installed)'}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  {form.engine === 'builtin' && (
                    <Field id="ap-prov" label="Provider">
                      <Select value={form.provider} onValueChange={(v) => { const p = v as ProviderId; setForm({ ...form, provider: p, model: MODEL_SUGGESTIONS[p][0] }) }}>
                        <SelectTrigger id="ap-prov" className={SELECT}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="anthropic">Anthropic (Claude)</SelectItem><SelectItem value="openai">OpenAI</SelectItem><SelectItem value="gemini">Google Gemini</SelectItem><SelectItem value="ollama">Ollama (local)</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                  {form.engine === 'builtin' && (
                    <Field id="ap-model" label="Model">
                      <Input id="ap-model" className="font-mono" list="ap-models" value={form.model} onChange={(e) => set('model', e.target.value)} />
                      <datalist id="ap-models">{MODEL_SUGGESTIONS[form.provider].map((m) => <option key={m} value={m} />)}</datalist>
                    </Field>
                  )}
                </div>
              </Box>
              <Box title="Test">
                <span className={HINT}>{test ? (test.ok ? `Answered in ${(test.ms / 1000).toFixed(1)} s: ${test.detail}` : test.detail) : 'Sends one short message (or checks the engine starts) with the settings above.'}</span>
                <Button variant="outline" className="self-start" onClick={() => void runTest()} disabled={testing}>{testing ? 'Testing…' : 'Run test'}</Button>
              </Box>
            </>
          )}

          {section === 'access' && (
            <>
              <Box title="Project">
                {inProject ? (
                  <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                    <Field id="ap-proj" label="Project">
                      <Select value={form.projectId ?? NONE} onValueChange={(v) => setForm({ ...form, projectId: v === NONE ? null : v, leadId: null })}>
                        <SelectTrigger id="ap-proj" className={SELECT}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>No project yet</SelectItem>
                          {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <span className={HINT}>An agent works in one project. Moving it leaves its team behind, reporting to you.</span>
                    </Field>
                    <Field id="ap-lead" label="Reports to">
                      <Select value={form.leadId ?? NONE} disabled={!form.projectId} onValueChange={(v) => set('leadId', v === NONE ? null : v)}>
                        <SelectTrigger id="ap-lead" className={SELECT}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>You</SelectItem>
                          {projectTeam.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                ) : <p className={HINT}>Builder helps in every project; pick the project when you chat.</p>}
              </Box>
              <Box title="File changes">
                <RadioGroup aria-label="File changes" value={form.writeMode} onValueChange={(v) => set('writeMode', v as Agent['writeMode'])} className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {([['ask', 'Ask before writing', 'You review each change as a diff.'], ['direct', 'Write directly', 'Only for folders you can restore.']] as const).map(([m, title, hint]) => (
                    <Label key={m} htmlFor={`ap-write-${m}`}
                      className={cn('flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border bg-card p-4 font-normal shadow-xs transition-[border-color,box-shadow] has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40',
                        form.writeMode === m ? 'border-foreground ring-1 ring-foreground' : 'border-border hover:border-border-strong')}>
                      <RadioGroupItem id={`ap-write-${m}`} value={m} className="mt-0.5" />
                      <span className="flex flex-col gap-2">
                        <strong className="text-sm font-semibold">{title}</strong>
                        <span className={HINT}>{hint}</span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  <SwitchRow name="Read project files" desc="List and read files in its project folder." on={form.tools.read} onChange={(v) => set('tools', { read: v, write: v && form.tools.write })} />
                  <SwitchRow name="Change project files" desc={form.writeMode === 'ask' ? 'Each change waits for your review.' : 'Written straight to disk.'} on={form.tools.write} disabled={!form.tools.read} onChange={(v) => set('tools', { ...form.tools, write: v })} />
                </div>
              </Box>
            </>
          )}

          {section === 'channels' && (
            <>
              <Box title={`Where you can reach ${saved.name}`} action={<Button variant="outline" size="sm" onClick={onConnectors}>Manage channels</Button>}>
                <div className="flex items-center gap-3 rounded-lg border border-border bg-panel px-3.5 py-3">
                  <span className="grid size-9 flex-none place-items-center rounded-lg bg-card text-muted-foreground" aria-hidden="true"><Icon name="chat" size={18} /></span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <strong className="text-sm font-medium">Telegram</strong>
                    <span className={HINT}>{telegram?.connected ? `Bot ${telegram.botName ? '@' + telegram.botName : ''} · ${telegram.linked.length} linked ${telegram.linked.length === 1 ? 'account' : 'accounts'}` : 'Not connected yet'}</span>
                  </span>
                  {telegram?.connected ? <Badge variant="soft">Connected</Badge> : <Button variant="outline" size="sm" onClick={onConnectors}>Connect</Button>}
                </div>
                <SwitchRow name={`${saved.name} answers on Telegram`} desc={`Message it there, or switch to it with /${saved.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.`}
                  on={form.channels.telegram} disabled={!telegram?.connected} onChange={(v) => set('channels', { ...form.channels, telegram: v })} />
              </Box>
              <p className={HINT}>Slack and Discord are coming soon; WhatsApp needs the hosted plan. Task results and file approvals for Telegram are set in Connectors.</p>
            </>
          )}

          {section === 'tasks' && (
            <Box title={`Scheduled tasks for ${saved.name}`} action={<Button size="sm" onClick={() => onTask(saved)}><Icon name="plus" size={12} /> New task</Button>}>
              {tasks.length ? (
                <div>
                  {tasks.map((t) => (
                    <div key={t.id} className={LI}><strong className="font-medium">{t.name}</strong><span className={HINT}>{describeSchedule(t.schedule)}{t.enabled ? '' : ' · paused'}</span>
                      <span className={LI_RIGHT}>{t.enabled && t.nextRunAt ? `Next ${when(t.nextRunAt)}` : '—'}</span></div>
                  ))}
                </div>
              ) : <p className={HINT}>No tasks yet.</p>}
            </Box>
          )}

          {section === 'activity' && (
            <Box title="Activity">
              {(chats.length > 0 || tasks.some((t) => t.lastRunAt)) && (
                <div>
                  {chats.map((s) => (
                    <button key={s.id} type="button" className={cn(LI, 'cursor-pointer outline-none hover:text-green focus-visible:text-green')} onClick={() => onOpenChat(s.agentId, s.projectId, s.id)}>{s.title}
                      <span className={HINT}>{projects.find((p) => p.id === s.projectId)?.name ?? ''}</span><span className={LI_RIGHT}>{when(s.updatedAt)}</span></button>
                  ))}
                  {tasks.filter((t) => t.lastRunAt).map((t) => (
                    <div key={'t' + t.id} className={LI}><span className={t.lastStatus === 'error' ? 'text-destructive' : 'text-green'}>{t.lastStatus === 'error' ? '!' : '✓'}</span>{t.name} (task)
                      <span className={HINT}>{t.lastStatus === 'error' ? t.lastError : t.lastStatus}</span><span className={LI_RIGHT}>{when(t.lastRunAt!)}</span></div>
                  ))}
                </div>
              )}
              {!chats.length && !tasks.some((t) => t.lastRunAt) && <p className={HINT}>No activity yet.</p>}
              <span className={HINT}>Tokens and cost per run arrive with the cost ledger.</span>
            </Box>
          )}
        </div>
        {dirty && (
          <div className="flex h-[60px] flex-none items-center justify-between gap-3 border-t border-border bg-card px-8">
            <span className={HINT}>You have unsaved changes.</span>
            <div className="flex gap-2"><Button variant="outline" onClick={() => setForm(saved)}>Discard</Button><Button onClick={() => void save()}>Save</Button></div>
          </div>
        )}
      </div>
    </div>
  )
}
