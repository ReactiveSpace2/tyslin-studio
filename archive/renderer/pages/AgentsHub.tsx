import { useMemo, useState } from 'react'
import { useListed } from '../currentProject'
import { TEAM_TEMPLATES } from '@shared/teams'

const TEAM_NAMES: Record<string, string> = Object.fromEntries(TEAM_TEMPLATES.map((t) => [t.id, t.name]))
import type { Agent, AgentStatus, Project } from '@shared/types'
import { useAgentStatuses } from '../agentStatus'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { OrgChart } from '../components/OrgChart'
import { RunsOnBadge, runsOnLabel } from '../components/RunsOnBadge'
import { StatusPill } from '../components/StatusPill'

type View = 'list' | 'org'
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
  // List by default; the org chart when picked. (Cards were removed.)
  const [view, setView] = useState<View>(() => { try { return localStorage.getItem('agents:view') === 'org' ? 'org' : 'list' } catch { return 'list' } })
  const [collapsed, setCollapsed] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem('agents:collapsed') || '[]') as string[]) } catch { return new Set() } })
  const toggle = (id: string): void => setCollapsed((c) => {
    const n = new Set(c)
    if (n.has(id)) n.delete(id); else n.add(id)
    try { localStorage.setItem('agents:collapsed', JSON.stringify([...n])) } catch { /* not kept */ }
    return n
  })
  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')
  const pick = (v: View): void => { setView(v); try { localStorage.setItem('agents:view', v) } catch { /* not saved */ } }

  // Projects are workspaces: the list shows the selected project's agents (and Builder).
  const listed = useListed()
  const list = agents.filter((a) => a.kind === 'agent' && listed(a))
  const shown = useMemo(() => {
    const f = TABS.find((t) => t[0] === tab)![2]
    return list
      .filter((a) => f(statuses.get(a.id)) && (!q || (a.name + ' ' + a.description).toLowerCase().includes(q.toLowerCase())))
      .sort((x, y) => Number(y.isMascot) - Number(x.isMascot) || Number(y.pinned) - Number(x.pinned))
  }, [list, tab, q, statuses])

  /** Rows for the list: each lead with its reports underneath (collapsible); flat while searching or filtering. */
  const rows = useMemo(() => {
    const flat = tab !== 'all' || q.trim() !== ''
    if (flat) return shown.map((a) => ({ a, depth: 0, kids: 0, teamName: '' }))
    const ids = new Set(shown.map((a) => a.id))
    const kidsOf = (id: string): Agent[] => shown.filter((x) => x.leadId === id)
    const out: { a: Agent; depth: number; kids: number; teamName: string }[] = []
    const walk = (a: Agent, depth: number): void => {
      const kids = kidsOf(a.id)
      // A department team's lead shows the team's name.
      const teamName = a.team && kids.some((k) => k.team === a.team) ? `${TEAM_NAMES[a.team] ?? a.team} team` : ''
      out.push({ a, depth, kids: kids.length, teamName })
      if (kids.length && !collapsed.has(a.id)) for (const k of kids) walk(k, depth + 1)
    }
    for (const a of shown.filter((x) => !x.leadId || !ids.has(x.leadId))) walk(a, 0)
    return out
  }, [shown, tab, q, collapsed])

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
            {([['list', 'List', 'filter'], ['org', 'Org chart', 'workflow']] as const).map(([id, label, icon]) => (
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

          <div className="agent-table" role="treegrid" aria-label="Agents">
            <div className="at-row at-head" role="row">
              <span role="columnheader"><span className="sr-only">Pinned</span></span><span role="columnheader">Agent</span><span role="columnheader">Runs on</span>
              <span role="columnheader">Last active</span><span role="columnheader">Tasks</span><span role="columnheader">Status</span>
            </div>
            {rows.map(({ a, depth, kids, teamName }) => {
              const st = statuses.get(a.id)
              const open = !collapsed.has(a.id)
              return (
                <div key={a.id} className={'at-row' + (depth ? ' at-child' : '') + (kids ? ' at-lead' : '')} role="row" aria-level={depth + 1} aria-expanded={kids ? open : undefined}>
                  <span role="cell">
                    <button type="button" className={'pin' + (a.pinned ? ' on' : '')} aria-pressed={a.pinned} aria-label={a.pinned ? `Unpin ${a.name}` : `Pin ${a.name}`} onClick={() => void togglePin(a)}>
                      <Icon name="star" size={15} />
                    </button>
                  </span>
                  <span role="cell" className="at-tree" style={{ paddingLeft: depth * 28 }}>
                    {kids ? (
                      <button type="button" className={'at-caret' + (open ? ' open' : '')} aria-label={`${open ? 'Collapse' : 'Expand'} ${a.name}'s team`} onClick={() => toggle(a.id)}>
                        <Icon name="arrowDown" size={12} />
                      </button>
                    ) : depth ? <span className="at-branch" aria-hidden="true" /> : <span className="at-caret-space" aria-hidden="true" />}
                    <button type="button" className="at-who" onClick={() => onOpen(a)}>
                      <Avatar shape={a.shape} tone={a.tone} head={a.head} mascot={a.isMascot} size={34} />
                      <span>
                        <strong>{a.name}{teamName && <em className="at-team">{teamName}</em>}{kids ? <em className="at-count">{kids} {kids === 1 ? 'report' : 'reports'}</em> : null}</strong>
                        <span>{a.description}</span>
                      </span>
                    </button>
                  </span>
                  <span role="cell" className="at-runs"><RunsOnBadge agent={a} size={20} />{a.engine === 'builtin' ? `${runsOnLabel(a)} · ${a.model}` : runsOnLabel(a)}</span>
                  <span role="cell" className="at-muted">{ago(st?.lastActive ?? null)}</span>
                  <span role="cell" className="mono at-muted">{st?.tasks ?? 0}</span>
                  <span role="cell"><StatusPill status={st} /></span>
                </div>
              )
            })}
            {rows.length === 0 && <p className="hint" style={{ padding: 16 }}>{list.length ? 'No agents match.' : 'No agents in this project yet. Use New agent to add a ready-made one, a team or your own.'}</p>}
          </div>
        </>
      )}
    </div>
  )
}
