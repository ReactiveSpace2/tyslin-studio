import { useMemo, useState } from 'react'
import type { Agent, AgentStatus, Project } from '@shared/types'
import { useAgentStatuses } from '../agentStatus'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { OrgChart } from '../components/OrgChart'
import { RunsOnBadge, runsOnLabel } from '../components/RunsOnBadge'
import { StatusPill } from '../components/StatusPill'

type View = 'list' | 'cards' | 'org'
type Tab = 'all' | 'working' | 'setup' | 'scheduled'

interface Props {
  agents: Agent[]
  projects: Project[]
  you: string
  onOpen: (a: Agent) => void
  onChat: (a: Agent) => void
  onNew: () => void
  onNewProject: () => void
  onChanged: () => void
}

const ago = (t: number | null): string => {
  if (!t) return 'Never'
  const min = Math.round((Date.now() - t) / 60000)
  if (min < 1) return 'Now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'Yesterday' : `${d} days ago`
}

const TABS: [Tab, string, (s?: AgentStatus) => boolean][] = [
  ['all', 'All', () => true],
  ['working', 'Working', (s) => s?.state === 'working'],
  ['setup', 'Needs setup', (s) => s?.state === 'setup' || s?.state === 'failed'],
  ['scheduled', 'Scheduled', (s) => (s?.tasks ?? 0) > 0]
]

/** All agents: status at a glance, as a list, cards or the per-project org chart. */
export function AgentsHub({ agents, projects, you, onOpen, onChat, onNew, onNewProject, onChanged }: Props): JSX.Element {
  const statuses = useAgentStatuses()
  const [view, setView] = useState<View>(() => { try { return (localStorage.getItem('agents:view') as View) || 'list' } catch { return 'list' } })
  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')
  const pick = (v: View): void => { setView(v); try { localStorage.setItem('agents:view', v) } catch { /* not saved */ } }

  const list = agents.filter((a) => a.kind === 'agent')
  const projectName = (a: Agent): string => (a.isMascot ? 'Every project' : projects.find((p) => p.id === a.projectId)?.name ?? '—')
  const shown = useMemo(() => {
    const f = TABS.find((t) => t[0] === tab)![2]
    return list
      .filter((a) => f(statuses.get(a.id)) && (!q || (a.name + ' ' + a.description).toLowerCase().includes(q.toLowerCase())))
      .sort((x, y) => Number(y.isMascot) - Number(x.isMascot) || Number(y.pinned) - Number(x.pinned))
  }, [list, tab, q, statuses])

  const togglePin = async (a: Agent): Promise<void> => {
    await window.tyslin.agents.save({ ...a, pinned: !a.pinned })
    onChanged()
  }

  return (
    <div className="page">
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="eyebrow">Your crew</span>
          <h1>Agents</h1>
          <p className="lead">Agents do work in your project folders. See who is ready, who is working and who needs setting up.</p>
        </div>
        <div className="row">
          {view !== 'org' && (
            <label className="row input" style={{ width: 220, gap: 8, color: 'var(--muted)' }}>
              <Icon name="search" />
              <input type="search" placeholder="Search agents" aria-label="Search agents" value={q} onChange={(e) => setQ(e.target.value)}
                style={{ border: 0, outline: 'none', background: 'transparent', flex: 1, minWidth: 0 }} />
            </label>
          )}
          <div className="seg" role="group" aria-label="View">
            {([['list', 'List', 'filter'], ['cards', 'Cards', 'grid'], ['org', 'Org chart', 'workflow']] as const).map(([id, label, icon]) => (
              <button key={id} type="button" className={view === id ? 'on' : ''} aria-pressed={view === id} onClick={() => pick(id)}>
                <Icon name={icon} size={14} /> {label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary" onClick={onNew}><Icon name="plus" size={12} /> New agent</button>
        </div>
      </header>

      {view === 'org' ? (
        <OrgChart agents={agents} projects={projects} statuses={statuses} you={you} onChanged={onChanged} onOpen={onOpen} onNewProject={onNewProject} />
      ) : (
        <>
          <div className="line-tabs" role="tablist" aria-label="Filter agents">
            {TABS.map(([id, label, f]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
                {label}<span className="n">{list.filter((a) => f(statuses.get(a.id))).length}</span>
              </button>
            ))}
          </div>

          {view === 'list' ? (
            <div className="agent-table" role="table" aria-label="Agents">
              <div className="at-row at-head" role="row">
                <span role="columnheader"><span className="sr-only">Pinned</span></span><span role="columnheader">Agent</span><span role="columnheader">Runs on</span>
                <span role="columnheader">Project</span><span role="columnheader">Last active</span><span role="columnheader">Tasks</span><span role="columnheader">Status</span>
              </div>
              {shown.map((a) => {
                const st = statuses.get(a.id)
                return (
                  <div key={a.id} className="at-row" role="row">
                    <span role="cell">
                      {!a.isMascot && (
                        <button type="button" className={'pin' + (a.pinned ? ' on' : '')} aria-pressed={a.pinned} aria-label={a.pinned ? `Unpin ${a.name}` : `Pin ${a.name}`} onClick={() => void togglePin(a)}>
                          <Icon name="star" size={15} />
                        </button>
                      )}
                    </span>
                    <button type="button" role="cell" className="at-who" onClick={() => onOpen(a)}>
                      <Avatar shape={a.shape} tone={a.tone} head={a.head} mascot={a.isMascot} size={34} />
                      <span><strong>{a.name}</strong><span>{a.description}</span></span>
                    </button>
                    <span role="cell" className="at-runs"><RunsOnBadge agent={a} size={20} />{a.engine === 'builtin' ? `${runsOnLabel(a)} · ${a.model}` : runsOnLabel(a)}</span>
                    <span role="cell" className="at-muted">{projectName(a)}</span>
                    <span role="cell" className="at-muted">{ago(st?.lastActive ?? null)}</span>
                    <span role="cell" className="mono at-muted">{st?.tasks ?? 0}</span>
                    <span role="cell"><StatusPill status={st} /></span>
                  </div>
                )
              })}
              {shown.length === 0 && <p className="hint" style={{ padding: 16 }}>No agents match.</p>}
            </div>
          ) : (
            <div className="grid">
              {shown.map((a) => (
                <article key={a.id} className="card">
                  <div className="card-top">
                    <div className="avatar-tile"><Avatar shape={a.shape} tone={a.tone} head={a.head} mascot={a.isMascot} /></div>
                    <StatusPill status={statuses.get(a.id)} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <h2>{a.name}</h2>
                    <p>{a.description}</p>
                  </div>
                  <div className="card-foot">
                    <span className="runs-on-line"><RunsOnBadge agent={a} /><span className="mono">{projectName(a)}</span></span>
                    <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                      <button type="button" className="btn btn-sm" onClick={() => onOpen(a)}>Open</button>
                      <button type="button" className="btn btn-sm btn-lime" onClick={() => onChat(a)}>Chat</button>
                    </div>
                  </div>
                </article>
              ))}
              <button type="button" className="add-card" onClick={onNew}><Icon name="plus" size={28} />Build a new agent</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
