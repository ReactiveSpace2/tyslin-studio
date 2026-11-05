import { useEffect, useState } from 'react'
import type { Project, StudioFile, StudioKind } from '@shared/types'
import { Icon, type IconName } from './Icon'

interface Props {
  kind: StudioKind
  title: string
  newLabel: string
  /** "All mind maps", "All automations", ... */
  allLabel: string
  projects: Project[]
  /** null = the Default project. */
  projectId: string | null
  selected: string | null
  onSelect: (f: StudioFile | null) => void
  /** Bump to reload the list (after a save or a new file). */
  refreshKey: number
  onNew: (name: string) => void
  onDelete: (f: StudioFile) => void
}

const ICON: Record<StudioKind, IconName> = { mindmap: 'mindmap', automation: 'workflow', run: 'workflow', canvas: 'canvas', board: 'kanban', document: 'file', svg: 'art', png: 'art' }
const when = (t: number): string => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))

/** The files of one kind in a project (the Default project when none is chosen). */
function useStudioList(kind: StudioKind, projectId: string | null, refreshKey: number): { files: StudioFile[]; project: Project | null; error: string | null } {
  const [state, setState] = useState<{ files: StudioFile[]; project: Project | null; error: string | null }>({ files: [], project: null, error: null })
  useEffect(() => {
    window.tyslin.studio.list(kind, projectId)
      .then((r) => setState({ files: r.files, project: r.project, error: null }))
      .catch((e) => setState({ files: [], project: null, error: errorText(e) }))
  }, [kind, projectId, refreshKey])
  return state
}

/** Inline "name it" form used by the panel and the overview. */
function NameForm({ onDone, onCancel, className }: { onDone: (name: string) => void; onCancel: () => void; className?: string }): JSX.Element {
  const [name, setName] = useState('')
  return (
    <form className={'row ' + (className ?? '')} style={{ flexWrap: 'nowrap', gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (name.trim()) onDone(name.trim()) }}>
      <input className="input" style={{ flex: 1, minWidth: 0 }} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name"
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }} />
      <button type="submit" className="btn btn-primary" disabled={!name.trim()}>Create</button>
    </form>
  )
}

/**
 * Left panel of the Mind mapper, Automation and Canvas screens, in the same style as the assistants panel:
 * New, All, then the files. Which project they live in (the Default project when none is chosen) sits at the bottom.
 */
export function StudioFiles({ kind, title, newLabel, allLabel, projects, projectId, selected, onSelect, refreshKey, onNew, onDelete }: Props): JSX.Element {
  const { files, error } = useStudioList(kind, projectId, refreshKey)
  const [naming, setNaming] = useState(false)

  return (
    <nav className="panel studio-panel" aria-label={title}>
      {naming
        ? <NameForm className="panel-form" onDone={(n) => { setNaming(false); onNew(n) }} onCancel={() => setNaming(false)} />
        : <button type="button" className="panel-item panel-add" disabled={!!error} onClick={() => setNaming(true)}><Icon name="plus" size={14} /> {newLabel}</button>}
      <button type="button" className={'panel-item panel-add' + (!selected ? ' active' : '')} aria-current={!selected ? 'page' : undefined} onClick={() => onSelect(null)}>
        <Icon name="grid" size={14} /> {allLabel}
      </button>
      {files.map((f) => (
        <div key={f.path} className="panel-file">
          <button type="button" className={'panel-item panel-agent' + (selected === f.path ? ' active' : '')} aria-current={selected === f.path ? 'page' : undefined}
            title={`${f.name} · ${when(f.updatedAt)}`} onClick={() => onSelect(f)}>
            <span className="panel-folder"><Icon name={ICON[kind]} /></span>
            <span className="panel-label">{f.name}</span>
          </button>
          <button type="button" className="sf-del" aria-label={`Delete ${f.name}`} title="Delete" onClick={() => {
            if (window.confirm(`Delete "${f.name}"? The file is removed from the project folder.`)) onDelete(f)
          }}><Icon name="trash" size={13} /></button>
        </div>
      ))}
      {error && <p className="hint account-error panel-note" role="alert">{error}</p>}
      <ProjectFoot projects={projects} projectId={projectId} />
    </nav>
  )
}

/** The foot of a studio panel: which project the files are in (picked in the title bar) and its folder. */
export function ProjectFoot({ projects, projectId }: { projects: Project[]; projectId: string | null }): JSX.Element {
  const name = projects.find((p) => p.id === projectId)?.name ?? 'Default project'
  return (
    <div className="panel-foot">
      <div className="panel-project">
        <span className="label">Project</span>
        <span className="panel-project-name" title="Change the project in the title bar">{name}</span>
      </div>
      <button type="button" className="btn icon-btn" aria-label="Show the project folder" title="Show the project folder" onClick={() => void window.tyslin.studio.reveal(projectId)}>
        <Icon name="folder" size={15} />
      </button>
    </div>
  )
}

interface OverviewProps {
  kind: StudioKind
  title: string
  intro: JSX.Element
  newLabel: string
  projectId: string | null
  refreshKey: number
  onOpen: (f: StudioFile) => void
  onNew: (name: string) => void
  error?: string | null
}

/** What "All ..." shows in the main area: a short intro, New, and every file of this kind as a card. */
export function StudioOverview({ kind, title, intro, newLabel, projectId, refreshKey, onOpen, onNew, error }: OverviewProps): JSX.Element {
  const { files, project, error: listError } = useStudioList(kind, projectId, refreshKey)
  const [naming, setNaming] = useState(false)
  return (
    <div className="studio-over">
      <div className="studio-over-head">
        <div>
          <span className="eyebrow">{project?.name ?? 'Default project'}</span>
          <h1>{title}</h1>
          <p className="lead">{intro}</p>
          {project?.folder && <p className="hint mono studio-over-path" title={project.folder}>{project.folder}</p>}
        </div>
        {naming
          ? <NameForm onDone={(n) => { setNaming(false); onNew(n) }} onCancel={() => setNaming(false)} />
          : <button type="button" className="btn btn-primary" disabled={!!listError} onClick={() => setNaming(true)}><Icon name="plus" size={12} /> {newLabel}</button>}
      </div>
      {(error || listError) && <p className="hint account-error" role="alert">{error || listError}</p>}
      {files.length === 0 && !listError
        ? <div className="studio-over-empty"><Icon name={ICON[kind]} size={32} /><p>Nothing here yet. {newLabel} to get started.</p></div>
        : (
          <ul className="studio-over-grid">
            {files.map((f) => (
              <li key={f.path}>
                <button type="button" className="studio-over-card" onClick={() => onOpen(f)}>
                  <span className="dv-ic"><Icon name={ICON[kind]} size={16} /></span>
                  <strong>{f.name}</strong>
                  <span className="hint">Edited {when(f.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}

/** Saves `value` a moment after the last edit, while `dirty` (set by edits, cleared once saved). */
export function useAutosave(value: string | null, dirty: boolean, save: (v: string) => Promise<void>, onSaved: () => void, delay = 700): 'idle' | 'saving' | 'saved' | 'error' {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  useEffect(() => {
    // Saved some other way (e.g. just before an automation run): don't leave "Saving…" showing.
    if (!dirty) { setState((s) => (s === 'saving' ? 'saved' : s)); return }
    if (value === null) return
    setState('saving')
    const t = setTimeout(() => {
      save(value).then(() => { onSaved(); setState('saved') }).catch(() => setState('error'))
    }, delay)
    return () => clearTimeout(t)
  }, [value, dirty])
  return state
}

export const SAVE_LABEL = { idle: '', saving: 'Saving…', saved: 'Saved', error: 'Couldn\'t save' } as const
