import { useEffect, useMemo, useRef, useState } from 'react'
import type { DriveEntry, DriveKind, DriveListing, DrivePreview } from '@shared/types'
import type { AgencyView } from '../agencies'
import { GoogleDriveCard, syncNote, useGDrive } from '../components/GoogleDrive'
import { Icon } from '../components/Icon'
import { Pose } from '../components/Pose'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

type IconName = Parameters<typeof Icon>[0]['name']

interface Props {
  agencies: AgencyView[]
  agencyId: string | null
  onAgency: (id: string) => void
  initialDir?: string
  onNewTaskWith: (agencyId: string, path: string) => void
  onNewAgency: () => void
}

const ICON: Record<DriveKind, IconName> = { folder: 'folder', mindmap: 'mindmap', automation: 'workflow', canvas: 'canvas', board: 'kanban', image: 'art', text: 'file', pdf: 'file', archive: 'folder', file: 'file' }
const LABEL: Record<DriveKind, string> = { folder: 'Folder', mindmap: 'Mind map', automation: 'Automation', canvas: 'Canvas design', board: 'Board file', image: 'Image', text: 'Text', pdf: 'PDF', archive: 'Archive', file: 'File' }
const size = (n: number): string => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`)
const when = (t: number): string => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))

type View = 'list' | 'icons'
const VIEW_KEY = 'drive:view'
const savedView = (): View => { try { return localStorage.getItem(VIEW_KEY) === 'icons' ? 'icons' : 'list' } catch { return 'list' } }
/** Image thumbnails in icon view are read one by one, at most this many per folder. */
const THUMBS = 60

/**
 * Files: an agency's folder like a file manager: documents, images, PDFs, archives and what the agents
 * make. Tyslin's own data (boards, memory) shows only with "Show hidden files". Drop files to add them.
 * List or icon view; the selected item's preview and actions on the right, with Google Drive sync when nothing is selected.
 */
export function FilesPage({ agencies, agencyId, onAgency, initialDir, onNewTaskWith, onNewAgency }: Props): JSX.Element {
  const view = agencies.find((v) => v.agency.id === agencyId) ?? agencies[0] ?? null
  const projectId = view?.project.id ?? null
  const gd = useGDrive()
  const [dir, setDir] = useState(initialDir ?? '')
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
  const [mode, setModeState] = useState<View>(savedView)
  const setMode = (v: View): void => { setModeState(v); try { localStorage.setItem(VIEW_KEY, v) } catch { /* per-window convenience only */ } }
  const [thumbs, setThumbs] = useState<Record<string, string>>({})

  /** Bumped by every load, so a slow listing for a folder you already left can't replace the current one. */
  const loadSeq = useRef(0)
  const load = (): void => {
    if (!projectId) { setListing(null); return }
    const n = ++loadSeq.current
    setError(null)
    window.tyslin.drive.list(projectId, dir, hidden)
      .then((l) => { if (n === loadSeq.current) setListing(l) })
      .catch((e) => { if (n === loadSeq.current) { setListing(null); setError(errorText(e)) } })
  }
  const shownProject = useRef(projectId)
  useEffect(() => { if (shownProject.current !== projectId) { shownProject.current = projectId; setDir(''); setSel(null); setThumbs({}) } }, [projectId])
  useEffect(load, [projectId, dir, hidden])
  useEffect(() => {
    setPreview(null)
    if (!sel || sel.isDir || !projectId) return
    let live = true
    void window.tyslin.drive.preview(projectId, sel.path).then((p) => { if (live) setPreview(p) }).catch(() => { if (live) setPreview({ kind: 'none', note: 'Could not read this file.' }) })
    return () => { live = false }
  }, [sel?.path, projectId])

  const crumbs = dir ? dir.split('/') : []
  const shown = useMemo(() => {
    const list = (listing?.entries ?? []).filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()))
    if (sort === 'date') return [...list].sort((a, b) => Number(b.isDir) - Number(a.isDir) || b.updatedAt - a.updatedAt)
    if (sort === 'size') return [...list].sort((a, b) => Number(b.isDir) - Number(a.isDir) || b.size - a.size)
    return list
  }, [listing, q, sort])

  useEffect(() => {
    if (mode !== 'icons' || !projectId) return
    let live = true
    const todo = shown.filter((e) => e.kind === 'image' && !thumbs[e.path]).slice(0, THUMBS)
    void (async () => {
      for (const e of todo) {
        if (!live) return
        try { const p = await window.tyslin.drive.preview(projectId, e.path); if (live && p.kind === 'image') setThumbs((t) => ({ ...t, [e.path]: p.dataUrl })) } catch { /* falls back to the icon */ }
      }
    })()
    return () => { live = false }
  }, [mode, shown, projectId])

  if (!view || !projectId) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <Empty className="max-w-[520px]"><EmptyHeader><EmptyMedia><Pose pose={6} height={140} /></EmptyMedia><EmptyTitle>No agency yet</EmptyTitle><EmptyDescription>Files live in each agency's folder. Create one and its folder shows here.</EmptyDescription></EmptyHeader><EmptyContent><Button onClick={onNewAgency}>Create an agency</Button></EmptyContent></Empty>
      </div>
    )
  }

  const act = async (fn: () => Promise<unknown>, done?: string): Promise<void> => { setError(null); try { await fn(); if (done) setNotice(done); load() } catch (e) { setError(errorText(e)) } }
  const go = (d: string): void => { setDir(d); setSel(null) }
  const openEntry = (e: DriveEntry): void => { if (e.isDir) return go(e.path); void window.tyslin.drive.open(projectId, e.path) }
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
    if (moving) { if (moving !== targetDir) void act(() => window.tyslin.drive.move(projectId, moving, targetDir)); return }
    const paths = window.tyslin.drive.pathsFor(Array.from(e.dataTransfer.files))
    if (paths.length) void act(() => window.tyslin.drive.copyIn(projectId, targetDir, paths), `Added ${paths.length} ${paths.length === 1 ? 'item' : 'items'}.`)
  }
  const dropProps = (key: string, targetDir: string): React.HTMLAttributes<HTMLElement> => ({
    onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); if (dropping !== key) setDropping(key) },
    onDragLeave: () => setDropping(null),
    onDrop: (e) => { e.stopPropagation(); dropFiles(e, targetDir) }
  })
  const note = syncNote(gd, projectId, null)
  const dropMain = dropping === 'main'
  const empty = listing && shown.length === 0 && (q ? <p className="col-span-full p-4 text-sm text-muted-foreground">No files match.</p> : (
    <div className="col-span-full flex flex-col items-center gap-2.5 px-4 py-6 text-center"><Pose pose={6} height={150} /><p className="max-w-[360px] text-sm text-muted-foreground">Files your agency makes land here. You can also drop files in or use Add files.</p></div>
  ))

  return (
    <div className="flex h-full text-foreground">
      <section className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-4" {...dropProps('main', dir)} aria-label="Files">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <nav className="flex min-w-0 flex-wrap items-center gap-1 text-[15px] font-semibold" aria-label="Folder path">
            {agencies.length > 1 ? (
              <Select value={view.agency.id} onValueChange={(v) => { onAgency(v); go('') }}>
                <SelectTrigger className="h-8 w-auto gap-1.5 border-0 bg-transparent px-1.5 text-[15px] font-semibold shadow-none" aria-label="Agency folder"><SelectValue /></SelectTrigger>
                <SelectContent>{agencies.map((v) => <SelectItem key={v.agency.id} value={v.agency.id}>{v.agency.name}</SelectItem>)}</SelectContent>
              </Select>
            ) : <button type="button" onClick={() => go('')} {...dropProps('crumb-root', '')} className={crumbCls(dropping === 'crumb-root')}>{view.agency.name}</button>}
            {crumbs.map((c, i) => {
              const p = crumbs.slice(0, i + 1).join('/')
              return <span key={p} className="inline-flex items-center gap-1 text-muted-foreground"><span aria-hidden="true">/</span><button type="button" onClick={() => go(p)} {...dropProps('crumb-' + p, p)} className={crumbCls(dropping === 'crumb-' + p)}>{c}</button></span>
            })}
            {note && <small className="ml-2 text-xs font-normal text-muted-foreground">{note}</small>}
          </nav>
          <div className="flex flex-wrap items-center gap-1.5">
            <Input className="w-[160px]" type="search" placeholder="Filter" aria-label="Filter files" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger className="w-[110px] bg-card" aria-label="Sort"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="name">Name</SelectItem><SelectItem value="date">Modified</SelectItem><SelectItem value="size">Size</SelectItem></SelectContent>
            </Select>
            <TabsList aria-label="View"><TabsTrigger active={mode === 'list'} onClick={() => setMode('list')}><Icon name="list" size={14} /> List</TabsTrigger><TabsTrigger active={mode === 'icons'} onClick={() => setMode('icons')}><Icon name="grid" size={14} /> Icons</TabsTrigger></TabsList>
            <Button variant="outline" size="sm" onClick={() => setNaming({ mode: 'folder', value: '' })}><Icon name="folder" size={13} /> New folder</Button>
            <Button size="sm" onClick={() => void act(() => window.tyslin.drive.upload(projectId, dir).then((n) => n && setNotice(`Added ${n} ${n === 1 ? 'file' : 'files'}.`)))}><Icon name="plus" size={12} /> Add files</Button>
            <Button variant="outline" size="sm" onClick={() => void window.tyslin.drive.reveal(projectId, dir)}><Icon name="drive" size={13} /> Open folder</Button>
          </div>
        </div>
        {naming && (
          <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); submitName() }}>
            <Input autoFocus className="flex-1" aria-label={naming.mode === 'folder' ? 'Folder name' : 'New name'} value={naming.value} onChange={(e) => setNaming({ ...naming, value: e.target.value })} onKeyDown={(e) => { if (e.key === 'Escape') setNaming(null) }} placeholder={naming.mode === 'folder' ? 'Folder name' : 'New name'} />
            <Button type="submit" size="sm">{naming.mode === 'folder' ? 'Create' : 'Rename'}</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setNaming(null)}>Cancel</Button>
          </form>
        )}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {notice && <p className="text-[13px] text-green" role="status">{notice} <button type="button" className="text-green underline" onClick={() => setNotice(null)}>Dismiss</button></p>}
        {mode === 'list' && (
          <div className={cn('overflow-hidden rounded-xl border border-border bg-card shadow-xs', dropMain && 'outline-2 outline-offset-3 outline-green outline-dashed')} role="table" aria-label="Folder contents">
            <div className={cn(ROW, 'min-h-9 text-xs font-medium text-muted-foreground')} role="row"><span role="columnheader">Name</span><span role="columnheader">Kind</span><span role="columnheader">Modified</span><span role="columnheader" className="text-right">Size</span></div>
            {dir && <button type="button" className={cn(ROW, ROW_BTN)} role="row" onClick={() => go(crumbs.slice(0, -1).join('/'))} {...dropProps('up', crumbs.slice(0, -1).join('/'))}><span className="flex items-center gap-2.5"><Icon name="back" size={15} /> ..</span><span /><span /><span /></button>}
            {shown.map((e) => (
              <button key={e.path} type="button" role="row" className={cn(ROW, ROW_BTN, sel?.path === e.path && 'bg-lime-soft hover:bg-lime-soft', dropping === e.path && DROP_IN)}
                draggable onDragStart={(ev) => ev.dataTransfer.setData('application/x-tyslin-path', e.path)} {...(e.isDir ? dropProps(e.path, e.path) : {})}
                onClick={() => setSel(e)} onDoubleClick={() => openEntry(e)} onKeyDown={(ev) => { if (ev.key === 'Enter') openEntry(e) }}>
                <span className="flex min-w-0 items-center gap-2.5 font-medium"><KindIcon kind={e.kind} /><span className="truncate">{e.name}</span></span>
                <span className={MUTED}>{LABEL[e.kind]}</span><span className={MUTED}>{when(e.updatedAt)}</span><span className={cn(MUTED, 'text-right font-mono')}>{e.isDir ? '—' : size(e.size)}</span>
              </button>
            ))}
            {empty}
          </div>
        )}
        {mode === 'icons' && (
          <div className={cn('grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] content-start gap-3', dropMain && 'rounded-xl outline-2 outline-offset-3 outline-green outline-dashed')} role="list" aria-label="Folder contents">
            {dir && <button type="button" role="listitem" className={TILE} onClick={() => go(crumbs.slice(0, -1).join('/'))} {...dropProps('up', crumbs.slice(0, -1).join('/'))}><span className={THUMB}><Icon name="back" size={26} /></span><span className="line-clamp-2 text-[13px] leading-tight font-medium">Up a folder</span></button>}
            {shown.map((e) => (
              <button key={e.path} type="button" role="listitem" className={cn(TILE, sel?.path === e.path && 'border-green bg-lime-soft ring-1 ring-green ring-inset hover:border-green', dropping === e.path && DROP_IN)}
                draggable onDragStart={(ev) => ev.dataTransfer.setData('application/x-tyslin-path', e.path)} {...(e.isDir ? dropProps(e.path, e.path) : {})} aria-label={`${e.name}, ${LABEL[e.kind]}`}
                onClick={() => setSel(e)} onDoubleClick={() => openEntry(e)} onKeyDown={(ev) => { if (ev.key === 'Enter') openEntry(e) }}>
                <span className={cn(THUMB, e.kind === 'folder' && FOLDER_TINT)}>{thumbs[e.path] ? <img src={thumbs[e.path]} alt="" className="block size-full object-contain p-1.5" /> : <Icon name={ICON[e.kind]} size={30} />}</span>
                <span className="line-clamp-2 text-[13px] leading-tight font-medium [overflow-wrap:anywhere]">{e.name}</span>
                <span className={MUTED}>{e.isDir ? LABEL[e.kind] : size(e.size)}</span>
              </button>
            ))}
            {empty}
          </div>
        )}
        <div className="flex items-center gap-1.5"><Checkbox id="drive-hidden" checked={hidden} onCheckedChange={(v) => setHidden(v === true)} /><Label htmlFor="drive-hidden" className="text-xs font-normal text-muted-foreground">Show hidden files (the app's own data: boards, memory)</Label></div>
      </section>

      <aside className="flex w-[380px] flex-none flex-col gap-3.5 overflow-y-auto border-l border-border bg-background p-5" aria-label={sel ? `${sel.name}: preview and actions` : 'Details'}>
        {!sel ? (
          <>
            <p className="text-sm leading-relaxed text-muted-foreground">Select a file or folder to preview it here. Double-click to open. Drag files onto a folder to move them, or drop files from your desktop to add them.</p>
            <div className="mt-auto" />
            <GoogleDriveCard />
            <p className="text-xs leading-relaxed text-muted-foreground">When both sides change a file, both are kept: the Drive one as <span className="font-mono">name (Google Drive).ext</span>. Deleted files go to Drive's trash or <span className="font-mono">.tyslin-trash</span>.</p>
          </>
        ) : (
          <>
            <div className="flex max-h-[420px] min-h-[220px] items-center justify-center overflow-hidden rounded-xl border border-border bg-card shadow-xs">
              {sel.isDir && <KindIcon kind={sel.kind} size="huge" />}
              {!sel.isDir && !preview && <span className="text-sm text-muted-foreground" role="status">Loading preview…</span>}
              {preview?.kind === 'image' && <img className="max-h-[400px] max-w-full object-contain" src={preview.dataUrl} alt={sel.name} />}
              {preview?.kind === 'text' && <pre className="max-h-[418px] w-full self-stretch overflow-auto bg-card px-3.5 py-3 font-mono text-xs leading-[1.55] whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">{preview.text}{preview.truncated ? '\n…' : ''}</pre>}
              {preview?.kind === 'none' && <span className="flex flex-col items-center gap-2.5 p-5 text-center"><KindIcon kind={sel.kind} size="huge" /><span className="text-sm text-muted-foreground">{preview.note}</span></span>}
            </div>
            <div className="flex items-center gap-2.5"><KindIcon kind={sel.kind} size="big" /><div className="min-w-0"><strong className="block font-mono text-sm font-medium [overflow-wrap:anywhere]">{sel.name}</strong><span className="block text-xs text-muted-foreground">{LABEL[sel.kind]}{sel.isDir ? '' : ` · ${size(sel.size)}`}</span></div></div>
            <div className="grid grid-cols-2 gap-2">
              <Button className="col-span-2" onClick={() => openEntry(sel)}>{sel.isDir ? 'Open folder' : 'Open'}</Button>
              {!sel.isDir && <Button variant="outline" className="col-span-2" onClick={() => onNewTaskWith(view.agency.id, sel.path)}><Icon name="plus" size={12} /> New task with this file</Button>}
              <Button variant="outline" onClick={() => setNaming({ mode: 'rename', value: sel.name })}>Rename</Button>
              <Button variant="outline" onClick={() => void window.tyslin.drive.reveal(projectId, sel.path)}>Show in folder</Button>
              <Button variant="outline" className="col-span-2 text-destructive hover:text-destructive" onClick={() => { if (window.confirm(`Delete "${sel.name}"${sel.isDir ? ' and everything in it' : ''}? It goes to the Trash.`)) void act(() => window.tyslin.drive.remove(projectId, sel.path)).then(() => setSel(null)) }}><Icon name="trash" size={13} /> Delete</Button>
            </div>
            <Separator />
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]"><dt className="text-muted-foreground">Modified</dt><dd>{when(sel.updatedAt)}</dd><dt className="text-muted-foreground">Path</dt><dd className="font-mono text-xs break-all">{sel.path}</dd></dl>
            <span className="text-xs text-muted-foreground">To move it, drag it onto a folder in the list.</span>
            <Button variant="link" size="sm" className="h-auto self-start px-0" onClick={() => setSel(null)}>Close preview</Button>
          </>
        )}
      </aside>
    </div>
  )
}

const ROW = 'grid w-full grid-cols-[minmax(0,3fr)_minmax(0,1.1fr)_minmax(0,1.4fr)_90px] items-center gap-3 border-b border-border px-4 text-left last:border-b-0'
const ROW_BTN = 'min-h-11 cursor-default text-sm text-foreground outline-none hover:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-inset'
const DROP_IN = 'outline-2 -outline-offset-3 outline-green outline-dashed'
const MUTED = 'truncate text-xs text-muted-foreground'
const TILE = 'flex min-w-0 flex-col items-stretch gap-1.5 rounded-xl border border-border bg-card p-2.5 text-left text-foreground shadow-xs outline-none hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/40'
const THUMB = 'grid aspect-[4/3] place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground'
const crumbCls = (drop: boolean): string => cn('rounded-md border px-1.5 py-1 text-foreground outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40', drop ? 'border-green bg-lime-soft' : 'border-transparent')
const FOLDER_TINT = 'bg-lime-soft text-green'
const TINT: Record<DriveKind, string> = { folder: FOLDER_TINT, mindmap: 'bg-panel text-foreground', automation: 'bg-panel text-foreground', canvas: 'bg-panel text-foreground', board: 'bg-panel text-muted-foreground', image: 'bg-panel text-muted-foreground', text: 'bg-panel text-muted-foreground', pdf: 'bg-panel text-muted-foreground', archive: 'bg-panel text-muted-foreground', file: 'bg-panel text-muted-foreground' }
const TILE_SIZE = { small: 'size-7 rounded-md', big: 'size-10 rounded-[10px]', huge: 'size-[72px] rounded-[18px]' } as const
const ICON_SIZE = { small: 15, big: 20, huge: 40 } as const

function KindIcon({ kind, size: s = 'small' }: { kind: DriveKind; size?: keyof typeof TILE_SIZE }): JSX.Element {
  return <span className={cn('grid shrink-0 place-items-center', TILE_SIZE[s], TINT[kind])}><Icon name={ICON[kind]} size={ICON_SIZE[s]} /></span>
}
