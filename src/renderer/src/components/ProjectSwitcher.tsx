import { useEffect, useRef, useState } from 'react'
import type { Agent, Project } from '@shared/types'
import { forgetProject, useCurrentProject } from '../currentProject'
import { Icon } from './Icon'

/** Project picker in the title bar, after the organization. One project is always selected. */
export function ProjectSwitcher({ projects, agents, onNewProject, onOpenChats, onChanged }: {
  projects: Project[]
  agents: Agent[]
  onNewProject: () => void
  onOpenChats: () => void
  /** A project was renamed or deleted: reload lists. */
  onChanged: () => void
}): JSX.Element {
  const [projectId, setProjectId] = useCurrentProject()
  const [open, setOpen] = useState(false)
  const [defaultId, setDefaultId] = useState<string | null>(null)
  const [more, setMore] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { void window.tyslin.studio.defaultProject().then((p) => setDefaultId(p.id)) }, [projects.length])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { if (renaming) setRenaming(null); else if (more) setMore(null); else setOpen(false) } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, more, renaming])
  useEffect(() => { if (!open) { setMore(null); setRenaming(null); setError(null) } }, [open])

  const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
  const rename = async (): Promise<void> => {
    if (!renaming) return
    try { await window.tyslin.projects.rename(renaming.id, renaming.name); setRenaming(null); onChanged() } catch (e) { setError(errorText(e)) }
  }
  const remove = async (p: Project): Promise<void> => {
    setMore(null)
    const n = agents.filter((a) => !a.isMascot && a.projectId === p.id).length
    const msg = `Delete the project "${p.name}"?\n\nIts ${n} ${n === 1 ? 'agent or assistant' : 'agents and assistants'}, their chats and tasks are deleted too. Files in its folder stay on your computer.`
    if (!window.confirm(msg)) return
    try { await window.tyslin.projects.remove(p.id); forgetProject(p.id); onChanged() } catch (e) { setError(errorText(e)) }
  }

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
            <div key={p.id} className="switch-row">
              {renaming?.id === p.id ? (
                <form className="switch-rename" onSubmit={(e) => { e.preventDefault(); void rename() }}>
                  <input className="input" autoFocus value={renaming.name} aria-label="Project name" onChange={(e) => setRenaming({ id: p.id, name: e.target.value })} />
                  <button type="submit" className="btn btn-sm btn-primary" disabled={!renaming.name.trim()}>Save</button>
                </form>
              ) : (
                <button type="button" role="menuitemradio" aria-checked={p.id === projectId} onClick={() => { setProjectId(p.id); setOpen(false) }}
                  title={p.folder ?? 'No folder linked'}>
                  <Icon name={p.id === defaultId ? 'drive' : 'folder'} size={14} />
                  <span className="switch-name">{p.name}</span>
                  {p.id === defaultId && <span className="switch-meta">default</span>}
                  {!p.folder && <span className="switch-meta">no folder</span>}
                  {p.id === projectId && <Icon name="check" size={14} />}
                </button>
              )}
              {renaming?.id !== p.id && (
                <button type="button" className="switch-more" aria-label={`More for ${p.name}`} aria-haspopup="menu" aria-expanded={more === p.id}
                  onClick={(e) => { e.stopPropagation(); setMore(more === p.id ? null : p.id) }}>⋯</button>
              )}
              {more === p.id && (
                <div className="switch-submenu" role="menu" aria-label={`${p.name} actions`}>
                  <button type="button" role="menuitem" onClick={() => { setMore(null); setRenaming({ id: p.id, name: p.name }) }}><Icon name="file" size={13} /> Rename</button>
                  <button type="button" role="menuitem" className="danger" disabled={p.id === defaultId} title={p.id === defaultId ? "The Default project can't be deleted" : undefined}
                    onClick={() => void remove(p)}><Icon name="trash" size={13} /> Delete</button>
                </div>
              )}
            </div>
          ))}
          {error && <p className="hint account-error switch-err" role="alert">{error}</p>}
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
