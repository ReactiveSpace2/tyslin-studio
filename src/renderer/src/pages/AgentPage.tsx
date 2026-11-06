import { useEffect, useMemo, useState } from 'react'
import type { Agent, AgentTestResult, DashboardStats, EngineId, EngineStatus, Preferences, Project, ProviderId, ScheduledTask, Session, Skill, TelegramStatus } from '@shared/types'
import { describeSchedule } from '@shared/schedule'
import { refreshStatuses, useAgentStatuses } from '../agentStatus'
import { Avatar } from '../components/Avatar'
import { ToggleRow } from '../components/CreateAgentModal'
import { HeadPicker } from '../components/HeadPicker'
import { Icon } from '../components/Icon'
import { RunsOnBadge, runsOnLabel } from '../components/RunsOnBadge'
import { StatusPill } from '../components/StatusPill'
import { MODEL_SUGGESTIONS } from '@shared/models'

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

  if (!saved || !form) return <div className="page"><p className="lead">This agent no longer exists.</p></div>

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

  return (
    <div className={'agent-page' + (inAgency ? ' in-agency' : '')}>
      <nav className="ap-nav" aria-label="Agent sections">
        <button type="button" className="btn btn-sm ap-back" onClick={onBack}><Icon name="back" size={12} /> {inAgency ? 'Back' : 'Agents'}</button>
        {NAV.map(([group, items]) => (
          <div key={group} className="ap-group">
            <span className="section-label">{group}</span>
            {items.map(([id, label, count]) => (
              <button key={id} type="button" className={'ap-item' + (section === id ? ' on' : '')} aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}>
                {label}{count ? <span className="c">{count}</span> : null}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="ap-main">
        <div className="ap-scroll">
          <header className="ap-head">
            <div className="ap-avatar"><Avatar shape={saved.shape} tone={saved.tone} head={saved.head} mascot={saved.isMascot} size={68} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1>{saved.name}</h1>
              <p className="ap-meta">{saved.description}</p>
              <p className="ap-meta">
                <RunsOnBadge agent={saved} size={18} /> {saved.engine === 'builtin' ? `${runsOnLabel(saved)} · ${saved.model}` : runsOnLabel(saved)}
                <span>·</span>{saved.isMascot ? 'Every project' : project?.name ?? 'No project yet'}
                {inProject && <><span>·</span>Reports to {lead?.name ?? 'You'}</>}
                <StatusPill status={statuses.get(saved.id)} />
              </p>
            </div>
          </header>
          <div className="row">
            <button type="button" className="btn btn-lime" onClick={() => onChat(saved)} disabled={saved.paused}><Icon name="chat" size={14} /> Chat</button>
            <button type="button" className="btn" onClick={() => onTask(saved)}><Icon name="plus" size={12} /> Give it a task</button>
            <button type="button" className="btn" onClick={() => void save({ paused: !saved.paused })}><Icon name={saved.paused ? 'play' : 'pause'} size={13} /> {saved.paused ? 'Resume' : 'Pause'}</button>
            {!saved.isMascot && <button type="button" className="btn" onClick={() => void remove()}><Icon name="trash" size={13} /> Delete</button>}
          </div>
          {saved.paused && <p className="hint">Paused: it won't chat, answer on Telegram or run its tasks until you resume it.</p>}
          {error && <p className="hint account-error" role="alert">{error}</p>}

          {section === 'overview' && (
            <>
              <div className="two">
                <section className="box">
                  <h2>Team</h2>
                  {inProject ? (
                    <div className="kv">
                      <span>Project</span><span>{project?.name ?? 'No project yet'}</span>
                      <span>Reports to</span><span>{lead?.name ?? 'You'}</span>
                      <span>Leads</span><span>{team.length ? team.map((a) => a.name).join(', ') : 'Nobody yet'}</span>
                    </div>
                  ) : <p className="hint">Builder helps in every project and stays off the org charts.</p>}
                  {inProject && <div className="row" style={{ gap: 14 }}><button type="button" className="link-btn" onClick={onOrgChart}>Open the org chart</button><button type="button" className="link-btn" onClick={() => setSection('access')}>Move to another project</button></div>}
                </section>
                <section className="box">
                  <h2>Runs on</h2>
                  <div className="kv">
                    <span>{saved.engine === 'builtin' ? 'Model' : 'Engine'}</span><span>{saved.engine === 'builtin' ? `${runsOnLabel(saved)} · ${saved.model}` : runsOnLabel(saved)}</span>
                    <span>Status</span><span>{statuses.get(saved.id)?.reason ?? '…'}</span>
                  </div>
                  <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setSection('runs')}>Test or change</button>
                </section>
                <section className="box">
                  <h2>Waiting for you</h2>
                  {reviews.length ? reviews.map((r) => (
                    <div key={r.sessionId} className="ap-li">{r.count} {r.count === 1 ? 'file change' : 'file changes'} in "{r.title}"
                      <button type="button" className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => onOpenChat(r.agentId, r.projectId, r.sessionId)}>Review</button></div>
                  )) : <p className="hint">Nothing to review.</p>}
                </section>
                <section className="box">
                  <h2>Next tasks</h2>
                  {tasks.filter((t) => t.enabled && t.nextRunAt).slice(0, 4).map((t) => (
                    <div key={t.id} className="ap-li">{t.name}<span className="r">{when(t.nextRunAt!)}</span></div>
                  ))}
                  {!tasks.some((t) => t.enabled) && <p className="hint">No scheduled tasks. <button type="button" className="link-btn" onClick={() => onTask(saved)}>Give it one</button></p>}
                </section>
              </div>
              <section className="box">
                <h2>Recent chats</h2>
                {chats.slice(0, 5).map((s) => (
                  <button key={s.id} type="button" className="ap-li ap-btn" onClick={() => onOpenChat(s.agentId, s.projectId, s.id)}>{s.title}<span className="r">{when(s.updatedAt)}</span></button>
                ))}
                {!chats.length && <p className="hint">No chats yet.</p>}
              </section>
            </>
          )}

          {section === 'instructions' && (
            <>
              {!saved.isMascot && (
                <HeadPicker head={form.head} shape={form.shape} tone={form.tone}
                  onHead={(h) => set('head', h)} onShape={(v) => set('shape', v)} onTone={(v) => set('tone', v)} />
              )}
              <div className="field">
                <label htmlFor="ap-desc">One-line job</label>
                <input id="ap-desc" className="input" value={form.description} onChange={(e) => set('description', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="ap-ins">Instructions</label>
                <textarea id="ap-ins" className="textarea mono" rows={14} value={form.instructions} onChange={(e) => set('instructions', e.target.value)} />
              </div>
              <section className="box" style={{ background: 'var(--panel)' }}>
                <span className="section-label" style={{ padding: 0 }}>Added automatically</span>
                <span className="hint">
                  {inProject ? `Reports to ${lead?.name ?? 'you'}.${team.length ? ` Team in ${project?.name}: ${team.map((a) => `${a.name} (${a.description || 'agent'})`).join(', ')}.` : ''} ` : ''}
                  {prefs?.sharedInstructions ? 'Your guidelines for every agent (Settings → Agents).' : 'No shared guidelines set (Settings → Agents).'} Attached skills follow.
                </span>
              </section>
            </>
          )}

          {section === 'skills' && (
            <>
              <input className="input" type="search" placeholder={`Search ${skills.length} skills`} aria-label="Search skills" value={skillQ} onChange={(e) => setSkillQ(e.target.value)} />
              <span className="section-label" style={{ padding: 0 }}>On for {saved.name} · {form.skills.length}</span>
              <div className="ap-list">
                {shownSkills.map((s) => (
                  <ToggleRow key={s.id} name={s.name} desc={s.description} on={form.skills.includes(s.name)}
                    onChange={(v) => set('skills', v ? [...form.skills, s.name] : form.skills.filter((x) => x !== s.name))} />
                ))}
              </div>
            </>
          )}

          {section === 'runs' && (
            <>
              <div className="two">
                <div className="field">
                  <label htmlFor="ap-engine">Runs on</label>
                  <select id="ap-engine" className="select" value={form.engine} onChange={(e) => set('engine', e.target.value as EngineId)}>
                    <option value="builtin">Tyslin (a model with your key)</option>
                    {engines.map((e) => <option key={e.id} value={e.id}>{e.name}{e.resolvedPath ? '' : ' (not installed)'}</option>)}
                  </select>
                </div>
                {form.engine === 'builtin' && (
                  <div className="field">
                    <label htmlFor="ap-prov">Provider</label>
                    <select id="ap-prov" className="select" value={form.provider} onChange={(e) => { const p = e.target.value as ProviderId; setForm({ ...form, provider: p, model: MODEL_SUGGESTIONS[p][0] }) }}>
                      <option value="anthropic">Anthropic (Claude)</option><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option><option value="ollama">Ollama (local)</option>
                    </select>
                  </div>
                )}
              </div>
              {form.engine === 'builtin' && (
                <div className="field" style={{ maxWidth: 360 }}>
                  <label htmlFor="ap-model">Model</label>
                  <input id="ap-model" className="input mono" list="ap-models" value={form.model} onChange={(e) => set('model', e.target.value)} />
                  <datalist id="ap-models">{MODEL_SUGGESTIONS[form.provider].map((m) => <option key={m} value={m} />)}</datalist>
                </div>
              )}
              <section className="box">
                <h2>Test</h2>
                <span className="hint">{test ? (test.ok ? `Answered in ${(test.ms / 1000).toFixed(1)} s: ${test.detail}` : test.detail) : 'Sends one short message (or checks the engine starts) with the settings above.'}</span>
                <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => void runTest()} disabled={testing}>{testing ? 'Testing…' : 'Run test'}</button>
              </section>
            </>
          )}

          {section === 'access' && (
            <>
              {inProject ? (
                <div className="two">
                  <div className="field">
                    <label htmlFor="ap-proj">Project</label>
                    <select id="ap-proj" className="select" value={form.projectId ?? ''} onChange={(e) => setForm({ ...form, projectId: e.target.value || null, leadId: null })}>
                      <option value="">No project yet</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <span className="hint">An agent works in one project. Moving it leaves its team behind, reporting to you.</span>
                  </div>
                  <div className="field">
                    <label htmlFor="ap-lead">Reports to</label>
                    <select id="ap-lead" className="select" value={form.leadId ?? ''} disabled={!form.projectId} onChange={(e) => set('leadId', e.target.value || null)}>
                      <option value="">You</option>
                      {projectTeam.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                </div>
              ) : <p className="hint">Builder helps in every project; pick the project when you chat.</p>}
              <span className="section-label" style={{ padding: 0 }}>File changes</span>
              <div className="choices">
                {([['ask', 'Ask before writing', 'You review each change as a diff.'], ['direct', 'Write directly', 'Only for folders you can restore.']] as const).map(([m, title, hint]) => (
                  <label key={m} className={'choice' + (form.writeMode === m ? ' on' : '')}>
                    <input type="radio" name="ap-write" checked={form.writeMode === m} onChange={() => set('writeMode', m)} />
                    <span><strong>{title}</strong><span className="hint">{hint}</span></span>
                  </label>
                ))}
              </div>
              <div className="two">
                <ToggleRow name="Read project files" desc="List and read files in its project folder." on={form.tools.read} onChange={(v) => set('tools', { read: v, write: v && form.tools.write })} />
                <ToggleRow name="Change project files" desc={form.writeMode === 'ask' ? 'Each change waits for your review.' : 'Written straight to disk.'} on={form.tools.write} disabled={!form.tools.read} onChange={(v) => set('tools', { ...form.tools, write: v })} />
              </div>
            </>
          )}

          {section === 'channels' && (
            <>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="section-label" style={{ padding: 0 }}>Where you can reach {saved.name}</span>
                <button type="button" className="btn btn-sm" onClick={onConnectors}>Manage channels</button>
              </div>
              <section className="box">
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <span className="area-icon" aria-hidden="true"><Icon name="chat" size={18} /></span>
                  <span style={{ flex: 1 }}><strong>Telegram</strong><span className="hint" style={{ display: 'block' }}>{telegram?.connected ? `Bot ${telegram.botName ? '@' + telegram.botName : ''} · ${telegram.linked.length} linked ${telegram.linked.length === 1 ? 'account' : 'accounts'}` : 'Not connected yet'}</span></span>
                  {!telegram?.connected && <button type="button" className="btn btn-sm" onClick={onConnectors}>Connect</button>}
                </div>
                <ToggleRow name={`${saved.name} answers on Telegram`} desc={`Message it there, or switch to it with /${saved.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.`}
                  on={form.channels.telegram} disabled={!telegram?.connected} onChange={(v) => set('channels', { ...form.channels, telegram: v })} />
              </section>
              <p className="hint">Slack and Discord are coming soon; WhatsApp needs the hosted plan. Task results and file approvals for Telegram are set in Connectors.</p>
            </>
          )}

          {section === 'tasks' && (
            <>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="section-label" style={{ padding: 0 }}>Scheduled tasks for {saved.name}</span>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => onTask(saved)}><Icon name="plus" size={12} /> New task</button>
              </div>
              {tasks.length ? (
                <section className="box">
                  {tasks.map((t) => (
                    <div key={t.id} className="ap-li"><strong>{t.name}</strong><span className="hint">{describeSchedule(t.schedule)}{t.enabled ? '' : ' · paused'}</span>
                      <span className="r">{t.enabled && t.nextRunAt ? `Next ${when(t.nextRunAt)}` : '—'}</span></div>
                  ))}
                </section>
              ) : <p className="hint">No tasks yet.</p>}
            </>
          )}

          {section === 'activity' && (
            <section className="box">
              {chats.map((s) => (
                <button key={s.id} type="button" className="ap-li ap-btn" onClick={() => onOpenChat(s.agentId, s.projectId, s.id)}>{s.title}
                  <span className="hint">{projects.find((p) => p.id === s.projectId)?.name ?? ''}</span><span className="r">{when(s.updatedAt)}</span></button>
              ))}
              {tasks.filter((t) => t.lastRunAt).map((t) => (
                <div key={'t' + t.id} className="ap-li"><span className={t.lastStatus === 'error' ? 'account-error' : 'ok'}>{t.lastStatus === 'error' ? '!' : '✓'}</span>{t.name} (task)
                  <span className="hint">{t.lastStatus === 'error' ? t.lastError : t.lastStatus}</span><span className="r">{when(t.lastRunAt!)}</span></div>
              ))}
              {!chats.length && !tasks.some((t) => t.lastRunAt) && <p className="hint">No activity yet.</p>}
              <span className="hint">Tokens and cost per run arrive with the cost ledger.</span>
            </section>
          )}
        </div>
        {dirty && (
          <div className="ap-save">
            <span className="hint">You have unsaved changes.</span>
            <div className="row"><button type="button" className="btn" onClick={() => setForm(saved)}>Discard</button><button type="button" className="btn btn-primary" onClick={() => void save()}>Save</button></div>
          </div>
        )}
      </div>
    </div>
  )
}
