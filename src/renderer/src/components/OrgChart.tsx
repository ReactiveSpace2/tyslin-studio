import { useCurrentProject } from '../currentProject'
import { useState } from 'react'
import type { Agent, AgentStatus, Project } from '@shared/types'
import { STATUS_LABEL } from '../agentStatus'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import { RunsOnBadge, runsOnLabel } from './RunsOnBadge'

interface Props {
  agents: Agent[]
  projects: Project[]
  statuses: Map<string, AgentStatus>
  /** The signed-in name, shown on the top box. */
  you: string
  onChanged: () => void
  onOpen: (a: Agent) => void
  onNewProject: () => void
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))

/**
 * One chart per project: You at the top, then each agent under its lead. Drag an agent onto You or
 * onto another agent, or use its "Reports to" menu; drag it to the tray to take it off the project.
 * Each agent works in one project; Builder helps everywhere and stays off the charts.
 */
export function OrgChart({ agents, projects, statuses, you, onChanged, onOpen, onNewProject }: Props): JSX.Element {
  // The chart is the project picked in the title bar.
  const [projectId] = useCurrentProject()
  const [over, setOver] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const project = projects.find((p) => p.id === projectId) ?? null
  const team = agents.filter((a) => a.kind === 'agent' && !a.isMascot && project && a.projectId === project.id)
  const tray = agents.filter((a) => a.kind === 'agent' && !a.isMascot && !a.projectId)

  if (!project) {
    return (
      <div className="org-empty">
        <Icon name="folder" size={28} />
        <p>Teams are built per project. Link a project folder first, then drag agents into it.</p>
        <button type="button" className="btn btn-primary" onClick={onNewProject}><Icon name="plus" size={12} /> New project</button>
      </div>
    )
  }

  const byId = new Map(team.map((a) => [a.id, a]))
  /** Lead inside this project, else null (reports to you). */
  const leadOf = (a: Agent): string | null => (a.leadId && byId.has(a.leadId) ? a.leadId : null)
  const reportsOf = (id: string | null): Agent[] => team.filter((a) => leadOf(a) === id)
  /** This agent and everyone under it, so a lead can't be moved under its own team. */
  const subtree = (id: string): Set<string> => {
    const out = new Set([id])
    for (let grew = true; grew;) {
      grew = false
      for (const a of team) if (a.leadId && out.has(a.leadId) && !out.has(a.id)) { out.add(a.id); grew = true }
    }
    return out
  }

  const save = async (agentId: string, change: { projectId: string | null; leadId: string | null }): Promise<void> => {
    const a = agents.find((x) => x.id === agentId)
    if (!a) return
    setError(null)
    try {
      await window.tyslin.agents.save({ ...a, ...change })
      onChanged()
    } catch (e) {
      setError(errorText(e))
    }
  }
  const moveUnder = (agentId: string, leadId: string | null): void => {
    if (leadId && subtree(agentId).has(leadId)) {
      setError(`${byId.get(leadId)?.name} is in ${agents.find((a) => a.id === agentId)?.name}'s team, so it can't be its lead.`)
      return
    }
    void save(agentId, { projectId: project.id, leadId })
  }

  const dragProps = (a: Agent): React.HTMLAttributes<HTMLDivElement> & { draggable: boolean } => ({
    draggable: true,
    onDragStart: (e) => { e.dataTransfer.setData('text/plain', a.id); e.dataTransfer.effectAllowed = 'move' }
  })
  const dropProps = (key: string, onDropId: (id: string) => void): React.HTMLAttributes<HTMLDivElement> => ({
    onDragOver: (e) => { e.preventDefault(); if (over !== key) setOver(key) },
    onDragLeave: () => setOver(null),
    onDrop: (e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/plain'); if (id) onDropId(id) }
  })

  const Node = ({ a }: { a: Agent }): JSX.Element => {
    const st = statuses.get(a.id)
    const inTeam = subtree(a.id)
    const kids = reportsOf(a.id)
    return (
      <div className="org-col">
        <div className={'org-node' + (over === a.id ? ' drop' : '')} {...dragProps(a)} {...dropProps(a.id, (id) => id !== a.id && moveUnder(id, a.id))}>
          <span className={'org-dot ' + (st?.state ?? 'ready')} title={st ? `${STATUS_LABEL[st.state]}: ${st.reason}` : ''} aria-hidden="true" />
          <button type="button" className="org-who" onClick={() => onOpen(a)} title={`Open ${a.name}`}>
            <Avatar shape={a.shape} tone={a.tone} head={a.head} size={34} />
            <span><strong>{a.name}</strong><span className="org-runs"><RunsOnBadge agent={a} size={14} />{runsOnLabel(a)}</span></span>
          </button>
          <label className="org-rt">
            <span>Reports to</span>
            <select value={leadOf(a) ?? ''} aria-label={`${a.name} reports to`} onChange={(e) => {
              const v = e.target.value
              if (v === '__off') void save(a.id, { projectId: null, leadId: null })
              else moveUnder(a.id, v || null)
            }}>
              <option value="">You</option>
              {team.filter((x) => !inTeam.has(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              <option value="__off">Off this project</option>
            </select>
          </label>
        </div>
        {kids.length > 0 && (
          <>
            <span className="org-vline" aria-hidden="true" />
            <div className="org-kids">{kids.map((k) => <Node key={k.id} a={k} />)}</div>
          </>
        )}
      </div>
    )
  }

  const top = reportsOf(null)

  return (
    <div className="org">
      <div className="org-bar">
        <span className="org-project"><Icon name="folder" size={14} /> {project.name}</span>
        <span className="hint">Drag an agent onto You or onto a lead. Drag it to the tray to take it off the project.</span>
      </div>
      {error && <p className="hint account-error" role="alert">{error}</p>}
      <div className="org-stage">
        <div className="org-board" aria-label={`Team for ${project.name}`}>
          <div className="org-zoom">
            <button type="button" className="btn icon-btn" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(2)))}><Icon name="plus" size={14} /></button>
            <button type="button" className="btn icon-btn" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}><Icon name="minus" size={14} /></button>
            <button type="button" className="btn icon-btn" aria-label="Fit to screen" onClick={() => setZoom(1)}><Icon name="grid" size={14} /></button>
          </div>
          <div className="org-tree" style={{ transform: `scale(${zoom})` }}>
            <div className={'org-node you' + (over === 'you' ? ' drop' : '')} {...dropProps('you', (id) => moveUnder(id, null))}>
              <div className="org-who static">
                <span className="org-you" aria-hidden="true">{you.slice(0, 1).toUpperCase()}</span>
                <span><strong>You</strong><span className="org-runs">{you} · in charge</span></span>
              </div>
            </div>
            {top.length > 0 ? (
              <>
                <span className="org-vline" aria-hidden="true" />
                <div className="org-kids">{top.map((a) => <Node key={a.id} a={a} />)}</div>
              </>
            ) : <p className="hint" style={{ marginTop: 16 }}>No one on {project.name} yet. Drag agents in from the tray.</p>}
          </div>
        </div>
        <aside className={'org-tray' + (over === 'tray' ? ' drop' : '')} aria-label="Agents with no project" {...dropProps('tray', (id) => void save(id, { projectId: null, leadId: null }))}>
          <span className="section-label" style={{ padding: 0 }}>No project yet</span>
          <span className="hint">Each agent works in one project. Agents in another project move from their page.</span>
          {tray.map((a) => (
            <div key={a.id} className="org-chip" {...dragProps(a)}>
              <Avatar shape={a.shape} tone={a.tone} head={a.head} size={26} />
              <strong>{a.name}</strong>
              <button type="button" className="btn btn-sm" onClick={() => moveUnder(a.id, null)} aria-label={`Add ${a.name} to ${project.name}`}>Add</button>
            </div>
          ))}
          {tray.length === 0 && <p className="hint">Every agent has a project.</p>}
          <div className="org-note">
            <strong>What a lead gets</strong>
            <span>A lead's instructions list its team in this project, and every agent knows who it reports to. Hand-offs between agents come with Workflows.</span>
          </div>
        </aside>
      </div>
    </div>
  )
}
