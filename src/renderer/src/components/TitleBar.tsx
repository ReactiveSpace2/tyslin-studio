import { useEffect, useState } from 'react'
import { useCurrentProject } from '../currentProject'
import type { Agent, Project } from '@shared/types'
import type { Route } from '../App'
import mark from '../assets/logo-mark.png'
import { OrgSwitcher } from './OrgSwitcher'
import { getDefaultProjectIdSafe } from './titleCrumbs'
import wordmarkBlack from '../assets/wordmark-black.png'
import wordmarkWhite from '../assets/wordmark-white.png'

interface Props {
  route: Route
  agents: Agent[]
  projects: Project[]
  onNewOrg: () => void
  onHome: () => void
  /** A breadcrumb was clicked. */
  onNavigate: (r: Route) => void
}

const TITLES: Partial<Record<Route['name'], string>> = {
  home: 'Home', agencies: 'Agencies', tasks: 'Scheduled tasks', skills: 'Skills', settings: 'Settings', art: 'Image', videos: 'Videos',
  automation: 'Automation', canvas: 'Canvas', mindmap: 'Mind mapper', kanban: 'Kanban', drive: 'Drive', knowledge: 'Knowledge base', connectors: 'Channel'
}

interface Crumb { label: string; to?: Route }

/** The screen's title, with the screens above it as a path: Agencies › Support › Edit. */
function crumbsFor(route: Route, agents: Agent[], projects: Project[], agencyId: string | null, defaultId: string | null): Crumb[] {
  const agencies: Crumb = { label: 'Agencies', to: { name: 'agencies' } }
  const agency = (id: string | null): Crumb[] => {
    const p = !id || id === defaultId ? null : projects.find((x) => x.id === id)
    return p ? [agencies, { label: p.name, to: { name: 'agency', id: p.id, tab: 'org' } }] : []
  }
  switch (route.name) {
    case 'newAgency': return [agencies, { label: 'New agency' }]
    case 'agency': {
      const p = projects.find((x) => x.id === route.id)
      return route.tab === 'edit'
        ? [agencies, { label: p?.name ?? 'Agency', to: { name: 'agency', id: route.id, tab: 'org' } }, { label: 'Edit' }]
        : [agencies, { label: p?.name ?? 'Agency' }]
    }
    case 'kanban': return agencyId ? [...agency(agencyId), { label: 'Board' }] : [{ label: 'Kanban' }]
    case 'agents': return [{ label: route.kind === 'assistant' ? 'Assistants' : 'Agents' }]
    case 'editor': {
      const a = agents.find((x) => x.id === route.agentId)
      if (!a) return [{ label: route.kind === 'assistant' ? 'New assistant' : 'New agent' }]
      if (a.kind === 'assistant') return [{ label: 'Assistants', to: { name: 'agents', kind: 'assistant' } }, { label: a.name }]
      const up = agency(a.projectId)
      return up.length ? [...up, { label: a.name }] : [{ label: 'Agents', to: { name: 'agents', kind: 'agent' } }, { label: a.name }]
    }
    case 'chat': {
      const a = agents.find((x) => x.id === route.agentId)
      const up = agency(route.projectId)
      return [...up, { label: a?.name ?? 'Chat' }]
    }
    default: return [{ label: TITLES[route.name] ?? '' }]
  }
}

/** The window's title bar: Organization / screen title (with its path as breadcrumbs) at the left, the Tyslin logo in the middle (opens Home). Empty space drags the window. GitHub stars are in Settings → About. */
export function TitleBar({ route, agents, projects, onNewOrg, onHome, onNavigate }: Props): JSX.Element {
  const [mac, setMac] = useState(false)
  useEffect(() => { void window.tyslin.app.info().then((i) => setMac(i.platform.startsWith('darwin'))) }, [])

  // The agency the screens work in (Kanban, an agent): the selected project, unless it's the Default project.
  const [current] = useCurrentProject()
  const [defaultId, setDefaultId] = useState<string | null>(null)
  useEffect(() => { void getDefaultProjectIdSafe().then(setDefaultId) }, [projects.length])
  const agencyId = current && current !== defaultId ? current : null
  const crumbs = crumbsFor(route, agents, projects, agencyId, defaultId)
  const title = crumbs.map((c) => c.label).filter(Boolean).join(' › ')
  useEffect(() => { document.title = title ? `${title} · Tyslin Studio` : 'Tyslin Studio' }, [title])

  return (
    <header className={'titlebar' + (mac ? ' mac' : '')}>
      <div className="titlebar-left">
        <OrgSwitcher onNewOrg={onNewOrg} />
        <span className="titlebar-slash" aria-hidden="true">/</span>
        <nav className="titlebar-crumbs" aria-label="You are here">
          {crumbs.map((c, i) => (
            <span key={i} className="crumb">
              {i > 0 && <span className="crumb-sep" aria-hidden="true">›</span>}
              {c.to && i < crumbs.length - 1
                ? <button type="button" className="crumb-link" onClick={() => onNavigate(c.to!)}>{c.label}</button>
                : <span className="crumb-here" aria-current="page">{c.label}</span>}
            </span>
          ))}
        </nav>
      </div>
      <div className="titlebar-center">
        <button type="button" className={'titlebar-home' + (route.name === 'home' ? ' on' : '')} onClick={onHome} aria-label="Home" title="Home" aria-current={route.name === 'home' ? 'page' : undefined}>
          <img className="titlebar-logo" src={mark} alt="" />
          <img className="titlebar-wordmark light-only" src={wordmarkBlack} alt="" />
          <img className="titlebar-wordmark dark-only" src={wordmarkWhite} alt="" />
        </button>
      </div>
      <div className="titlebar-right" />
    </header>
  )
}
