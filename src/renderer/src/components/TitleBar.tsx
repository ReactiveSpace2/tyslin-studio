import { useEffect, useRef, useState } from 'react'
import { useAgencyTabs, useCurrentProject } from '../currentProject'
import { Icon } from './Icon'
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
  onNavigate: (r: Route) => void
  /** A tab was picked, or an agency chosen from the + menu. */
  onSelectAgency: (id: string) => void
  onCloseAgency: (id: string) => void
  onNewAgency: () => void
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

/** The window's title bar: Organization, then the open agencies as tabs (+ opens or creates one) at the left; the screen's path is the window title; the Tyslin logo in the middle (opens Home). Empty space drags the window. GitHub stars are in Settings → About. */
export function TitleBar({ route, agents, projects, onNewOrg, onHome, onNavigate, onSelectAgency, onCloseAgency, onNewAgency }: Props): JSX.Element {
  const [mac, setMac] = useState(false)
  useEffect(() => { void window.tyslin.app.info().then((i) => setMac(i.platform.startsWith('darwin'))) }, [])

  // The agency the screens work in (Kanban, an agent): the selected project, unless it's the Default project.
  const [current] = useCurrentProject()
  const [defaultId, setDefaultId] = useState<string | null>(null)
  useEffect(() => { void getDefaultProjectIdSafe().then(setDefaultId) }, [projects.length])
  const agencyId = current && current !== defaultId ? current : null
  const crumbs = crumbsFor(route, agents, projects, agencyId, defaultId)
  const title = crumbs.map((c) => c.label).filter(Boolean).join(' › ')
  const tabs = useAgencyTabs()
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent): void => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false) }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [menu])
  const tabProjects = tabs.map((id) => projects.find((p) => p.id === id)).filter((p): p is Project => !!p)
  const closed = projects.filter((p) => p.id !== defaultId && !tabs.includes(p.id)).sort((a, b) => a.name.localeCompare(b.name))
  useEffect(() => { document.title = title ? `${title} · Tyslin Studio` : 'Tyslin Studio' }, [title])

  return (
    <header className={'titlebar' + (mac ? ' mac' : '')}>
      <div className="titlebar-left">
        <OrgSwitcher onNewOrg={onNewOrg} />
        <span className="titlebar-slash" aria-hidden="true">/</span>
        <div className="agency-tabs" role="tablist" aria-label="Open agencies">
          {tabProjects.map((p) => {
            const on = p.id === current
            return (
              <div key={p.id} className={'agency-tab' + (on ? ' on' : '')}>
                <button type="button" role="tab" aria-selected={on} className="agency-tab-btn" onClick={() => onSelectAgency(p.id)} title={p.name}>
                  <Icon name="agency" size={13} /><span>{p.name}</span>
                </button>
                <button type="button" className="agency-tab-x" aria-label={`Close ${p.name}`} onClick={() => onCloseAgency(p.id)}><Icon name="close" size={11} /></button>
              </div>
            )
          })}
          <div className="agency-plus-wrap" ref={menuRef}>
            <button type="button" className="agency-plus" aria-label="Open an agency" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><Icon name="plus" size={13} /></button>
            {menu && (
              <div className="switch-menu agency-menu" role="menu" aria-label="Open an agency">
                {closed.length > 0 && <span className="section-label">Open an agency</span>}
                {closed.map((p) => (
                  <button key={p.id} type="button" role="menuitem" onClick={() => { setMenu(false); onSelectAgency(p.id) }}>
                    <Icon name="agency" size={14} /><span className="switch-name">{p.name}</span>
                  </button>
                ))}
                {closed.length > 0 && <span className="switch-sep" aria-hidden="true" />}
                <button type="button" role="menuitem" onClick={() => { setMenu(false); onNavigate({ name: 'agencies' }) }}><Icon name="grid" size={14} /> All agencies</button>
                <button type="button" role="menuitem" onClick={() => { setMenu(false); onNewAgency() }}><Icon name="plus" size={14} /> New agency</button>
              </div>
            )}
          </div>
        </div>
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
