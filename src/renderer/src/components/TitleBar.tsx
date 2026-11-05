import { useEffect, useState } from 'react'
import type { Agent, Project } from '@shared/types'
import type { Route } from '../App'
import mark from '../assets/logo-mark.png'
import { ZoomControl } from './ZoomControl'
import { GitHubStars } from './GitHubStars'
import { OrgSwitcher } from './OrgSwitcher'
import { ProjectSwitcher } from './ProjectSwitcher'
import wordmarkBlack from '../assets/wordmark-black.png'
import wordmarkWhite from '../assets/wordmark-white.png'

interface Props {
  route: Route
  agents: Agent[]
  projects: Project[]
  onNewOrg: () => void
  onNewProject: () => void
}

const TITLES: Partial<Record<Route['name'], string>> = {
  home: 'Home', dashboard: 'Dashboard', tasks: 'Scheduled tasks', skills: 'Skills', settings: 'Settings', art: 'Art', videos: 'Videos',
  automation: 'Automation', canvas: 'Canvas', mindmap: 'Mind mapper', kanban: 'Kanban', drive: 'Drive', knowledge: 'Knowledge base', connectors: 'Connectors'
}

function titleFor(route: Route, agents: Agent[], projects: Project[]): string {
  if (route.name === 'agents') return route.kind === 'assistant' ? 'Assistants' : 'Agents'
  if (route.name === 'editor') {
    const noun = route.kind === 'assistant' ? 'assistant' : 'agent'
    return route.agentId ? `Edit ${noun}` : `New ${noun}`
  }
  if (route.name === 'chat') {
    const agent = agents.find((a) => a.id === route.agentId)
    const project = projects.find((p) => p.id === route.projectId)
    return [project?.name, agent?.name].filter(Boolean).join(' / ') || 'Chat'
  }
  return TITLES[route.name] ?? ''
}

/** The window's title bar: Tyslin mark and wordmark, the current screen's name, the organization switcher and zoom. Empty space drags the window. */
export function TitleBar({ route, agents, projects, onNewOrg, onNewProject }: Props): JSX.Element {
  const [mac, setMac] = useState(false)
  useEffect(() => { void window.tyslin.app.info().then((i) => setMac(i.platform.startsWith('darwin'))) }, [])

  return (
    <header className={'titlebar' + (mac ? ' mac' : '')}>
      <div className="titlebar-side">
        <img className="titlebar-logo" src={mark} alt="" />
        <img className="titlebar-wordmark light-only" src={wordmarkBlack} alt="Tyslin" />
        <img className="titlebar-wordmark dark-only" src={wordmarkWhite} alt="Tyslin" />
        <GitHubStars compact />
      </div>
      <div className="titlebar-main">
        <span className="titlebar-title">{titleFor(route, agents, projects)}</span>
        <span className="titlebar-sep" aria-hidden="true" />
        <OrgSwitcher onNewOrg={onNewOrg} />
        <span className="titlebar-slash" aria-hidden="true">/</span>
        <ProjectSwitcher projects={projects} onNewProject={onNewProject} />
        <span className="status-item titlebar-local" title="Agents, chats and keys are stored on this computer">
          <span className="status-dot" aria-hidden="true" /> Local
        </span>
        <ZoomControl compact />
      </div>
    </header>
  )
}
