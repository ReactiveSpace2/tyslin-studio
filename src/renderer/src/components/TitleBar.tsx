import { useEffect, useRef, useState } from 'react'
import type { Agent, Organization, Project } from '@shared/types'
import type { Route } from '../App'
import { Icon } from './Icon'

interface Props {
  route: Route
  agents: Agent[]
  projects: Project[]
  onNewOrg: () => void
}

const TITLES: Partial<Record<Route['name'], string>> = {
  home: 'Home', dashboard: 'Dashboard', skills: 'Skills', settings: 'Settings', art: 'Art', videos: 'Videos',
  workflows: 'Workflows', canvas: 'Canvas', mindmap: 'Mind mapper', drive: 'Drive', knowledge: 'Knowledge base', connectors: 'Connectors'
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

const initial = (name: string): string => name.trim().slice(0, 1).toUpperCase() || '?'

/** The window's title bar: organization switcher, then the current screen's name. Empty space drags the window. */
export function TitleBar({ route, agents, projects, onNewOrg }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const [mac, setMac] = useState(false)
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [error, setError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void window.tyslin.app.info().then((i) => setMac(i.platform.startsWith('darwin')))
    void window.tyslin.orgs.list().then(setOrgs)
  }, [])

  // Close the menu on an outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = orgs.find((o) => o.current)
  const name = current?.name ?? 'Tyslin'

  /** Switching reopens the app inside the other organization, so every screen starts fresh. */
  const switchTo = async (o: Organization): Promise<void> => {
    setOpen(false)
    if (o.current) return
    try {
      await window.tyslin.orgs.switch(o.id)
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
      setTimeout(() => setError(null), 4000)
    }
  }

  return (
    <header className={'titlebar' + (mac ? ' mac' : '')}>
      <div className="titlebar-side">
        <div className="titlebar-switch" ref={menuRef}>
          <button type="button" className="switch-btn" aria-haspopup="menu" aria-expanded={open}
            aria-label={`Organization: ${name}. Switch organization`} onClick={() => setOpen((o) => !o)}>
            <span className="switch-initial" aria-hidden="true">{initial(name)}</span>
            <span className="switch-name">{name}</span>
            <Icon name="updown" size={14} />
          </button>
          {open && (
            <div className="switch-menu" role="menu" aria-label="Organizations">
              <span className="section-label">Organizations</span>
              {orgs.map((o) => (
                <button key={o.id} type="button" role="menuitemradio" aria-checked={o.current} onClick={() => void switchTo(o)}>
                  <span className="switch-initial small" aria-hidden="true">{initial(o.name)}</span>
                  <span className="switch-name">{o.name}</span>
                  {o.current && <Icon name="check" size={14} />}
                </button>
              ))}
              <span className="switch-sep" aria-hidden="true" />
              <button type="button" role="menuitem" onClick={() => { setOpen(false); onNewOrg() }}>
                <Icon name="plus" size={14} /> New organization
              </button>
            </div>
          )}
          {error && <span className="switch-error" role="alert">{error}</span>}
        </div>
      </div>
      <div className="titlebar-main">
        <span className="titlebar-title">{titleFor(route, agents, projects)}</span>
      </div>
    </header>
  )
}
