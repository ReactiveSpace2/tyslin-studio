import { useState } from 'react'
import type { Agency, AgencyUpdateInput, Agent } from '@shared/types'
import { AGENCY_ADAPTERS } from '@shared/agencies'
import type { AgencyView } from '../agencies'
import { agencyStatus } from '../agencies'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { runsOnLabel } from '../components/RunsOnBadge'
import { type BoardStats, firstName, plural, useBoardStats } from '../boardStats'

interface Props {
  view: AgencyView
  /** org: the overview (org chart); edit: the agency's settings. The Inbox is its own screen (InboxPage). */
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
  /** Saved, paused or deleted: reload lists. */
  onChanged: () => void
  onDeleted: () => void
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
const adapterName = (id: string): string => id === 'template' ? "Template's mix" : AGENCY_ADAPTERS.find((a) => a.id === id)?.name ?? id
const notifyLabel = (n: Agency['notify']): string => n === 'all' ? 'everything' : n === 'digest' ? 'digest only' : 'questions and reviews'
const channelLabel = (c: Agency['channel']): string => c.kind === 'telegram' ? 'Telegram' : c.kind === 'slack' ? 'Slack' : 'Not set'

/** "Alex is planning 3 cards · 2 waiting for your review · paused", from the board as it is now. */
function statusLine(lead: Agent | null, b: BoardStats | undefined, paused: boolean): string {
  if (!lead) return paused ? 'No Lead yet · paused' : 'No Lead yet. Add an agent and it becomes the Lead.'
  const who = firstName(lead.name)
  if (!b) return paused ? `${who} is paused` : `${who} is ready`
  const head = b.planned > 0 ? `${who} is planning ${plural(b.planned, 'card')}` : null
  const parts = [
    b.inbox > 0 ? (head ? `${b.inbox} in Inbox` : `${plural(b.inbox, 'brief')} in Inbox`) : '',
    b.inProgress > 0 ? `${b.inProgress} in progress` : '',
    b.review > 0 ? `${b.review} waiting for your review` : '',
    paused ? 'paused' : ''
  ].filter(Boolean)
  if (head) return [head, ...parts].join(' · ')
  if (parts.length === 1 && paused) return `${who} is paused`
  if (parts.length) return `${who}: ${parts.join(' · ')}`
  return `${who} is waiting for a brief. Drop one in Inbox on the board.`
}

/** One agency: its overview (org chart, plan, how it runs) or its settings. The board is Kanban in its folder. */
export function AgencyPage({ view, tab, you, onBoard, onRun, onOpenAgent, onAddWorker, onDrive, onChanged, onDeleted }: Props): JSX.Element {
  const { agency, project, lead, workers } = view
  const st = agencyStatus(view)
  const board = useBoardStats([agency])[agency.id]
  const side = (
    <aside className="ag-side">
      <div className="card ag-box">
        <span className="eyebrow">Plan</span>
        {agency.plan.length === 0 && <p className="hint">No plan yet. The Lead writes one from your first brief.</p>}
        {agency.plan.map((p, i) => <span key={i} className="ag-plan"><span className="mono">{i + 1}</span><span>{p}</span></span>)}
      </div>
      <div className="card ag-box">
        <span className="eyebrow">How it runs</span>
        <span className="ag-kv"><span className="hint">Workers run on</span><span>{adapterName(agency.adapter)}</span></span>
        <span className="ag-kv"><span className="hint">Cards</span><span>{agency.autoRun ? 'Lead runs them' : 'You run them'}</span></span>
        <span className="ag-kv"><span className="hint">Channel</span><span>{channelLabel(agency.channel)}{agency.channel.kind !== 'none' ? ` · ${notifyLabel(agency.notify)}` : ''}</span></span>
        <span className="ag-kv"><span className="hint">Budget</span><span className="mono">{agency.budget === null ? 'Not set' : `${agency.spent.toFixed(2)} of ${agency.budget}`}</span></span>
      </div>
      <button type="button" className="card ag-box ag-link" onClick={onBoard}><span><span className="eyebrow">Board</span><strong>Open the Kanban board</strong></span><Icon name="arrowUp" size={14} /></button>
    </aside>
  )
  const [draft, setDraft] = useState<AgencyUpdateInput>({
    name: agency.name, description: agency.description, goal: agency.goal, prompt: agency.prompt, plan: agency.plan,
    adapter: agency.adapter, channel: agency.channel, notify: agency.notify, budget: agency.budget, autoRun: agency.autoRun
  })
  const set = (p: AgencyUpdateInput): void => setDraft((d) => ({ ...d, ...p }))
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async (): Promise<void> => {
    setError(null); setSaved(null); setBusy(true)
    try {
      await window.tyslin.agencies.update(agency.id, draft)
      setSaved('Saved.')
      onChanged()
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const togglePause = async (): Promise<void> => {
    try { await window.tyslin.agencies.update(agency.id, { paused: !agency.paused }); onChanged() } catch (e) { setError(errorText(e)) }
  }
  const remove = async (): Promise<void> => {
    const n = workers.length + (lead ? 1 : 0)
    if (!window.confirm(`Delete the agency "${agency.name}"?\n\nIts ${n} agents, their chats, the Lead's task and the board are deleted. Files in its folder stay on your computer.`)) return
    try { await window.tyslin.agencies.remove(agency.id); onDeleted() } catch (e) { setError(errorText(e)) }
  }

  return (
    <div className="page ag-page">
      <header className="ag-head">
        <div>
          <div className="row" style={{ gap: 10 }}>
            <h1>{tab === 'edit' ? `Edit ${agency.name}` : agency.name}</h1>
            {tab !== 'edit' && <span className="ag-status"><span className={'ag-dot ' + st.tone} />{st.label}</span>}
          </div>
          {tab !== 'edit' && <p className="ag-statusline" role="status">{statusLine(lead, board, agency.paused)}</p>}
          {tab !== 'edit' && <p className="hint">{agency.goal || agency.description}</p>}
          {tab !== 'edit' && <p className="hint mono">{project.folder ?? 'No folder'}</p>}
        </div>
        <div className="row">
          {tab === 'edit' && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>}
          {tab !== 'edit' && (
            <>
              <button type="button" className="btn" onClick={() => void togglePause()}>{agency.paused ? 'Resume' : 'Pause'}</button>
              <button type="button" className="btn btn-lime" disabled={!lead || agency.paused} title={lead ? `${lead.name} plans the Inbox now` : 'Add a Lead first'} onClick={() => lead && onRun(lead)}>
                <Icon name="play" size={12} /> Run
              </button>
            </>
          )}
        </div>
      </header>
      {error && <p className="hint account-error" role="alert">{error}</p>}



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
          {side}
        </div>
      )}

      {tab === 'edit' && (
        <div className="ag-split">
          <div className="ag-col">
            <section className="card ag-sec">
              <h2>Basics</h2>
              <label className="field"><span className="label">Agency name</span><input className="input" value={draft.name ?? ''} onChange={(e) => set({ name: e.target.value })} /></label>
              <label className="field"><span className="label">What this agency does</span><textarea className="input" rows={2} value={draft.description ?? ''} onChange={(e) => set({ description: e.target.value })} placeholder="Describe the work in a sentence or two." /></label>
              <label className="field"><span className="label">Goal</span><input className="input" value={draft.goal ?? ''} onChange={(e) => set({ goal: e.target.value })} placeholder="One sentence" /></label>
              <label className="field"><span className="label">Agency prompt</span>
                <span className="hint">Every agent in this agency follows this. Each agent's own job instructions are on its page. Changes apply to new chats and new agents.</span>
                <textarea className="input" rows={4} value={draft.prompt ?? ''} onChange={(e) => set({ prompt: e.target.value })} placeholder="How this agency works: tools, style, what to ask you before doing." /></label>
            </section>
            <section className="card ag-sec">
              <h2>Plan</h2>
              <p className="hint">The Lead turns each step into cards in the Inbox.</p>
              {(draft.plan ?? []).map((p, i) => (
                <label key={i} className="row" style={{ gap: 10, alignItems: 'center' }}>
                  <span className="mono hint" style={{ width: 18 }}>{i + 1}</span>
                  <input className="input" value={p} aria-label={`Plan step ${i + 1}`} onChange={(e) => set({ plan: (draft.plan ?? []).map((x, j) => (j === i ? e.target.value : x)) })} />
                  <button type="button" className="btn btn-sm icon-btn" aria-label={`Remove step ${i + 1}`} onClick={() => set({ plan: (draft.plan ?? []).filter((_, j) => j !== i) })}><Icon name="close" size={12} /></button>
                </label>
              ))}
              <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ plan: [...(draft.plan ?? []), ''] })}><Icon name="plus" size={12} /> Add a step</button>
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
              <label className="field"><span className="label">New workers run on</span>
                <select className="select" value={draft.adapter ?? 'template'} onChange={(e) => set({ adapter: e.target.value })}>
                  <option value="template">Template's mix</option>
                  {AGENCY_ADAPTERS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <span className="hint">Existing agents keep theirs; change one on its page.</span></label>
              <label className="ag-check"><span>Lead runs cards automatically</span><input type="checkbox" checked={!!draft.autoRun} onChange={(e) => set({ autoRun: e.target.checked })} /></label>
              <label className="field"><span className="label">Monthly budget</span>
                <input className="input mono" value={draft.budget ?? ''} placeholder="Not set" inputMode="decimal"
                  onChange={(e) => set({ budget: e.target.value.trim() === '' ? null : Number(e.target.value) })} />
                <span className="hint">In your default model's currency. The Lead stops starting cards when it's reached. Spent so far: {agency.spent.toFixed(2)}.</span></label>
            </section>
            <section className="card ag-sec">
              <h2>Channel</h2>
              <label className="field"><span className="label">Lead talks to you on</span>
                <select className="select" value={draft.channel?.kind ?? 'none'} onChange={(e) => set({ channel: { kind: e.target.value as Agency['channel']['kind'] } })}>
                  <option value="none">Not now</option><option value="telegram">Telegram</option><option value="slack">Slack</option>
                </select></label>
              <label className="field"><span className="label">What the Lead sends</span>
                <select className="select" value={draft.notify ?? 'questions'} onChange={(e) => set({ notify: e.target.value as Agency['notify'] })}>
                  <option value="questions">Questions and reviews</option><option value="all">Everything</option><option value="digest">Digest only</option>
                </select></label>
            </section>
            <section className="card ag-sec">
              <h2>Folder</h2>
              <span className="mono hint" style={{ overflowWrap: 'anywhere' }}>{project.folder ?? 'No folder'}</span>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn btn-sm" onClick={onDrive}>Open in Drive</button>
                <button type="button" className="btn btn-sm" style={{ color: 'var(--danger, #A12A1D)' }} onClick={() => void remove()}>Delete agency</button>
              </div>
            </section>
            {saved && <p className="hint" role="status">{saved}</p>}
          </aside>
        </div>
      )}
    </div>
  )
}
