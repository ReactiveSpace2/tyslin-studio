import { useListed } from '../currentProject'
import type { Agent, AgentKind, Project, Session } from '@shared/types'
import type { Route } from '../App'
import { Avatar } from './Avatar'
import { Icon } from './Icon'

type IconName = Parameters<typeof Icon>[0]['name']
type Section = 'agents' | 'assistants' | 'projects'

interface Props {
  route: Route
  agents: Agent[]
  projects: Project[]
  /** Most recent chats across all agents and assistants, newest first. */
  sessions: Session[]
  onNavigate: (r: Route) => void
  onOpenChat: (agentId: string, projectId: string | null, sessionId?: string, via?: 'projects') => void
  onNewProject: () => void
}

const CHATS_PER_ITEM = 5
const SECTION_KIND: Record<Exclude<Section, 'projects'>, AgentKind> = { agents: 'agent', assistants: 'assistant' }
const kindSection = (k: AgentKind): Section => (k === 'assistant' ? 'assistants' : 'agents')

/**
 * Icon rail (Home; Studio: Agency, Kanban, Channel, Skills, Drive; Settings at the foot) plus a panel listing
 * assistants or projects with their recent chats when one of those chats is open.
 */
export function Sidebar(props: Props): JSX.Element {
  const { route, agents, projects, sessions, onNavigate, onOpenChat, onNewProject } = props
  const builder = agents.find((a) => a.isMascot) ?? agents.find((a) => a.kind === 'agent')
  const kindOf = (id: string): AgentKind => agents.find((a) => a.id === id)?.kind ?? 'agent'

  const section: Section | null =
    route.name === 'chat' ? (route.via === 'projects' ? 'projects' : kindSection(kindOf(route.agentId)))
      : route.name === 'agents' || route.name === 'editor' ? kindSection(route.kind)
        : null

  const openProject = (p: Project): void => {
    const last = sessions.find((s) => s.projectId === p.id)
    if (last) onOpenChat(last.agentId, p.id, last.id, 'projects')
    else if (builder) onOpenChat(builder.id, p.id, undefined, 'projects')
  }

  const railBtn = (label: string, icon: IconName, active: boolean, onClick: () => void, groupName: string): JSX.Element => (
    <button
      type="button"
      className={'rail-btn' + (active ? ' active' : '')}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      title={`${label} · ${groupName}`}
      onClick={onClick}
    >
      <Icon name={icon} size={20} />
      <span className="rail-label" aria-hidden="true">{label}</span>
    </button>
  )

  /** A group break: a thin line, or a small heading when menu labels are on. */
  const group = (name: string): JSX.Element => (
    <span className="rail-group" aria-hidden="true">
      <span className="rail-sep" />
      <span className="rail-group-name">{name}</span>
      <span className="rail-sep" />
    </span>
  )

  const currentSession = route.name === 'chat' ? route.sessionId : undefined

  const chatRow = (s: Session, withAgent: boolean, via?: 'projects'): JSX.Element => {
    const a = agents.find((x) => x.id === s.agentId)
    const active = currentSession === s.id
    return (
      <button
        key={s.id}
        type="button"
        className={'panel-item panel-chat' + (withAgent ? ' with-agent' : '') + (active ? ' active' : '')}
        aria-current={active ? 'page' : undefined}
        onClick={() => onOpenChat(s.agentId, s.projectId, s.id, via)}
        title={a ? `${s.title} · ${a.name}` : s.title}
      >
        {withAgent && a && <Avatar shape={a.shape} tone={a.tone} head={a.head} mascot={a.isMascot} size={18} />}
        <span className="panel-label">{s.title}</span>
      </button>
    )
  }

  const inWs = useListed()
  const kindPanel = (sec: 'agents' | 'assistants'): JSX.Element => {
    const kind = SECTION_KIND[sec]
    const noun = kind === 'agent' ? 'agent' : 'assistant'
    const listOpen = route.name === 'agents' && route.kind === kind
    return (
      <nav className="panel" aria-label={sec === 'agents' ? 'Agents and chats' : 'Assistants and chats'}>
        <button type="button" className="panel-item panel-add" onClick={() => onNavigate({ name: 'editor', kind })}>
          <Icon name="plus" size={14} /> New {noun}
        </button>
        <button
          type="button"
          className={'panel-item panel-add' + (listOpen ? ' active' : '')}
          aria-current={listOpen ? 'page' : undefined}
          onClick={() => onNavigate({ name: 'agents', kind })}
        >
          <Icon name="grid" size={14} /> All {noun}s
        </button>
        {agents.filter((a) => a.kind === kind && inWs(a)).map((a) => {
          const chats = sessions.filter((s) => s.agentId === a.id).slice(0, CHATS_PER_ITEM)
          const here = (route.name === 'chat' && route.agentId === a.id && route.via !== 'projects') || (route.name === 'editor' && route.agentId === a.id)
          return (
            <div key={a.id} className="panel-group">
              <button
                type="button"
                className={'panel-item panel-agent' + (here && !chats.some((s) => s.id === currentSession) ? ' active' : '')}
                onClick={() => onOpenChat(a.id, null, chats[0]?.id)}
              >
                <Avatar shape={a.shape} tone={a.tone} head={a.head} mascot={a.isMascot} size={26} />
                <span className="panel-label">{a.name}</span>
              </button>
              {chats.map((s) => chatRow(s, false))}
            </div>
          )
        })}
      </nav>
    )
  }

  return (
    <>
      {/* Home, then Studio (Agency, Kanban, Channel, Skills, Drive), Settings at the foot. Agencies are
          switched in the title bar. */}
      <nav className="rail" aria-label="Main">
        {railBtn('Home', 'home', route.name === 'home', () => onNavigate({ name: 'home' }), 'Home')}
        {group('Studio')}
        {railBtn('Agency', 'agency', route.name === 'agencies' || route.name === 'agency' || route.name === 'newAgency', () => onNavigate({ name: 'agencies' }), 'Studio')}
        {railBtn('Kanban', 'kanban', route.name === 'kanban', () => onNavigate({ name: 'kanban' }), 'Studio')}
        {railBtn('Channel', 'channel', route.name === 'connectors', () => onNavigate({ name: 'connectors' }), 'Studio')}
        {railBtn('Skills', 'skills', route.name === 'skills', () => onNavigate({ name: 'skills' }), 'Studio')}
        {railBtn('Drive', 'drive', route.name === 'drive', () => onNavigate({ name: 'drive' }), 'Studio')}
        {/* Agents, Assistants, Tasks, Automation, Canvas, Mind mapper and Knowledge base are off the rail for
            the agency layout; their routes still exist and open from agency pages, Home and links. */}
        <div className="rail-foot">
          {railBtn('Settings', 'settings', route.name === 'settings', () => onNavigate({ name: 'settings' }), 'Setup')}
        </div>
      </nav>

      {/* Agents have their own page (list, cards, org chart), so only assistants get the side panel. */}
      {section === 'assistants' && kindPanel(section)}

      {section === 'projects' && (
        <nav className="panel" aria-label="Projects and chats">
          <button type="button" className="panel-item panel-add" onClick={onNewProject}>
            <Icon name="plus" size={14} /> New project
          </button>
          {projects.map((p) => {
            const chats = sessions.filter((s) => s.projectId === p.id).slice(0, CHATS_PER_ITEM)
            const here = route.name === 'chat' && route.via === 'projects' && route.projectId === p.id
            return (
              <div key={p.id} className="panel-group">
                <button
                  type="button"
                  className={'panel-item panel-agent' + (here && !chats.some((s) => s.id === currentSession) ? ' active' : '')}
                  onClick={() => openProject(p)}
                  title={p.folder ?? undefined}
                >
                  <span className="panel-folder"><Icon name="folder" /></span>
                  <span className="panel-label">{p.name}</span>
                </button>
                {chats.map((s) => chatRow(s, true, 'projects'))}
              </div>
            )
          })}
        </nav>
      )}
    </>
  )
}
