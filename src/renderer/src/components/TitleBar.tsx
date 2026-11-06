import { useEffect, useState } from 'react'
import { useCurrentProject } from '../currentProject'
import type { Agent, Project } from '@shared/types'
import type { Route } from '../App'
import mark from '../assets/logo-mark.png'
import { getDefaultProjectIdSafe } from './titleCrumbs'
import wordmarkBlack from '../assets/wordmark-black.png'
import wordmarkWhite from '../assets/wordmark-white.png'

interface Props {
  route: Route
  agents: Agent[]
  projects: Project[]
  onHome: () => void
}

const TITLES: Partial<Record<Route['name'], string>> = {
  home: 'Home', agencies: 'Agencies', skills: 'Skills', settings: 'Settings', kanban: 'Kanban', drive: 'Drive', connectors: 'Channel'
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
      return route.tab === 'org'
        ? [agencies, { label: p?.name ?? 'Agency' }]
        : [agencies, { label: p?.name ?? 'Agency', to: { name: 'agency', id: route.id, tab: 'org' } }, { label: route.tab === 'edit' ? 'Edit' : 'Lead chat' }]
    }
    case 'kanban': return agencyId ? [...agency(agencyId), { label: 'Board' }] : [{ label: 'Kanban' }]
    case 'editor': {
      const a = agents.find((x) => x.id === route.agentId)
      if (!a) return [agencies, { label: 'Agent' }]
      const up = agency(a.projectId)
      return up.length ? [...up, { label: a.name }] : [agencies, { label: a.name }]
    }
    case 'chat': {
      const a = agents.find((x) => x.id === route.agentId)
      const up = agency(route.projectId)
      return [...up, { label: a?.name ?? 'Chat' }]
    }
    default: return [{ label: TITLES[route.name] ?? '' }]
  }
}

/** The window's title bar: the Tyslin logo in the middle (opens Home), nothing else. Empty space drags the window; the screen's path is the window title. */
export function TitleBar({ route, agents, projects, onHome }: Props): JSX.Element {
  const [mac, setMac] = useState(false)
  useEffect(() => { void window.tyslin.app.info().then((i) => setMac(i.platform.startsWith('darwin'))) }, [])
  const [current] = useCurrentProject()
  const [defaultId, setDefaultId] = useState<string | null>(null)
  useEffect(() => { void getDefaultProjectIdSafe().then(setDefaultId) }, [projects.length])
  const agencyId = current && current !== defaultId ? current : null
  const title = crumbsFor(route, agents, projects, agencyId, defaultId).map((c) => c.label).filter(Boolean).join(' › ')
  useEffect(() => { document.title = title ? `${title} · Tyslin Studio` : 'Tyslin Studio — run your own AI agency' }, [title])

  return (
    <header className={'titlebar' + (mac ? ' mac' : '')}>
      <div className="titlebar-left" />
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
