import { useEffect, useRef, useState } from 'react'
import type { Project } from '@shared/types'
import { useCurrentProject } from '../currentProject'
import { Icon } from './Icon'

/** Project picker in the title bar, after the organization. One project is always selected. */
export function ProjectSwitcher({ projects, onNewProject, onOpenChats }: { projects: Project[]; onNewProject: () => void; onOpenChats: () => void }): JSX.Element {
  const [projectId, setProjectId] = useCurrentProject()
  const [open, setOpen] = useState(false)
  const [defaultId, setDefaultId] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { void window.tyslin.studio.defaultProject().then((p) => setDefaultId(p.id)) }, [projects.length])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  // The Default project first, then the rest by name.
  const list = [...projects].sort((a, b) => Number(b.id === defaultId) - Number(a.id === defaultId) || a.name.localeCompare(b.name))
  const current = projects.find((p) => p.id === projectId)
  const name = current?.name ?? 'Default project'

  return (
    <div className="org-switch project-switch" ref={ref}>
      <button type="button" className="status-item status-btn org-btn" aria-haspopup="menu" aria-expanded={open}
        aria-label={`Project: ${name}. Switch project`} onClick={() => setOpen((o) => !o)}>
        <Icon name="folder" size={13} />
        <span className="switch-name">{name}</span>
        <Icon name="updown" size={12} />
      </button>
      {open && (
        <div className="switch-menu" role="menu" aria-label="Projects">
          <span className="section-label">Projects</span>
          {list.map((p) => (
            <button key={p.id} type="button" role="menuitemradio" aria-checked={p.id === projectId} onClick={() => { setProjectId(p.id); setOpen(false) }}
              title={p.folder ?? 'No folder linked'}>
              <Icon name={p.id === defaultId ? 'drive' : 'folder'} size={14} />
              <span className="switch-name">{p.name}</span>
              {p.id === defaultId && <span className="switch-meta">default</span>}
              {!p.folder && <span className="switch-meta">no folder</span>}
              {p.id === projectId && <Icon name="check" size={14} />}
            </button>
          ))}
          <span className="switch-sep" aria-hidden="true" />
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onOpenChats() }}>
            <Icon name="chat" size={14} /> Open project chats
          </button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onNewProject() }}>
            <Icon name="plus" size={14} /> New project
          </button>
        </div>
      )}
    </div>
  )
}
