import { useEffect, useMemo, useState } from 'react'
import type { Agent, Project, ScheduledTask, TaskInput, TaskSchedule } from '@shared/types'
import { describeSchedule, WEEKDAY_NAMES } from '@shared/schedule'
import { TASK_TEMPLATES, type TaskTemplate } from '@shared/taskTemplates'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'

interface Props {
  agents: Agent[]
  projects: Project[]
  onOpenChat: (agentId: string, projectId: string | null, sessionId?: string) => void
}

type Sort = 'next' | 'name' | 'created'
type Filter = 'all' | 'active' | 'paused'

const whenText = (t: number): string => {
  const d = new Date(t)
  const today = new Date()
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === today.toDateString()) return `Today ${time}`
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`
  return `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))

/** Create or edit a task. */
function TaskEditor({ initial, agents, projects, onClose, onSaved }: {
  initial: TaskInput; agents: Agent[]; projects: Project[]; onClose: () => void; onSaved: () => void
}): JSX.Element {
  const [form, setForm] = useState<TaskInput>(initial)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const agent = agents.find((a) => a.id === form.agentId)
  const set = <K extends keyof TaskInput>(k: K, v: TaskInput[K]): void => setForm((f) => ({ ...f, [k]: v }))
  const setSchedule = (s: Partial<TaskSchedule>): void => setForm((f) => ({ ...f, schedule: { ...f.schedule, ...s } }))

  const save = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      await window.tyslin.tasks.save({ ...form, projectId: agent?.kind === 'agent' ? form.projectId : null })
      onSaved()
    } catch (e) {
      setError(errorText(e))
      setSaving(false)
    }
  }

  return (
    <div className="backdrop" role="dialog" aria-modal="true" aria-labelledby="task-title" onClick={onClose}>
      <form className="modal task-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); void save() }}>
        <h2 id="task-title">{form.id ? 'Edit task' : 'New task'}</h2>
        <div className="field">
          <label htmlFor="t-name">Name</label>
          <input id="t-name" className="input" value={form.name} maxLength={80} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Daily plan" autoFocus />
        </div>
        <div className="two">
          <div className="field">
            <label htmlFor="t-agent">Agent or assistant</label>
            <select id="t-agent" className="select" value={form.agentId} onChange={(e) => set('agentId', e.target.value)}>
              <optgroup label="Agents">{agents.filter((a) => a.kind === 'agent').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>
              <optgroup label="Assistants">{agents.filter((a) => a.kind === 'assistant').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>
            </select>
          </div>
          <div className="field">
            <label htmlFor="t-project">Project</label>
            <select id="t-project" className="select" value={form.projectId ?? ''} disabled={agent?.kind !== 'agent'}
              onChange={(e) => set('projectId', e.target.value || null)}>
              <option value="">{agent?.kind === 'agent' ? 'No project' : 'Assistants have no project'}</option>
              {agent?.kind === 'agent' && projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="t-prompt">What should it do?</label>
          <textarea id="t-prompt" className="textarea" rows={5} value={form.prompt} onChange={(e) => set('prompt', e.target.value)}
            placeholder="The message sent to the agent each time the task runs." />
        </div>
        <div className="task-when">
          <div className="field">
            <label htmlFor="t-repeat">Repeat</label>
            <select id="t-repeat" className="select" value={form.schedule.repeat}
              onChange={(e) => setSchedule({ repeat: e.target.value as TaskSchedule['repeat'], day: form.schedule.day ?? 1 })}>
              <option value="daily">Every day</option>
              <option value="weekdays">Weekdays</option>
              <option value="weekly">Once a week</option>
            </select>
          </div>
          {form.schedule.repeat === 'weekly' && (
            <div className="field">
              <label htmlFor="t-day">Day</label>
              <select id="t-day" className="select" value={form.schedule.day ?? 1} onChange={(e) => setSchedule({ day: Number(e.target.value) })}>
                {WEEKDAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="t-time">Time</label>
            <input id="t-time" type="time" className="input" value={form.schedule.time} onChange={(e) => setSchedule({ time: e.target.value || '09:00' })} />
          </div>
        </div>
        <label className="task-check">
          <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          Active <span className="hint">Runs on schedule while Tyslin is open. Each run starts a new chat.</span>
        </label>
        {error && <p className="hint account-error" role="alert">{error}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save task'}</button>
        </div>
      </form>
    </div>
  )
}

function TemplateList({ onPick }: { onPick: (t: TaskTemplate) => void }): JSX.Element {
  return (
    <ul className="tpl-grid">
      {TASK_TEMPLATES.map((t) => (
        <li key={t.id}>
          <button type="button" className="tpl" onClick={() => onPick(t)}>
            <span className="tpl-icon" aria-hidden="true"><Icon name={t.icon} size={18} /></span>
            <span className="tpl-text">
              <strong>{t.name}</strong>
              <span>{t.description}</span>
              <span className="tpl-when"><Icon name="clock" size={13} /> {describeSchedule(t.schedule)} · {t.agent}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Scheduled tasks: prompts an agent or assistant runs on a schedule, each run in a new chat. */
export function TasksPage({ agents, projects, onOpenChat }: Props): JSX.Element {
  const [tasks, setTasks] = useState<ScheduledTask[] | null>(null)
  const [tab, setTab] = useState<'yours' | 'templates'>('yours')
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('next')
  const [editing, setEditing] = useState<TaskInput | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = (): void => { void window.tyslin.tasks.list().then(setTasks) }
  useEffect(() => { load(); return window.tyslin.tasks.onChanged(load) }, [])

  const fallback = agents.find((a) => a.isMascot) ?? agents[0]
  const blank = (): TaskInput => ({ name: '', prompt: '', agentId: fallback?.id ?? '', projectId: null, schedule: { repeat: 'weekdays', time: '09:00' }, enabled: true })
  const fromTemplate = (t: TaskTemplate): TaskInput => ({
    name: t.name, prompt: t.prompt, agentId: (agents.find((a) => a.name === t.agent) ?? fallback)?.id ?? '',
    projectId: null, schedule: t.schedule, enabled: true
  })

  const shown = useMemo(() => {
    const list = (tasks ?? []).filter((t) => {
      if (filter === 'active' && !t.enabled) return false
      if (filter === 'paused' && t.enabled) return false
      return !q || (t.name + ' ' + t.prompt).toLowerCase().includes(q.toLowerCase())
    })
    return [...list].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name)
        : sort === 'created' ? b.createdAt - a.createdAt
          : (a.nextRunAt ?? Infinity) - (b.nextRunAt ?? Infinity))
  }, [tasks, q, filter, sort])

  const toggle = async (t: ScheduledTask): Promise<void> => {
    await window.tyslin.tasks.save({ id: t.id, name: t.name, prompt: t.prompt, agentId: t.agentId, projectId: t.projectId, schedule: t.schedule, enabled: !t.enabled })
    load()
  }
  const runNow = async (t: ScheduledTask): Promise<void> => {
    try {
      const sid = await window.tyslin.tasks.runNow(t.id)
      setNotice(`Started ${t.name}.`)
      load()
      return void sid
    } catch (e) {
      setNotice(`Couldn't start ${t.name}. ${errorText(e)}`)
    }
  }
  const remove = async (t: ScheduledTask): Promise<void> => {
    if (!window.confirm(`Delete the task "${t.name}"? Chats from earlier runs stay.`)) return
    await window.tyslin.tasks.remove(t.id)
    load()
  }

  const empty = tasks !== null && tasks.length === 0

  return (
    <div className="page">
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="eyebrow">Tasks</span>
          <h1>Scheduled tasks</h1>
          <p className="lead">An agent or assistant runs your prompt on a schedule, each time in a new chat. Tasks run while Tyslin is open; a run missed while it was closed happens when you open it.</p>
        </div>
      </header>

      <div className="tasks-bar">
        <div className="tabs" role="tablist" aria-label="Tasks">
          <button type="button" role="tab" aria-selected={tab === 'yours'} className={tab === 'yours' ? 'on' : ''} onClick={() => setTab('yours')}>Yours</button>
          <button type="button" role="tab" aria-selected={tab === 'templates'} className={tab === 'templates' ? 'on' : ''} onClick={() => setTab('templates')}>Templates</button>
        </div>
        <div className="row tasks-tools">
          {tab === 'yours' && !empty && (
            <>
              {searching ? (
                <input className="input" style={{ width: 200 }} type="search" placeholder="Search tasks" aria-label="Search tasks"
                  value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => !q && setSearching(false)} autoFocus />
              ) : (
                <button type="button" className="btn icon-btn" aria-label="Search tasks" title="Search" onClick={() => setSearching(true)}><Icon name="search" /></button>
              )}
              <label className="tool-select" title="Filter">
                <Icon name="filter" />
                <select aria-label="Filter tasks" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
                  <option value="all">All</option><option value="active">Active</option><option value="paused">Paused</option>
                </select>
              </label>
              <label className="tool-select" title="Sort">
                <Icon name="sort" />
                <select aria-label="Sort tasks" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="next">Next run</option><option value="name">Name</option><option value="created">Newest</option>
                </select>
              </label>
            </>
          )}
          <button type="button" className="btn btn-primary" onClick={() => setEditing(blank())}><Icon name="plus" size={12} /> New task</button>
        </div>
      </div>

      {notice && <p className="ok" role="status">{notice} <button type="button" className="link-btn" onClick={() => setNotice(null)}>Dismiss</button></p>}

      {tab === 'templates' && <TemplateList onPick={(t) => setEditing(fromTemplate(t))} />}

      {tab === 'yours' && empty && (
        <>
          <div className="tasks-empty">
            <span className="tasks-empty-icon" aria-hidden="true"><Icon name="clock" size={44} /></span>
            <p>No scheduled tasks yet.</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing(blank())}>Set up manually</button>
          </div>
          <hr className="tasks-rule" />
          <TemplateList onPick={(t) => setEditing(fromTemplate(t))} />
        </>
      )}

      {tab === 'yours' && !empty && tasks && (
        shown.length === 0 ? <p className="hint">No tasks match.</p> : (
          <ul className="task-list">
            {shown.map((t) => {
              const a = agents.find((x) => x.id === t.agentId)
              const project = projects.find((p) => p.id === t.projectId)
              return (
                <li key={t.id} className={'task-row' + (t.enabled ? '' : ' paused')}>
                  {a && <Avatar shape={a.shape} tone={a.tone} mascot={a.isMascot} size={36} />}
                  <div className="task-main">
                    <div className="task-name">
                      <strong>{t.name}</strong>
                      {!t.enabled && <span className="badge">Paused</span>}
                      {t.lastStatus === 'running' && <span className="badge green">Running</span>}
                      {t.lastStatus === 'error' && <span className="badge task-error" title={t.lastError}>Last run failed</span>}
                    </div>
                    <span className="task-prompt">{t.prompt}</span>
                    <span className="task-meta">
                      <Icon name="clock" size={12} /> {describeSchedule(t.schedule)}
                      <span>·</span> {a?.name ?? 'Missing agent'}{project ? ` · ${project.name}` : ''}
                      {t.enabled && t.nextRunAt && <><span>·</span> Next {whenText(t.nextRunAt)}</>}
                      {t.lastRunAt && t.lastSessionId && a && (
                        <><span>·</span> <button type="button" className="link-btn" onClick={() => onOpenChat(a.id, t.projectId, t.lastSessionId!)}>Last run {whenText(t.lastRunAt)}</button></>
                      )}
                    </span>
                  </div>
                  <div className="task-actions">
                    <button type="button" className="btn btn-sm" onClick={() => void runNow(t)} disabled={t.lastStatus === 'running'}><Icon name="play" size={12} /> Run now</button>
                    <button type="button" className="btn btn-sm icon-btn" aria-label={t.enabled ? `Pause ${t.name}` : `Resume ${t.name}`} title={t.enabled ? 'Pause' : 'Resume'} onClick={() => void toggle(t)}>
                      <Icon name={t.enabled ? 'pause' : 'clock'} size={14} />
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => setEditing({ id: t.id, name: t.name, prompt: t.prompt, agentId: t.agentId, projectId: t.projectId, schedule: t.schedule, enabled: t.enabled })}>Edit</button>
                    <button type="button" className="btn btn-sm icon-btn" aria-label={`Delete ${t.name}`} title="Delete" onClick={() => void remove(t)}><Icon name="trash" size={14} /></button>
                  </div>
                </li>
              )
            })}
          </ul>
        )
      )}

      {editing && (
        <TaskEditor initial={editing} agents={agents} projects={projects} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setTab('yours'); load() }} />
      )}
    </div>
  )
}
