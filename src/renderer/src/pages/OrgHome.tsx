import { useEffect, useState } from 'react'
import type { Agent, AppInfo, Project, Session } from '@shared/types'
import logo from '../assets/logo-horizontal.png'
import mark from '../assets/logo-mark.png'
import wordmarkWhite from '../assets/wordmark-white.png'
import mascot from '../assets/mascot-pose-1.png'
import type { AgencyView } from '../agencies'
import { agencyStatus } from '../agencies'
import { Avatar } from '../components/Avatar'
import { Activity } from '../components/Activity'
import { Icon } from '../components/Icon'
import { Watermark } from '../components/Watermark'

interface Props {
  you: string
  orgName: string
  agencies: AgencyView[]
  agents: Agent[]
  projects: Project[]
  sessions: Session[]
  focus?: 'activity'
  onOpenAgency: (projectId: string) => void
  onAllAgencies: () => void
  onNewAgency: () => void
  onOpenChat: (agentId: string, projectId: string | null, sessionId?: string) => void
}

const greeting = (): string => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' }

/** Home: the organization and its agencies, then what the studio is doing. */
export function OrgHome({ you, orgName, agencies, agents, projects, sessions, focus, onOpenAgency, onAllAgencies, onNewAgency, onOpenChat }: Props): JSX.Element {
  useEffect(() => { if (focus === 'activity') document.getElementById('activity')?.scrollIntoView({ block: 'start' }) }, [focus])
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => { void window.tyslin.app.info().then(setInfo) }, [])
  const leads = agencies.filter((v) => v.lead).length
  const workers = agencies.reduce((n, v) => n + v.workers.length, 0)
  return (
    <div className="page home watermarked ag-home">
      <Watermark />
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-intro">
          <img src={logo} alt="Tyslin" className="home-logo light-only" />
          <span className="home-logo-dark dark-only">
            <img src={mark} alt="Tyslin" />
            <img src={wordmarkWhite} alt="" />
          </span>
          <div className="row" style={{ gap: 8 }}>
            <span className="badge green mono">v{info?.version ?? '…'}</span>
            <span className="badge mono">Beta</span>
          </div>
          <h1 id="home-title">Tyslin Studio</h1>
          <p className="home-tagline">Every agent you run. One studio.</p>
          <p className="lead">
            Agencies do the work in your folders: a Lead plans the board and hands cards to its workers, each on the model
            or agent you choose. You review every change before it touches your files, and the Lead tells you what's done
            on Telegram or Slack.
          </p>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={agencies.length ? onAllAgencies : onNewAgency}>
              <Icon name="agency" size={14} /> {agencies.length ? `Open your ${agencies.length} ${agencies.length === 1 ? 'agency' : 'agencies'}` : 'Create an agency'}
            </button>
          </div>
        </div>
        <img src={mascot} alt="The Tyslin robot mascot standing" className="home-mascot" />
      </section>
      <header className="ag-head">
        <div>
          <span className="eyebrow">{orgName || 'Organization'}</span>
          <h1>{greeting()}{you !== 'You' ? `, ${you}` : ''}</h1>
          <p className="hint">{orgName || 'Your organization'} runs {agencies.length} {agencies.length === 1 ? 'agency' : 'agencies'}. Each has its own Lead, team, board and folder.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onNewAgency}><Icon name="plus" size={12} /> New agency</button>
      </header>

      <div className="ag-stats">
        <div className="card ag-stat"><span className="hint">Agencies</span><strong className="mono">{agencies.length}</strong></div>
        <div className="card ag-stat"><span className="hint">Agents</span><strong className="mono">{agents.filter((a) => a.kind === 'agent' && !a.isMascot).length}</strong></div>
        <div className="card ag-stat"><span className="hint">Leads</span><strong className="mono">{leads}</strong></div>
        <div className="card ag-stat"><span className="hint">Workers</span><strong className="mono">{workers}</strong></div>
      </div>

      <div className="ag-sub"><h2>Your agencies</h2><button type="button" className="link-btn" onClick={onAllAgencies}>See all</button></div>
      <div className="ag-cards">
        {agencies.map((v) => {
          const st = agencyStatus(v)
          return (
            <button key={v.project.id} type="button" className="card ag-card" onClick={() => onOpenAgency(v.project.id)}>
              <span className="ag-card-top">
                {v.lead ? <Avatar shape={v.lead.shape} tone={v.lead.tone} head={v.lead.head} size={36} /> : <span className="area-icon"><Icon name="agency" size={16} /></span>}
                <span><strong>{v.project.name}</strong><span className="hint">{v.lead?.name ?? 'No Lead yet'}</span></span>
              </span>
              <span className="ag-team">{v.workers.slice(0, 5).map((w) => <Avatar key={w.id} shape={w.shape} tone={w.tone} head={w.head} size={24} />)}</span>
              <span className="ag-card-foot"><span className="ag-status"><span className={'ag-dot ' + st.tone} />{st.label}</span><span className="mono hint">{v.workers.length + (v.lead ? 1 : 0)} agents</span></span>
            </button>
          )
        })}
        <button type="button" className="card ag-card ag-new" onClick={onNewAgency}>
          <span className="ag-plus"><Icon name="plus" size={16} /></span>
          <strong>New agency</strong>
          <span className="hint">Start from one of 20 templates or describe your own.</span>
        </button>
      </div>

      <Activity agents={agents} projects={projects} sessions={sessions} onOpenChat={onOpenChat} agencyCount={agencies.length} />
    </div>
  )
}
