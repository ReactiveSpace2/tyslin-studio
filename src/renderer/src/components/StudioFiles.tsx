import { useEffect, useState } from 'react'
import type { Project, StudioFile, StudioKind } from '@shared/types'
import { Icon, type IconName } from './Icon'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

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
    <form className={cn('flex items-center gap-1.5', className)} onSubmit={(e) => { e.preventDefault(); if (name.trim()) onDone(name.trim()) }}>
      <Input className="min-w-0 flex-1" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name"
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }} />
      <Button type="submit" disabled={!name.trim()}>Create</Button>
    </form>
  )
}

/** A row in the left column, in the shadcn sidebar-menu look: the active one is a white card. */
const ITEM = 'flex min-h-10 w-full items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-1.5 text-left text-sm text-foreground outline-none transition-colors hover:bg-panel focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50'
const ITEM_ACTIVE = 'border-border bg-card font-semibold shadow-xs hover:bg-card'

/**
 * Left panel of the Mind mapper, Automation and Canvas screens, in the same style as the assistants panel:
 * New, All, then the files. Which project they live in (the Default project when none is chosen) sits at the bottom.
 */
export function StudioFiles({ kind, title, newLabel, allLabel, projects, projectId, selected, onSelect, refreshKey, onNew, onDelete }: Props): JSX.Element {
  const { files, error } = useStudioList(kind, projectId, refreshKey)
  const [naming, setNaming] = useState(false)

  return (
    <nav className="flex w-[252px] flex-none flex-col gap-0.5 overflow-y-auto border-r border-border bg-background px-2.5 py-3 font-sans text-foreground" aria-label={title}>
      {naming
        ? <NameForm className="pt-0.5 pb-1.5" onDone={(n) => { setNaming(false); onNew(n) }} onCancel={() => setNaming(false)} />
        : <button type="button" className={cn(ITEM, 'mb-1 text-muted-foreground hover:text-foreground')} disabled={!!error} onClick={() => setNaming(true)}><Icon name="plus" size={14} /> {newLabel}</button>}
      <button type="button" className={cn(ITEM, 'mb-1 text-muted-foreground hover:text-foreground', !selected && cn(ITEM_ACTIVE, 'text-foreground'))} aria-current={!selected ? 'page' : undefined} onClick={() => onSelect(null)}>
        <Icon name="grid" size={14} /> {allLabel}
      </button>
      {files.map((f) => (
        <div key={f.path} className="group relative flex items-center">
          <button type="button" className={cn(ITEM, 'pr-10 font-medium', selected === f.path && ITEM_ACTIVE)} aria-current={selected === f.path ? 'page' : undefined}
            title={`${f.name} · ${when(f.updatedAt)}`} onClick={() => onSelect(f)}>
            <span className="grid w-[26px] flex-none place-items-center text-muted-foreground"><Icon name={ICON[kind]} /></span>
            <span className="min-w-0 truncate">{f.name}</span>
          </button>
          <Button variant="ghost" size="icon" className="absolute top-1/2 right-1 size-[34px] -translate-y-1/2 rounded-lg text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
            aria-label={`Delete ${f.name}`} title="Delete" onClick={() => {
              if (window.confirm(`Delete "${f.name}"? The file is removed from the project folder.`)) onDelete(f)
            }}><Icon name="trash" size={13} /></Button>
        </div>
      ))}
      {error && <p className="m-0 px-2.5 pt-2 text-xs text-destructive" role="alert">{error}</p>}
    </nav>
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
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-9 py-8 font-sans text-foreground">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 max-w-[640px] flex-col gap-2">
          <span className="font-mono text-xs tracking-[0.08em] text-green uppercase">{project?.name ?? 'Default project'}</span>
          <h1 className="m-0 text-[32px] font-semibold tracking-[-0.02em]">{title}</h1>
          <p className="m-0 max-w-[560px] text-muted-foreground">{intro}</p>
          {project?.folder && <p className="m-0 truncate font-mono text-xs text-muted-foreground" title={project.folder}>{project.folder}</p>}
        </div>
        {naming
          ? <NameForm onDone={(n) => { setNaming(false); onNew(n) }} onCancel={() => setNaming(false)} />
          : <Button disabled={!!listError} onClick={() => setNaming(true)}><Icon name="plus" size={12} /> {newLabel}</Button>}
      </div>
      {(error || listError) && (
        <Alert variant="destructive"><AlertDescription>{error || listError}</AlertDescription></Alert>
      )}
      {files.length === 0 && !listError
        ? (
          <div className="flex flex-col items-center gap-2.5 rounded-[14px] border border-dashed border-border px-5 py-12 text-center text-muted-foreground">
            <Icon name={ICON[kind]} size={32} />
            <p className="m-0">Nothing here yet. {newLabel} to get started.</p>
          </div>
        )
        : (
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 p-0">
            {files.map((f) => (
              <li key={f.path}>
                <button type="button" className="flex min-h-[120px] w-full flex-col items-start gap-2 rounded-[14px] border border-border bg-card p-4 text-left text-foreground shadow-xs outline-none transition-colors hover:border-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40" onClick={() => onOpen(f)}>
                  <span className="grid size-7 flex-none place-items-center rounded-lg bg-panel text-muted-foreground"><Icon name={ICON[kind]} size={16} /></span>
                  <strong className="text-[15px] font-semibold [overflow-wrap:anywhere]">{f.name}</strong>
                  <span className="text-xs text-muted-foreground">Edited {when(f.updatedAt)}</span>
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
