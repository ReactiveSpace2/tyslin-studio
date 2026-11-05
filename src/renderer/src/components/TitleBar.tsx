import { useEffect, useState } from 'react'
import type { Agent, Project } from '@shared/types'
import type { Route } from '../App'
import mark from '../assets/logo-mark.png'
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
  onOpenProjectChats: () => void
  onHome: () => void
  onProjectsChanged: () => void
}

const TITLES: Partial<Record<Route['name'], string>> = {
  home: 'Home', tasks: 'Scheduled tasks', skills: 'Skills', settings: 'Settings', art: 'Image', videos: 'Videos',
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

/** The window's title bar: Organization / Project at the left, the Tyslin logo in the middle (opens Home) with the GitHub stars. Empty space drags the window. */
export function TitleBar({ route, agents, projects, onNewOrg, onNewProject, onOpenProjectChats, onHome, onProjectsChanged }: Props): JSX.Element {
  const [mac, setMac] = useState(false)
  useEffect(() => { void window.tyslin.app.info().then((i) => setMac(i.platform.startsWith('darwin'))) }, [])

  // The screen's name is no longer shown in the bar; it stays the window title for screen readers and the taskbar.
  const title = titleFor(route, agents, projects)
  useEffect(() => { document.title = title ? `${title} · Tyslin Studio` : 'Tyslin Studio' }, [title])

  return (
    <header className={'titlebar' + (mac ? ' mac' : '')}>
      <div className="titlebar-left">
        <OrgSwitcher onNewOrg={onNewOrg} />
        <span className="titlebar-slash" aria-hidden="true">/</span>
        <ProjectSwitcher projects={projects} agents={agents} onNewProject={onNewProject} onOpenChats={onOpenProjectChats} onChanged={onProjectsChanged} />
      </div>
      <div className="titlebar-center">
        <button type="button" className={'titlebar-home' + (route.name === 'home' ? ' on' : '')} onClick={onHome} aria-label="Home" title="Home" aria-current={route.name === 'home' ? 'page' : undefined}>
          <img className="titlebar-logo" src={mark} alt="" />
          <img className="titlebar-wordmark light-only" src={wordmarkBlack} alt="" />
          <img className="titlebar-wordmark dark-only" src={wordmarkWhite} alt="" />
        </button>
        <GitHubStars compact />
      </div>
      <div className="titlebar-right" />
    </header>
  )
}
