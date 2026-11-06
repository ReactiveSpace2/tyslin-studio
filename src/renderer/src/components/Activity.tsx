import { useEffect, useState } from 'react'
import type { Agent, DashboardStats, Project, Session } from '@shared/types'
import { Avatar } from './Avatar'
import { Icon } from './Icon'

interface Props {
  agents: Agent[]
  projects: Project[]
  /** Most recent chats, newest first. */
  sessions: Session[]
  onOpenChat: (agentId: string, projectId: string | null, sessionId?: string) => void
  /** Agencies in the organization (the Default project isn't one). */
  agencyCount?: number
}

const dayLabel = (day: string, style: 'short' | 'long'): string => {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return style === 'short'
    ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

const ago = (t: number): string => {
  const min = Math.round((Date.now() - t) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

/** Single-series column chart of messages sent per day, with a hover tooltip and a table for screen readers. */
function ActivityChart({ daily }: { daily: DashboardStats['daily'] }): JSX.Element {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...daily.map((d) => d.count))
  const top = Math.max(4, Math.ceil(max / 4) * 4)
  const total = daily.reduce((n, d) => n + d.count, 0)
  return (
    <figure className="dash-chart" aria-label={`Messages you sent per day over the last 14 days, ${total} in total`}>
      <div className="dash-plot" onMouseLeave={() => setHover(null)}>
        <div className="dash-grid" aria-hidden="true">
          {[top, top / 2, 0].map((v) => <span key={v}><em>{v}</em></span>)}
        </div>
        <div className="dash-bars" aria-hidden="true">
          {daily.map((d, i) => (
            <div key={d.day} className={'dash-col' + (hover === i ? ' on' : '')} onMouseEnter={() => setHover(i)}>
              <span className="dash-bar" style={{ height: `${(d.count / top) * 100}%` }} />
              {hover === i && (
                <span className={'dash-tip' + (i > daily.length - 4 ? ' left' : '')}>
                  <span className="dash-tip-value"><strong className="mono">{d.count}</strong> {d.count === 1 ? 'message' : 'messages'}</span>
                  <span>{dayLabel(d.day, 'long')}</span>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="dash-axis" aria-hidden="true">
        <span>{dayLabel(daily[0].day, 'short')}</span>
        <span>{dayLabel(daily[7].day, 'short')}</span>
        <span>Today</span>
      </div>
      <table className="sr-only">
        <caption>Messages you sent per day</caption>
        <thead><tr><th>Day</th><th>Messages</th></tr></thead>
        <tbody>{daily.map((d) => <tr key={d.day}><td>{dayLabel(d.day, 'long')}</td><td>{d.count}</td></tr>)}</tbody>
      </table>
    </figure>
  )
}

/** Home's activity section (formerly the Dashboard): counts, activity, reviews waiting, recent chats and most used. */
export function Activity({ agents, projects, sessions, onOpenChat, agencyCount }: Props): JSX.Element {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  useEffect(() => { void window.tyslin.app.dashboard().then(setStats) }, [sessions])

  const agentOf = (id: string): Agent | undefined => agents.find((a) => a.id === id)
  const projectName = (id: string | null): string | null => (id ? projects.find((p) => p.id === id)?.name ?? null : null)
  const nAgents = agents.filter((a) => a.kind === 'agent').length
  const nLeads = agents.filter((a) => a.kind === 'agent' && !!a.agency && !a.leadId).length
  const topMax = Math.max(1, ...(stats?.topAgents.map((t) => t.messages) ?? [1]))

  const tiles: [string, string | number, string][] = stats ? [
    ['Agents', nAgents, `${agents.filter((a) => a.kind === 'agent' && a.schedule !== 'manual').length} on a schedule`],
    ['Leads', nLeads, nLeads === 1 ? 'plans and reviews' : 'plan and review'],
    agencyCount === undefined
      ? ['Projects', projects.length, projects.length === 1 ? 'linked folder' : 'linked folders']
      : ['Agencies', agencyCount, 'in this organization'],
    ['Chats', stats.chats, `${stats.chatsThisWeek} this week`],
    ['Messages sent', stats.messages, `${stats.messagesThisWeek} this week`],
    ['Waiting for review', stats.pendingChanges, stats.pendingChanges === 1 ? 'file change' : 'file changes']
  ] : []

  const chatRow = (s: { sessionId: string; agentId: string; projectId: string | null; title: string }, meta: string): JSX.Element | null => {
    const a = agentOf(s.agentId)
    if (!a) return null
    return (
      <li key={s.sessionId}>
        <button type="button" className="dash-row" onClick={() => onOpenChat(s.agentId, s.projectId, s.sessionId)}>
          <Avatar shape={a.shape} tone={a.tone} head={a.head} mascot={a.isMascot} size={28} />
          <span className="dash-row-text">
            <strong>{s.title}</strong>
            <span>{a.name}{projectName(s.projectId) ? ` · ${projectName(s.projectId)}` : ''}</span>
          </span>
          <span className="dash-meta mono">{meta}</span>
        </button>
      </li>
    )
  }

  return (
    <section id="activity" className="home-section home-activity" aria-labelledby="activity-title">
      <div className="home-section-head">
        <h2 id="activity-title">What your agencies are doing</h2>
        <p className="hint">Activity from this computer: your agents' chats and the file changes waiting for you.</p>
      </div>

      {!stats ? <p className="hint">Loading…</p> : (
        <>
          <div className="dash-tiles">
            {tiles.map(([label, value, sub]) => (
              <div key={label} className={'dash-tile' + (label === 'Waiting for review' && stats.pendingChanges ? ' attention' : '')}>
                <span className="dash-label">{label}</span>
                <strong className="mono">{value}</strong>
                <span className="hint">{sub}</span>
              </div>
            ))}
          </div>

          <section className="box" aria-labelledby="activity-h">
            <div className="box-head">
              <h2 id="activity-h">Messages you sent</h2>
              <p className="hint">Last 14 days</p>
            </div>
            <ActivityChart daily={stats.daily} />
          </section>

          <div className="dash-cols">
            <section className="box" aria-labelledby="reviews-h">
              <div className="box-head">
                <h2 id="reviews-h">Waiting for review</h2>
                <p className="hint">File changes your agents proposed. Open the chat to accept or reject them.</p>
              </div>
              {stats.reviews.length
                ? <ul className="dash-list">{stats.reviews.map((r) => chatRow(r, `${r.count} ${r.count === 1 ? 'change' : 'changes'}`))}</ul>
                : <p className="hint dash-empty"><Icon name="check" size={14} /> Nothing waiting.</p>}
            </section>

            <section className="box" aria-labelledby="recent-h">
              <div className="box-head">
                <h2 id="recent-h">Recent chats</h2>
                <p className="hint">Pick up where you left off.</p>
              </div>
              {sessions.length
                ? <ul className="dash-list">{sessions.slice(0, 6).map((s) => chatRow({ ...s, sessionId: s.id }, ago(s.updatedAt)))}</ul>
                : <p className="hint dash-empty">No chats yet.</p>}
            </section>

            <section className="box" aria-labelledby="top-h">
              <div className="box-head">
                <h2 id="top-h">Most used</h2>
                <p className="hint">Messages you sent in the last 30 days.</p>
              </div>
              {stats.topAgents.length ? (
                <ul className="dash-list">
                  {stats.topAgents.map((t) => {
                    const a = agentOf(t.agentId)
                    if (!a) return null
                    return (
                      <li key={t.agentId}>
                        <button type="button" className="dash-row" onClick={() => onOpenChat(a.id, null)}>
                          <Avatar shape={a.shape} tone={a.tone} head={a.head} mascot={a.isMascot} size={28} />
                          <span className="dash-row-text">
                            <strong>{a.name}</strong>
                            <span className="dash-meter" aria-hidden="true"><span style={{ width: `${(t.messages / topMax) * 100}%` }} /></span>
                          </span>
                          <span className="dash-meta mono">{t.messages}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : <p className="hint dash-empty">No messages in the last 30 days.</p>}
            </section>
          </div>
        </>
      )}
    </section>
  )
}
