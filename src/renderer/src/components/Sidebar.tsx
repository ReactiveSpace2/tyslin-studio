import type { Project } from '@shared/types'
import type { Route } from '../App'
import logo from '../assets/logo-horizontal.png'
import { Icon } from './Icon'
import { UpdateNotice } from './UpdateNotice'

interface Props {
  route: Route
  projects: Project[]
  onNavigate: (r: Route) => void
  onOpenProject: (p: Project) => void
  onNewProject: () => void
}

export function Sidebar({ route, projects, onNavigate, onOpenProject, onNewProject }: Props): JSX.Element {
  const item = (name: Route['name'], label: string, icon: Parameters<typeof Icon>[0]['name'], to: Route): JSX.Element => (
    <button
      type="button"
      className={'nav-item' + (route.name === name || (name === 'agents' && route.name === 'editor') ? ' active' : '')}
      aria-current={route.name === name ? 'page' : undefined}
      onClick={() => onNavigate(to)}
    >
      <Icon name={icon} />
      {label}
    </button>
  )
  const activeProject = route.name === 'chat' ? route.projectId : null

  return (
    <nav className="sidebar" aria-label="Main">
      <div className="brand">
        <img src={logo} alt="Tyslin" />
      </div>
      <div className="nav">
        {item('agents', 'Agents', 'agents', { name: 'agents' })}
        {item('skills', 'Skills', 'skills', { name: 'skills' })}
      </div>
      <div className="nav">
        <div className="row" style={{ justifyContent: 'space-between', paddingRight: 4 }}>
          <span className="section-label">Projects</span>
          <button type="button" className="btn btn-sm icon-btn" style={{ width: 28, height: 28 }} aria-label="New project" onClick={onNewProject}>
            <Icon name="plus" size={12} />
          </button>
        </div>
        {projects.length === 0 && (
          <button type="button" className="nav-item" onClick={onNewProject}>
            Link a folder…
          </button>
        )}
        {projects.map((p) => (
          <button
            key={p.id}
            type="button"
            className={'nav-item' + (activeProject === p.id ? ' active' : '')}
            onClick={() => onOpenProject(p)}
            title={p.folder ?? undefined}
          >
            <Icon name="folder" />
            {p.name}
          </button>
        ))}
      </div>
      <div className="sidebar-foot">
        <UpdateNotice />
        <div className="workspace">
          <span className="section-label" style={{ padding: 0 }}>Workspace</span>
          <strong>Self-hosted · this computer</strong>
          <span>Data stored locally</span>
        </div>
        {item('settings', 'Settings', 'settings', { name: 'settings' })}
      </div>
    </nav>
  )
}
