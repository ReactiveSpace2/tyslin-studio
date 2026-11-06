import { useState } from 'react'
import type { AgencyView } from '../agencies'
import { agencyStatus } from '../agencies'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { runsOnLabel } from '../components/RunsOnBadge'

interface Props {
  agencies: AgencyView[]
  onOpen: (projectId: string) => void
  onBoard: (projectId: string) => void
  onEdit: (projectId: string) => void
  onNew: () => void
}

/** Agency → the organization's agencies: Lead, team, status, with Board and Edit. */
export function AgenciesPage({ agencies, onOpen, onBoard, onEdit, onNew }: Props): JSX.Element {
  const [q, setQ] = useState('')
  const shown = agencies.filter((v) => !q.trim() || v.project.name.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className="page ag-page">
      <header className="ag-head">
        <div>
          <span className="eyebrow">Studio</span>
          <h1>Agencies</h1>
          <p className="hint">Each agency is a Lead and its team, with a goal, a plan, a board and a line to you.</p>
        </div>
        <div className="row">
          <label className="ag-search"><Icon name="search" size={14} /><input type="search" placeholder="Search agencies" aria-label="Search agencies" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <button type="button" className="btn btn-primary" onClick={onNew}><Icon name="plus" size={12} /> New agency</button>
        </div>
      </header>

      <div className="card ag-table" role="table" aria-label="Agencies">
        <div className="ag-row ag-th" role="row"><span>Agency</span><span>Lead</span><span>Team</span><span>Status</span><span /></div>
        {shown.map((v) => {
          const st = agencyStatus(v)
          return (
            <div key={v.project.id} className="ag-row" role="row">
              <span><button type="button" className="ag-name" onClick={() => onOpen(v.project.id)}>{v.project.name}</button>
                <span className="hint mono ag-folder">{v.project.folder ?? 'No folder'}</span></span>
              <span className="ag-lead">
                {v.lead ? <><Avatar shape={v.lead.shape} tone={v.lead.tone} head={v.lead.head} size={32} /><span><strong>{v.lead.name}</strong><span className="hint mono">{runsOnLabel(v.lead)}</span></span></> : <span className="hint">None yet</span>}
              </span>
              <span className="ag-team">{v.workers.slice(0, 5).map((w) => <Avatar key={w.id} shape={w.shape} tone={w.tone} head={w.head} size={26} />)}
                {v.workers.length === 0 && <span className="hint">No workers</span>}{v.workers.length > 5 && <span className="hint mono">+{v.workers.length - 5}</span>}</span>
              <span className="ag-status"><span className={'ag-dot ' + st.tone} />{st.label}</span>
              <span className="ag-actions">
                <button type="button" className="btn btn-sm" onClick={() => onBoard(v.project.id)}>Board</button>
                <button type="button" className="btn btn-sm icon-btn" aria-label={`Edit ${v.project.name}`} onClick={() => onEdit(v.project.id)}><Icon name="settings" size={14} /></button>
              </span>
            </div>
          )
        })}
        {shown.length === 0 && <p className="hint" style={{ padding: 18 }}>{agencies.length ? 'No agency matches.' : 'No agencies yet. Start one from a template.'}</p>}
      </div>
    </div>
  )
}
