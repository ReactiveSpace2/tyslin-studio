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
  onOpenChat: (agentId: string, projectId: string | null, sessionId?: string) => void
  onNewProject: () => void
}

const CHATS_PER_ITEM = 5
const SECTION_KIND: Record<Exclude<Section, 'projects'>, AgentKind> = { agents: 'agent', assistants: 'assistant' }
const kindSection = (k: AgentKind): Section => (k === 'assistant' ? 'assistants' : 'agents')

/**
 * Icon rail (Home, Dashboard, Agents, Assistants, Tasks, Art, Videos, Workflows, Canvas, Mind mapper, Projects; Drive, Knowledge base, Connectors, Skills, Settings at the
 * bottom) plus a panel listing agents, assistants or projects with their recent chats.
 */
export function Sidebar(props: Props): JSX.Element {
  const { route, agents, projects, sessions, onNavigate, onOpenChat, onNewProject } = props
  const builder = agents.find((a) => a.isMascot) ?? agents.find((a) => a.kind === 'agent')
  const kindOf = (id: string): AgentKind => agents.find((a) => a.id === id)?.kind ?? 'agent'

  const section: Section | null =
    route.name === 'chat' ? (route.projectId ? 'projects' : kindSection(kindOf(route.agentId)))
      : route.name === 'agents' || route.name === 'editor' ? kindSection(route.kind)
        : null

  /** Latest chat outside projects for this kind, or its list page when there are none yet. */
  const openKind = (kind: AgentKind): void => {
    const last = sessions.find((s) => !s.projectId && kindOf(s.agentId) === kind)
    if (last) onOpenChat(last.agentId, null, last.id)
    else onNavigate({ name: 'agents', kind })
  }
  const openProject = (p: Project): void => {
    const last = sessions.find((s) => s.projectId === p.id)
    if (last) onOpenChat(last.agentId, p.id, last.id)
    else if (builder) onOpenChat(builder.id, p.id)
  }
  const openProjects = (): void => {
    const last = sessions.find((s) => s.projectId && projects.some((p) => p.id === s.projectId))
    if (last) onOpenChat(last.agentId, last.projectId, last.id)
    else if (projects[0]) openProject(projects[0])
    else onNewProject()
  }

  const railBtn = (label: string, icon: IconName, active: boolean, onClick: () => void): JSX.Element => (
    <button
      type="button"
      className={'rail-btn' + (active ? ' active' : '')}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      title={label}
      onClick={onClick}
    >
      <Icon name={icon} size={20} />
    </button>
  )

  const currentSession = route.name === 'chat' ? route.sessionId : undefined

  const chatRow = (s: Session, withAgent: boolean): JSX.Element => {
    const a = agents.find((x) => x.id === s.agentId)
    const active = currentSession === s.id
    return (
      <button
        key={s.id}
        type="button"
        className={'panel-item panel-chat' + (withAgent ? ' with-agent' : '') + (active ? ' active' : '')}
        aria-current={active ? 'page' : undefined}
        onClick={() => onOpenChat(s.agentId, s.projectId, s.id)}
        title={a ? `${s.title} · ${a.name}` : s.title}
      >
        {withAgent && a && <Avatar shape={a.shape} tone={a.tone} mascot={a.isMascot} size={18} />}
        <span className="panel-label">{s.title}</span>
      </button>
    )
  }

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
        {agents.filter((a) => a.kind === kind).map((a) => {
          const chats = sessions.filter((s) => s.agentId === a.id && !s.projectId).slice(0, CHATS_PER_ITEM)
          const here = (route.name === 'chat' && route.agentId === a.id && !route.projectId) || (route.name === 'editor' && route.agentId === a.id)
          return (
            <div key={a.id} className="panel-group">
              <button
                type="button"
                className={'panel-item panel-agent' + (here && !chats.some((s) => s.id === currentSession) ? ' active' : '')}
                onClick={() => onOpenChat(a.id, null, chats[0]?.id)}
              >
                <Avatar shape={a.shape} tone={a.tone} mascot={a.isMascot} size={26} />
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
      <nav className="rail" aria-label="Main">
        {railBtn('Home', 'home', route.name === 'home', () => onNavigate({ name: 'home' }))}
        {railBtn('Dashboard', 'dashboard', route.name === 'dashboard', () => onNavigate({ name: 'dashboard' }))}
        {railBtn('Agents', 'agents', section === 'agents', () => openKind('agent'))}
        {railBtn('Assistants', 'chat', section === 'assistants', () => openKind('assistant'))}
        {railBtn('Tasks', 'clock', route.name === 'tasks', () => onNavigate({ name: 'tasks' }))}
        {railBtn('Art', 'art', route.name === 'art', () => onNavigate({ name: 'art' }))}
        {railBtn('Videos', 'video', route.name === 'videos', () => onNavigate({ name: 'videos' }))}
        {railBtn('Workflows', 'workflow', route.name === 'workflows', () => onNavigate({ name: 'workflows' }))}
        {railBtn('Canvas', 'canvas', route.name === 'canvas', () => onNavigate({ name: 'canvas' }))}
        {railBtn('Mind mapper', 'mindmap', route.name === 'mindmap', () => onNavigate({ name: 'mindmap' }))}
        <span className="rail-sep" aria-hidden="true" />
        {railBtn('Projects', 'folder', section === 'projects', openProjects)}
        <div className="rail-foot">
          {railBtn('Drive', 'drive', route.name === 'drive', () => onNavigate({ name: 'drive' }))}
          {railBtn('Knowledge base', 'knowledge', route.name === 'knowledge', () => onNavigate({ name: 'knowledge' }))}
          {railBtn('Connectors', 'connectors', route.name === 'connectors', () => onNavigate({ name: 'connectors' }))}
          {railBtn('Skills', 'skills', route.name === 'skills', () => onNavigate({ name: 'skills' }))}
          {railBtn('Settings', 'settings', route.name === 'settings', () => onNavigate({ name: 'settings' }))}
        </div>
      </nav>

      {(section === 'agents' || section === 'assistants') && kindPanel(section)}

      {section === 'projects' && (
        <nav className="panel" aria-label="Projects and chats">
          <button type="button" className="panel-item panel-add" onClick={onNewProject}>
            <Icon name="plus" size={14} /> New project
          </button>
          {projects.map((p) => {
            const chats = sessions.filter((s) => s.projectId === p.id).slice(0, CHATS_PER_ITEM)
            const here = route.name === 'chat' && route.projectId === p.id
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
                {chats.map((s) => chatRow(s, true))}
              </div>
            )
          })}
        </nav>
      )}
    </>
  )
}
