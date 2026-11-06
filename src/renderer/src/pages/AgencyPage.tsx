import { useState } from 'react'
import type { Agent } from '@shared/types'
import type { AgencyView } from '../agencies'
import { agencyStatus } from '../agencies'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { runsOnLabel } from '../components/RunsOnBadge'

interface Props {
  view: AgencyView
  tab: 'org' | 'edit'
  you: string
  onTab: (tab: 'org' | 'edit') => void
  onBoard: () => void
  /** Run: open the Lead's chat in this agency. */
  onRun: (lead: Agent) => void
  onOpenAgent: (a: Agent) => void
  onAddWorker: () => void
  onDrive: () => void
  onBack: () => void
  /** Renamed: reload projects. */
  onChanged: () => void
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))

/** One agency: its org chart (You → Lead → workers) or its settings. Board opens Kanban in its folder. */
export function AgencyPage({ view, tab, you, onTab, onBoard, onRun, onOpenAgent, onAddWorker, onDrive, onChanged }: Props): JSX.Element {
  const { project, lead, workers } = view
  const st = agencyStatus(view)
  const [name, setName] = useState(project.name)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const save = async (): Promise<void> => {
    setError(null); setSaved(null)
    try {
      if (name.trim() && name.trim() !== project.name) await window.tyslin.projects.rename(project.id, name.trim())
      setSaved('Name saved. The other fields are saved once the agency backend is in.')
      onChanged()
    } catch (e) { setError(errorText(e)) }
  }

  return (
    <div className="page ag-page">
      <header className="ag-head">
        <div>
          <div className="row" style={{ gap: 10 }}>
            <h1>{tab === 'edit' ? `Edit ${project.name}` : project.name}</h1>
            {tab === 'org' && <span className="ag-status"><span className={'ag-dot ' + st.tone} />{st.label}</span>}
          </div>
          {tab === 'org' && <p className="hint mono">{project.folder ?? 'No folder'}</p>}
        </div>
        <div className="row">
          <div className="ag-tabs" role="tablist" aria-label="Agency views">
            <button type="button" role="tab" aria-selected={tab === 'org'} className={tab === 'org' ? 'on' : ''} onClick={() => onTab('org')}>Overview</button>
            <button type="button" role="tab" aria-selected={tab === 'edit'} className={tab === 'edit' ? 'on' : ''} onClick={() => onTab('edit')}>Edit</button>
          </div>
          {tab === 'edit' && <button type="button" className="btn btn-primary" onClick={() => void save()}>Save</button>}
          {tab === 'org' && (
            <button type="button" className="btn btn-lime" disabled={!lead} title={lead ? `Open ${lead.name} in this agency` : 'Add a Lead first'} onClick={() => lead && onRun(lead)}>
              <Icon name="play" size={12} /> Run
            </button>
          )}
        </div>
      </header>

      {tab === 'org' && (
        <div className="ag-split">
          <section className="nt-chart ag-chart" aria-label="Org chart">
            <div className="nt-you"><span className="nt-u">{you.slice(0, 1).toUpperCase()}</span><strong>You</strong></div>
            {lead ? (
              <>
                <span className="nt-line" />
                <button type="button" className="nt-person nt-lead ag-node" onClick={() => onOpenAgent(lead)}>
                  <Avatar shape={lead.shape} tone={lead.tone} head={lead.head} size={44} />
                  <span><strong>{lead.name}</strong><small>{lead.description || 'Plans the work, hands out cards and reports to you'}</small><small className="mono">{runsOnLabel(lead)}</small></span>
                </button>
              </>
            ) : <p className="hint" style={{ marginTop: 16 }}>No Lead yet. Add an agent to this agency and it becomes the Lead.</p>}
            {workers.length > 0 && (
              <>
                <span className="nt-line" />
                <div className="nt-members" style={{ gridTemplateColumns: `repeat(${Math.min(workers.length, 4)}, minmax(0, 1fr))` }}>
                  {workers.map((w) => (
                    <button key={w.id} type="button" className="nt-person nt-member ag-node" onClick={() => onOpenAgent(w)}>
                      <Avatar shape={w.shape} tone={w.tone} head={w.head} size={38} />
                      <strong>{w.name}</strong>
                      <small>{w.description}</small>
                      <span className="mono nt-access">{runsOnLabel(w)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <button type="button" className="btn ag-add" onClick={onAddWorker}><Icon name="plus" size={12} /> Add a worker</button>
          </section>
          <aside className="ag-side">
            <div className="card ag-box">
              <span className="eyebrow">Plan</span>
              <p className="hint">The goal and the five-step plan show here once agencies are saved. [PLACEHOLDER]</p>
            </div>
            <div className="card ag-box">
              <span className="eyebrow">How it runs</span>
              <span className="ag-kv"><span className="hint">Lead's task</span><span>Weekdays 09:00</span></span>
              <span className="ag-kv"><span className="hint">Cards</span><span>You run them</span></span>
              <span className="ag-kv"><span className="hint">Channel</span><span>Not set</span></span>
            </div>
            <button type="button" className="card ag-box ag-link" onClick={onBoard}><span><span className="eyebrow">Board</span><strong>Open the Kanban board</strong></span><Icon name="arrowUp" size={14} /></button>
          </aside>
        </div>
      )}

      {tab === 'edit' && (
        <div className="ag-split">
          <div className="ag-col">
            <section className="card ag-sec">
              <h2>Basics</h2>
              <label className="field"><span className="label">Agency name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label className="field"><span className="label">What this agency does</span><textarea className="input" rows={2} placeholder="Describe the work in a sentence or two." /></label>
              <label className="field"><span className="label">Goal</span><input className="input" placeholder="One sentence" /></label>
              <label className="field"><span className="label">Agency prompt</span>
                <span className="hint">Every agent in this agency follows this. Each agent's own job instructions are on its page.</span>
                <textarea className="input" rows={4} placeholder="How this agency works: tools, style, what to ask you before doing." /></label>
            </section>
            <section className="card ag-sec">
              <h2>Roster</h2>
              {[lead, ...workers].filter((a): a is Agent => !!a).map((a) => (
                <div key={a.id} className="ag-roster">
                  <Avatar shape={a.shape} tone={a.tone} head={a.head} size={34} />
                  <span><strong>{a.name}</strong><span className="hint">{a.id === lead?.id ? 'Lead · reports to you' : `Reports to ${lead?.name ?? 'you'}`}</span></span>
                  <span className="mono hint">{runsOnLabel(a)}</span>
                  <span className="mono hint">{a.engine === 'builtin' ? a.model : "Engine's own model"}</span>
                  <button type="button" className="btn btn-sm" onClick={() => onOpenAgent(a)}>Open</button>
                </div>
              ))}
              <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onAddWorker}><Icon name="plus" size={12} /> Add a worker</button>
            </section>
          </div>
          <aside className="ag-side">
            <section className="card ag-sec">
              <h2>How it runs</h2>
              <label className="field"><span className="label">Default adapter</span><select className="select"><option>Claude Code</option><option>Hermes</option><option>Gemini CLI</option><option>Codex</option></select></label>
              <label className="field"><span className="label">Lead plans the Inbox</span><select className="select"><option>Weekdays at 09:00</option><option>Every day at 09:00</option><option>Only when I ask</option></select></label>
              <label className="ag-check"><span>Lead runs cards automatically</span><input type="checkbox" /></label>
              <label className="ag-check"><span>Ask before writing files</span><input type="checkbox" defaultChecked /></label>
              <label className="field"><span className="label">Monthly budget</span><input className="input mono" placeholder="[PLACEHOLDER]" /></label>
            </section>
            <section className="card ag-sec">
              <h2>Channel</h2>
              <label className="field"><span className="label">Lead talks to you on</span><select className="select"><option>Not now</option><option>Telegram</option><option>Slack</option></select></label>
              <label className="field"><span className="label">What the Lead sends</span><select className="select"><option>Questions and reviews</option><option>Everything</option><option>Digest only</option></select></label>
            </section>
            <section className="card ag-sec">
              <h2>Folder</h2>
              <span className="mono hint" style={{ overflowWrap: 'anywhere' }}>{project.folder ?? 'No folder'}</span>
              <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onDrive}>Open in Drive</button>
            </section>
            {saved && <p className="hint" role="status">{saved}</p>}
            {error && <p className="hint account-error" role="alert">{error}</p>}
          </aside>
        </div>
      )}
    </div>
  )
}
