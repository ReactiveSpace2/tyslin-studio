import { useEffect, useMemo, useState } from 'react'
import type { DriveEntry, DriveKind, DriveListing, DrivePreview, Project } from '@shared/types'
import { useCurrentProject } from '../currentProject'
import { GoogleDriveCard, syncNote, useGDrive } from '../components/GoogleDrive'
import { Icon } from '../components/Icon'

type IconName = Parameters<typeof Icon>[0]['name']

interface Props {
  projects: Project[]
  /** Open a board in Kanban. */
  onOpenIn: (screen: 'mindmap' | 'automation' | 'canvas' | 'kanban', projectId: string, path: string) => void
}

const ICON: Record<DriveKind, IconName> = { folder: 'folder', mindmap: 'mindmap', automation: 'workflow', canvas: 'canvas', board: 'kanban', image: 'art', text: 'file', pdf: 'file', archive: 'folder', file: 'file' }
const LABEL: Record<DriveKind, string> = { folder: 'Folder', mindmap: 'Mind map', automation: 'Automation', canvas: 'Canvas design', board: 'Kanban board', image: 'Image', text: 'Text', pdf: 'PDF', archive: 'Archive', file: 'File' }
const size = (n: number): string => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`)
const when = (t: number): string => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))

type View = 'list' | 'icons'
const VIEW_KEY = 'drive:view'
const savedView = (): View => { try { return localStorage.getItem(VIEW_KEY) === 'icons' ? 'icons' : 'list' } catch { return 'list' } }
/** Image thumbnails in icon view are read one by one, at most this many per folder. */
const THUMBS = 60

/**
 * Drive: browse each project's folder like a file manager: documents, images, PDFs, archives and
 * what agents generate. Tyslin's app data (boards, mind maps, designs, automations) shows only with
 * "Show hidden files". Drop files from the desktop to add them. List or icon view; the selected item's
 * preview and actions are in the pane on the right (with Google Drive sync when nothing is selected).
 */
export function DrivePage({ projects, onOpenIn }: Props): JSX.Element {
  const [defaultId, setDefaultId] = useState<string | null>(null)
  const [defaultName, setDefaultName] = useState('Default project')
  const gd = useGDrive()
  const [projectId, setProjectId] = useCurrentProject()
  const [dir, setDir] = useState('')
  const [listing, setListing] = useState<DriveListing | null>(null)
  const [sel, setSel] = useState<DriveEntry | null>(null)
  const [preview, setPreview] = useState<DrivePreview | null>(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'name' | 'date' | 'size'>('name')
  const [hidden, setHidden] = useState(false)
  const [naming, setNaming] = useState<{ mode: 'folder' | 'rename'; value: string } | null>(null)
  const [dropping, setDropping] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [view, setViewState] = useState<View>(savedView)
  const setView = (v: View): void => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v) } catch { /* per-window convenience only */ } }
  const [thumbs, setThumbs] = useState<Record<string, string>>({})

  useEffect(() => { void window.tyslin.studio.defaultProject().then((p) => { setDefaultId(p.id); setDefaultName(p.name) }) }, [])
  const load = (): void => {
    setError(null)
    window.tyslin.drive.list(projectId, dir, hidden).then(setListing).catch((e) => { setListing(null); setError(errorText(e)) })
  }
  useEffect(load, [projectId, dir, hidden])
  useEffect(() => {
    setPreview(null)
    if (sel && !sel.isDir) void window.tyslin.drive.preview(projectId, sel.path).then(setPreview).catch(() => setPreview({ kind: 'none', note: 'Could not read this file.' }))
  }, [sel?.path])

  const allRoots = [{ id: defaultId, name: defaultName }, ...projects.filter((p) => p.folder && p.id !== defaultId).map((p) => ({ id: p.id as string | null, name: p.name }))]
  // An agency tab is open: its Drive shows only that agency's folder.
  const roots = projectId && projectId !== defaultId ? allRoots.filter((r) => r.id === projectId) : allRoots
  const crumbs = dir ? dir.split('/') : []
  const shown = useMemo(() => {
    const list = (listing?.entries ?? []).filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()))
    if (sort === 'date') return [...list].sort((a, b) => Number(b.isDir) - Number(a.isDir) || b.updatedAt - a.updatedAt)
    if (sort === 'size') return [...list].sort((a, b) => Number(b.isDir) - Number(a.isDir) || b.size - a.size)
    return list
  }, [listing, q, sort])

  // Icon view: thumbnails for images in this folder, read one at a time.
  useEffect(() => {
    if (view !== 'icons') return
    let live = true
    const todo = shown.filter((e) => e.kind === 'image' && !thumbs[e.path]).slice(0, THUMBS)
    void (async () => {
      for (const e of todo) {
        if (!live) return
        try {
          const p = await window.tyslin.drive.preview(projectId, e.path)
          if (live && p.kind === 'image') setThumbs((t) => ({ ...t, [e.path]: p.dataUrl }))
        } catch { /* falls back to the icon */ }
      }
    })()
    return () => { live = false }
  }, [view, shown, projectId])

  const act = async (fn: () => Promise<unknown>, done?: string): Promise<void> => {
    setError(null)
    try { await fn(); if (done) setNotice(done); load() } catch (e) { setError(errorText(e)) }
  }
  const go = (d: string): void => { setDir(d); setSel(null) }
  const openEntry = (e: DriveEntry): void => {
    if (e.isDir) return go(e.path)
    const pid = listing?.projectId
    if (!pid) return
    if (e.kind === 'board') return onOpenIn('kanban', pid, e.path)
    void window.tyslin.drive.open(projectId, e.path)
  }
  const submitName = (): void => {
    if (!naming) return
    const v = naming.value.trim()
    if (!v) return
    if (naming.mode === 'folder') void act(() => window.tyslin.drive.mkdir(projectId, dir, v))
    else if (sel) void act(() => window.tyslin.drive.rename(projectId, sel.path, v)).then(() => setSel(null))
    setNaming(null)
  }
  const dropFiles = (e: React.DragEvent, targetDir: string): void => {
    e.preventDefault()
    setDropping(null)
    const moving = e.dataTransfer.getData('application/x-tyslin-path')
    if (moving) {
      if (moving !== targetDir) void act(() => window.tyslin.drive.move(projectId, moving, targetDir))
      return
    }
    const paths = window.tyslin.drive.pathsFor(Array.from(e.dataTransfer.files))
    if (paths.length) void act(() => window.tyslin.drive.copyIn(projectId, targetDir, paths), `Added ${paths.length} ${paths.length === 1 ? 'item' : 'items'}.`)
  }
  const dropProps = (key: string, targetDir: string): React.HTMLAttributes<HTMLElement> => ({
    onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); if (dropping !== key) setDropping(key) },
    onDragLeave: () => setDropping(null),
    onDrop: (e) => { e.stopPropagation(); dropFiles(e, targetDir) }
  })

  return (
    <div className="drive">

      <section className="dv-main" {...dropProps('main', dir)} aria-label="Files">
        <div className="dv-bar">
          <nav className="dv-crumbs" aria-label="Folder path">
            <button type="button" onClick={() => go('')} {...dropProps('crumb-root', '')} className={dropping === 'crumb-root' ? 'drop' : ''}>{roots.find((r) => r.id === projectId)?.name ?? 'Project'}</button>
            {crumbs.map((c, i) => {
              const p = crumbs.slice(0, i + 1).join('/')
              return <span key={p}><span aria-hidden="true">/</span><button type="button" onClick={() => go(p)} {...dropProps('crumb-' + p, p)} className={dropping === 'crumb-' + p ? 'drop' : ''}>{c}</button></span>
            })}
            {syncNote(gd, projectId, defaultId) && <small className="dv-sync">{syncNote(gd, projectId, defaultId)}</small>}
          </nav>
          <div className="row" style={{ gap: 6 }}>
            {roots.length > 1 && (
              <select className="select" style={{ width: 180, height: 36 }} aria-label="Agency folder" value={projectId ?? ''}
                onChange={(e) => { const r = roots.find((x) => (x.id ?? '') === e.target.value); if (r?.id) setProjectId(r.id); go('') }}>
                {roots.map((r) => <option key={r.id ?? 'default'} value={r.id ?? ''}>{r.name}</option>)}
              </select>
            )}
            <div className="dv-views" role="group" aria-label="View">
              <button type="button" aria-pressed={view === 'list'} className={view === 'list' ? 'on' : ''} title="List" aria-label="List view" onClick={() => setView('list')}><Icon name="list" size={15} /></button>
              <button type="button" aria-pressed={view === 'icons'} className={view === 'icons' ? 'on' : ''} title="Icons" aria-label="Icon view" onClick={() => setView('icons')}><Icon name="grid" size={15} /></button>
            </div>
            <input className="input" style={{ width: 180, height: 36 }} type="search" placeholder="Filter" aria-label="Filter files" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="select" style={{ width: 110, height: 36 }} aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="name">Name</option><option value="date">Modified</option><option value="size">Size</option>
            </select>
            <button type="button" className="btn btn-sm" onClick={() => setNaming({ mode: 'folder', value: '' })}><Icon name="folder" size={13} /> New folder</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => void act(() => window.tyslin.drive.upload(projectId, dir).then((n) => n && setNotice(`Added ${n} ${n === 1 ? 'file' : 'files'}.`)))}><Icon name="plus" size={12} /> Add files</button>
            <button type="button" className="btn btn-sm icon-btn" aria-label="Show in file manager" title="Show in file manager" onClick={() => void window.tyslin.drive.reveal(projectId, dir)}><Icon name="drive" size={14} /></button>
          </div>
        </div>
        {naming && (
          <form className="row dv-naming" onSubmit={(e) => { e.preventDefault(); submitName() }}>
            <input className="input" autoFocus style={{ flex: 1 }} aria-label={naming.mode === 'folder' ? 'Folder name' : 'New name'} value={naming.value}
              onChange={(e) => setNaming({ ...naming, value: e.target.value })} onKeyDown={(e) => { if (e.key === 'Escape') setNaming(null) }}
              placeholder={naming.mode === 'folder' ? 'Folder name' : 'New name'} />
            <button type="submit" className="btn btn-primary btn-sm">{naming.mode === 'folder' ? 'Create' : 'Rename'}</button>
            <button type="button" className="btn btn-sm" onClick={() => setNaming(null)}>Cancel</button>
          </form>
        )}
        {error && <p className="hint account-error" role="alert">{error}</p>}
        {notice && <p className="ok" role="status">{notice} <button type="button" className="link-btn" onClick={() => setNotice(null)}>Dismiss</button></p>}
        {view === 'list' && (
          <div className={'dv-table' + (dropping === 'main' ? ' drop' : '')} role="table" aria-label="Folder contents">
            <div className="dv-row dv-head" role="row"><span role="columnheader">Name</span><span role="columnheader">Kind</span><span role="columnheader">Modified</span><span role="columnheader">Size</span></div>
            {dir && (
              <button type="button" className="dv-row" role="row" onClick={() => go(crumbs.slice(0, -1).join('/'))} {...dropProps('up', crumbs.slice(0, -1).join('/'))}>
                <span className="dv-name"><Icon name="back" size={15} /> ..</span><span /><span /><span />
              </button>
            )}
            {shown.map((e) => (
              <button key={e.path} type="button" role="row" className={'dv-row' + (sel?.path === e.path ? ' on' : '') + (dropping === e.path ? ' drop' : '')}
                draggable onDragStart={(ev) => ev.dataTransfer.setData('application/x-tyslin-path', e.path)}
                {...(e.isDir ? dropProps(e.path, e.path) : {})}
                onClick={() => setSel(e)} onDoubleClick={() => openEntry(e)} onKeyDown={(ev) => { if (ev.key === 'Enter') openEntry(e) }}>
                <span className="dv-name"><span className={'dv-ic ' + e.kind}><Icon name={ICON[e.kind]} size={15} /></span>{e.name}</span>
                <span className="dv-muted">{LABEL[e.kind]}</span>
                <span className="dv-muted">{when(e.updatedAt)}</span>
                <span className="dv-muted mono">{e.isDir ? '—' : size(e.size)}</span>
              </button>
            ))}
            {listing && shown.length === 0 && <p className="hint" style={{ padding: 16 }}>{q ? 'No files match.' : 'Files your agency makes land here. You can also drop files in or use Add files.'}</p>}
          </div>
        )}
        {view === 'icons' && (
          <div className={'dv-grid' + (dropping === 'main' ? ' drop' : '')} role="list" aria-label="Folder contents">
            {dir && (
              <button type="button" role="listitem" className="dv-tile" onClick={() => go(crumbs.slice(0, -1).join('/'))} {...dropProps('up', crumbs.slice(0, -1).join('/'))}>
                <span className="dv-thumb"><Icon name="back" size={26} /></span>
                <span className="dv-tile-name">Up a folder</span>
              </button>
            )}
            {shown.map((e) => (
              <button key={e.path} type="button" role="listitem" className={'dv-tile' + (sel?.path === e.path ? ' on' : '') + (dropping === e.path ? ' drop' : '')}
                draggable onDragStart={(ev) => ev.dataTransfer.setData('application/x-tyslin-path', e.path)}
                {...(e.isDir ? dropProps(e.path, e.path) : {})}
                aria-label={`${e.name}, ${LABEL[e.kind]}`}
                onClick={() => setSel(e)} onDoubleClick={() => openEntry(e)} onKeyDown={(ev) => { if (ev.key === 'Enter') openEntry(e) }}>
                <span className={'dv-thumb ' + e.kind}>
                  {thumbs[e.path] ? <img src={thumbs[e.path]} alt="" /> : <Icon name={ICON[e.kind]} size={30} />}
                </span>
                <span className="dv-tile-name">{e.name}</span>
                <span className="dv-muted">{e.isDir ? LABEL[e.kind] : size(e.size)}</span>
              </button>
            ))}
            {listing && shown.length === 0 && <p className="hint" style={{ padding: 16 }}>{q ? 'No files match.' : 'Files your agency makes land here. You can also drop files in or use Add files.'}</p>}
          </div>
        )}
        <label className="dv-hidden"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Show hidden files</label>
      </section>

      <aside className="dv-side" aria-label={sel ? `${sel.name}: preview and actions` : 'Details'}>
        {!sel ? (
          <>
            <p className="hint">Select a file or folder to preview it here. Double-click to open. Drag files onto a folder to move them, or drop files from your desktop to add them.</p>
            <div style={{ marginTop: 'auto' }} />
            <GoogleDriveCard />
            <p className="hint">Each agency&apos;s folder on this computer: documents, images, PDFs, archives and what your agents make.</p>
          </>
        ) : (
          <>
            <div className="dv-preview">
              {sel.isDir && <span className={'dv-ic huge ' + sel.kind}><Icon name={ICON[sel.kind]} size={40} /></span>}
              {!sel.isDir && !preview && <span className="hint" role="status">Loading preview…</span>}
              {preview?.kind === 'image' && <img className="dv-img" src={preview.dataUrl} alt={sel.name} />}
              {preview?.kind === 'text' && <pre className="dv-text">{preview.text}{preview.truncated ? '\n…' : ''}</pre>}
              {preview?.kind === 'none' && (
                <span className="dv-none"><span className={'dv-ic huge ' + sel.kind}><Icon name={ICON[sel.kind]} size={40} /></span><span className="hint">{preview.note}</span></span>
              )}
            </div>
            <div className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
              <span className={'dv-ic big ' + sel.kind}><Icon name={ICON[sel.kind]} size={20} /></span>
              <div style={{ minWidth: 0 }}><strong className="dv-title">{sel.name}</strong><span className="hint" style={{ display: 'block' }}>{LABEL[sel.kind]}{sel.isDir ? '' : ` · ${size(sel.size)}`}</span></div>
            </div>
            <div className="dv-actions">
              <button type="button" className="btn btn-primary" onClick={() => openEntry(sel)}>
                {sel.isDir ? 'Open folder' : sel.kind === 'board' ? 'Open in Kanban' : 'Open'}
              </button>
              {!sel.isDir && ['mindmap', 'automation', 'canvas', 'board'].includes(sel.kind) && <button type="button" className="btn" onClick={() => void window.tyslin.drive.open(projectId, sel.path)}>Open with app</button>}
              <button type="button" className="btn" onClick={() => setNaming({ mode: 'rename', value: sel.name })}>Rename</button>
              <button type="button" className="btn" onClick={() => void window.tyslin.drive.reveal(projectId, sel.path)}>Show in folder</button>
              <button type="button" className="btn dv-delete" onClick={() => {
                if (window.confirm(`Delete "${sel.name}"${sel.isDir ? ' and everything in it' : ''}? This can't be undone in Tyslin.`)) void act(() => window.tyslin.drive.remove(projectId, sel.path)).then(() => setSel(null))
              }}><Icon name="trash" size={13} /> Delete</button>
            </div>
            <div className="kv dv-kv"><span>Modified</span><span>{when(sel.updatedAt)}</span><span>Path</span><span className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{sel.path}</span></div>
            <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setSel(null)}>Close preview</button>
          </>
        )}
      </aside>
    </div>
  )
}
