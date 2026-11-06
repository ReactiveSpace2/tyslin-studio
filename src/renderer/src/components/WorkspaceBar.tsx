import { useEffect, useRef, useState } from 'react'
import type { Project } from '@shared/types'
import type { Route } from '../App'
import { useAgencyTabs, useCurrentProject } from '../currentProject'
import { Icon } from './Icon'
import { OrgSwitcher } from './OrgSwitcher'
import { getDefaultProjectIdSafe } from './titleCrumbs'

/** Workspace bar, under the toolbar: the organization, then its open agencies as tabs (+ opens or creates one). */
export function WorkspaceBar({ projects, onNewOrg, onNavigate, onSelectAgency, onCloseAgency, onNewAgency }: {
  projects: Project[]
  onNewOrg: () => void
  onNavigate: (r: Route) => void
  onSelectAgency: (id: string) => void
  onCloseAgency: (id: string) => void
  onNewAgency: () => void
}): JSX.Element {
  const [current] = useCurrentProject()
  const [defaultId, setDefaultId] = useState<string | null>(null)
  useEffect(() => { void getDefaultProjectIdSafe().then(setDefaultId) }, [projects.length])
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

  return (
    <div className="workspace-bar" role="navigation" aria-label="Workspace">
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
  )
}
