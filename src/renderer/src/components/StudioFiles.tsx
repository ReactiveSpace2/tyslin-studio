import { useEffect, useState } from 'react'
import type { Project, StudioFile, StudioKind } from '@shared/types'
import { Icon } from './Icon'

interface Props {
  kind: StudioKind
  title: string
  newLabel: string
  projects: Project[]
  /** null = the Default project. */
  projectId: string | null
  onProject: (id: string | null) => void
  selected: string | null
  onSelect: (f: StudioFile | null) => void
  /** Bump to reload the list (after a save or a new file). */
  refreshKey: number
  onNew: (name: string) => void
  onDelete: (f: StudioFile) => void
}

const when = (t: number): string => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))

/**
 * Left column of the Mind mapper, Workflows and Canvas screens: which project the files live in
 * (the Default project when none is chosen), the files of this kind there, New and Delete.
 */
export function StudioFiles({ kind, title, newLabel, projects, projectId, onProject, selected, onSelect, refreshKey, onNew, onDelete }: Props): JSX.Element {
  const [files, setFiles] = useState<StudioFile[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [defaultId, setDefaultId] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { void window.tyslin.studio.defaultProject().then((p) => setDefaultId(p.id)) }, [])
  useEffect(() => {
    setError(null)
    window.tyslin.studio.list(kind, projectId)
      .then((r) => { setFiles(r.files); setProject(r.project) })
      .catch((e) => { setFiles([]); setProject(null); setError(errorText(e)) })
  }, [kind, projectId, refreshKey])

  const others = projects.filter((p) => p.folder && p.id !== defaultId)
  const create = (): void => {
    const n = name.trim()
    if (!n) return
    setNaming(false)
    setName('')
    onNew(n)
  }

  return (
    <aside className="sf">
      <span className="eyebrow">{title}</span>
      <label className="field" style={{ gap: 4 }}>
        <span className="label">Project</span>
        <select className="select" value={projectId && projectId !== defaultId ? projectId : ''} onChange={(e) => { onProject(e.target.value || null); onSelect(null) }}>
          <option value="">Default project</option>
          {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {project?.folder && (
        <button type="button" className="sf-folder" title={project.folder} onClick={() => void window.tyslin.studio.reveal(projectId)}>
          <Icon name="folder" size={13} /><span>{project.folder}</span>
        </button>
      )}
      {error && <p className="hint account-error" role="alert">{error}</p>}
      {naming ? (
        <form className="row" style={{ flexWrap: 'nowrap', gap: 6 }} onSubmit={(e) => { e.preventDefault(); create() }}>
          <input className="input" style={{ flex: 1, minWidth: 0 }} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name"
            onKeyDown={(e) => { if (e.key === 'Escape') setNaming(false) }} />
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>Create</button>
        </form>
      ) : (
        <button type="button" className="btn btn-primary" disabled={!!error} onClick={() => setNaming(true)}><Icon name="plus" size={12} /> {newLabel}</button>
      )}
      <div className="sf-list">
        {files.map((f) => (
          <div key={f.path} className={'sf-item' + (selected === f.path ? ' on' : '')}>
            <button type="button" className="sf-open" aria-current={selected === f.path ? 'page' : undefined} onClick={() => onSelect(f)}>
              <strong>{f.name}</strong><span>{when(f.updatedAt)}</span>
            </button>
            <button type="button" className="sf-del" aria-label={`Delete ${f.name}`} title="Delete" onClick={() => {
              if (window.confirm(`Delete "${f.name}"? The file is removed from the project folder.`)) onDelete(f)
            }}><Icon name="trash" size={13} /></button>
          </div>
        ))}
        {!error && files.length === 0 && <p className="hint">Nothing here yet.</p>}
      </div>
    </aside>
  )
}

/** Saves `value` a moment after the last edit, while `dirty` (set by edits, cleared once saved). */
export function useAutosave(value: string | null, dirty: boolean, save: (v: string) => Promise<void>, onSaved: () => void, delay = 700): 'idle' | 'saving' | 'saved' | 'error' {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  useEffect(() => {
    // Saved some other way (e.g. just before a workflow run): don't leave "Saving…" showing.
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
