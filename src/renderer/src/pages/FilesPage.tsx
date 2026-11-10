import { useEffect, useRef, useState } from 'react'
import type { Text } from '@codemirror/state'
import { diffLines } from 'diff'
import type { DriveText, GitDiff, KanbanDoc } from '@shared/types'
import type { AgencyView } from '../agencies'
import { FilePreview } from '../components/FilePreview'
import { GoogleDriveCard, syncNote, useGDrive } from '../components/GoogleDrive'
import { Icon } from '../components/Icon'
import { Pose } from '../components/Pose'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { DiffView } from '../files/DiffView'
import { EditorTabs, type Mode } from '../files/EditorTabs'
import { CodeEditor, EditorFooter } from '../files/EditorView'
import { ExplorerPanel } from '../files/ExplorerPanel'
import { SearchPanel } from '../files/SearchPanel'
import { SideBar, type Panel } from '../files/SideBar'
import { SourceControlPanel } from '../files/SourceControlPanel'
import { canPreview, extOf, fileKind, type FileKind } from '../files/editorSetup'
import { setLeaveGuard } from '../files/leaveGuard'
import { useCodeMirror, type Cursor } from '../files/useCodeMirror'
import { useConfirm } from '../components/useConfirm'
import { errorText, useGit } from '../files/useGit'

interface Props {
  agencies: AgencyView[]
  agencyId: string | null
  onAgency: (id: string) => void
  initialDir?: string
  onNewTaskWith: (agencyId: string, path: string) => void
  onNewAgency: () => void
  setHeader: (node: JSX.Element | null) => void
  onOpenTask: (sessionId: string, agentId: string) => void
  onOpenMemory: (agencyId: string) => void
}

/** One open tab: a file of the folder, or one file of a commit (read-only diff). */
interface Tab {
  key: string
  path: string
  kind: FileKind
  mode: Mode
  /** A file of a past commit: shown as that commit's diff only. */
  commit?: { hash: string; short: string }
  /** Which diff the Diff view shows: the working tree or the index vs HEAD, or the disk vs your edit. */
  diffOf: 'work' | 'staged' | 'disk'
  loaded: boolean
  error: string | null
  mtimeMs: number | null
  readOnly: DriveText['readOnly']
  dirty: boolean
  wrap: boolean
  /** The file changed on disk while this tab had unsaved edits (or a save was refused). */
  external: { text: string; mtimeMs: number } | null
  /** The file was deleted or moved on disk. */
  gone: boolean
  language: string
  indent: string
}

interface Working { name: string; sessionId: string | null; agentId: string | null }

const PANEL_KEY = (agencyId: string): string => `files:panel:${agencyId}`
const savedPanel = (agencyId: string | null): Panel => {
  try { const v = agencyId ? localStorage.getItem(PANEL_KEY(agencyId)) : null; return v === 'search' || v === 'scm' ? v : 'explorer' } catch { return 'explorer' }
}
const nameOf = (p: string): string => p.split('/').pop() ?? p
const isMac = (): boolean => navigator.platform.toLowerCase().includes('mac')
const countLines = (before: string, after: string): { added: number; removed: number } => {
  let added = 0
  let removed = 0
  for (const part of diffLines(before, after)) { if (part.added) added += part.count ?? 0; else if (part.removed) removed += part.count ?? 0 }
  return { added, removed }
}

/**
 * Files: a code editor for the agency's folder (10 Nov 2026, canvas artboard "26 · Files as a code editor").
 * A side bar with Explorer, Search and Source control; open files as tabs with Edit (CodeMirror 6), Diff
 * (@codemirror/merge) and Preview (components/FilePreview). Main does all file and git work; the user's own
 * edits save directly, agents' writes still go through review. While a card runs in the agency, everything is read-only.
 */
export function FilesPage({ agencies, agencyId, onAgency, initialDir, onNewTaskWith, onNewAgency, setHeader, onOpenTask, onOpenMemory }: Props): JSX.Element {
  const view = agencies.find((v) => v.agency.id === agencyId) ?? agencies[0] ?? null
  const projectId = view?.project.id ?? null
  const gd = useGDrive()
  const git = useGit(projectId)
  const [confirmEl, confirm] = useConfirm()
  const [panel, setPanelState] = useState<Panel>(() => savedPanel(view?.agency.id ?? null))
  const [hidden, setHidden] = useState(false)
  const [tick, setTick] = useState(0)
  const [tabs, setTabs] = useState<Tab[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState<Working | null>(null)
  const [diff, setDiff] = useState<{ key: string; diff: GitDiff | null; loading: boolean; error: string | null } | null>(null)
  const [previewNonce, setPreviewNonce] = useState(0)

  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const activeRef = useRef(active)
  activeRef.current = active
  /** The text each tab was opened or last saved with, to tell whether it has unsaved edits. */
  const saved = useRef(new Map<string, Text>())
  /** Where to put the cursor once a file has loaded (search results). */
  const pendingGoto = useRef<{ key: string; line: number; col: number; length: number } | null>(null)

  const patch = (key: string, p: Partial<Tab>): void => setTabs((ts) => ts.map((t) => (t.key === key ? { ...t, ...p } : t)))

  const cm = useCodeMirror({
    onChange: (key, doc) => {
      const base = saved.current.get(key)
      const dirty = !!base && !doc.eq(base)
      const t = tabsRef.current.find((x) => x.key === key)
      if (t && t.dirty !== dirty) patch(key, { dirty })
    },
    onCursor: setCursor
  })

  const agencyKey = view?.agency.id ?? null
  useEffect(() => { setPanelState(savedPanel(agencyKey)) }, [agencyKey])
  const setPanel = (p: Panel): void => {
    setPanelState(p)
    try { if (agencyKey) localStorage.setItem(PANEL_KEY(agencyKey), p) } catch { /* per-viewer convenience only */ }
  }

  // ── A card running in this agency: read-only until it finishes. ──
  useEffect(() => {
    if (!view) { setWorking(null); return }
    let live = true
    const team = [view.lead, ...view.workers].filter((a): a is NonNullable<typeof a> => !!a)
    const load = async (): Promise<void> => {
      try {
        const [running, text] = await Promise.all([window.tyslin.cards.running(), window.tyslin.studio.read(view.project.id, view.agency.boardPath).catch(() => null)])
        if (!live) return
        const doc = text ? (JSON.parse(text) as KanbanDoc) : null
        const card = doc?.columns.flatMap((c) => c.cards).find((k) => running.includes(k.id))
        if (!card) { setWorking(null); return }
        const who = team.find((a) => a.id === (card.agentId ?? card.assignee))
        setWorking({ name: who?.name ?? 'An agent', sessionId: card.sessionId ?? null, agentId: who?.id ?? card.agentId ?? null })
      } catch { if (live) setWorking(null) }
    }
    void load()
    const offBoard = window.tyslin.cards.onBoardChanged((p) => { if (p.projectId === view.project.id) void load() })
    const offRun = window.tyslin.sessions.onEvent((e) => { if (e.type === 'run_started' || e.type === 'run_finished' || e.type === 'run_error') void load() })
    const t = setInterval(() => void load(), 10_000)
    return () => { live = false; offBoard(); offRun(); clearInterval(t) }
  }, [view?.agency.id, view?.project.id, view?.agency.boardPath, view?.workers.length])
  const lockReason = working ? `${working.name} is working in this folder. Commits wait until the card finishes.` : null

  const roFor = (t: Tab): boolean => !!working || !!t.readOnly || !!t.commit
  // Read-only follows the running card.
  useEffect(() => { for (const t of tabsRef.current) if (t.loaded && t.kind === 'text' && !t.commit) cm.setReadOnly(t.key, roFor(t)) }, [!!working])

  // ── Opening files ──
  const load = async (key: string, path: string): Promise<void> => {
    if (!projectId) return
    try {
      const r = await window.tyslin.drive.readText(projectId, path)
      if (!tabsRef.current.some((t) => t.key === key)) return
      const wrap = extOf(path) === 'md' || extOf(path) === 'markdown'
      const info = cm.open(key, path, r.text, { readOnly: !!working || !!r.readOnly, wrap })
      const doc = cm.doc(key)
      if (doc) saved.current.set(key, doc)
      patch(key, { loaded: true, error: null, mtimeMs: r.mtimeMs, readOnly: r.readOnly, wrap, language: info.language, indent: info.indent })
    } catch (e) {
      patch(key, { loaded: false, error: errorText(e) })
    }
  }

  const openFile = (path: string, opts: { mode?: Mode; staged?: boolean; at?: { line: number; col: number; length: number } } = {}): void => {
    const key = path
    const kind = fileKind(path)
    const exists = tabsRef.current.find((t) => t.key === key)
    const mode: Mode = kind !== 'text' ? 'preview' : opts.mode ?? exists?.mode ?? 'edit'
    if (opts.at) pendingGoto.current = { key, ...opts.at }
    if (exists) {
      patch(key, { mode, ...(opts.staged !== undefined ? { diffOf: opts.staged ? 'staged' : 'work' } : {}) })
    } else {
      const t: Tab = { key, path, kind, mode, diffOf: opts.staged ? 'staged' : 'work', loaded: kind !== 'text', error: null, mtimeMs: null, readOnly: null, dirty: false, wrap: false, external: null, gone: false, language: '', indent: '' }
      setTabs((ts) => [...ts, t])
      if (kind === 'text') void load(key, path)
    }
    setActive(key)
  }

  const openCommitFile = (hash: string, path: string): void => {
    const c = git.log.find((x) => x.hash === hash)
    const key = `${hash}:${path}`
    if (!tabsRef.current.some((t) => t.key === key)) {
      setTabs((ts) => [...ts, { key, path, kind: 'text', mode: 'diff', commit: { hash, short: c?.short ?? hash.slice(0, 7) }, diffOf: 'work', loaded: true, error: null, mtimeMs: null, readOnly: null, dirty: false, wrap: false, external: null, gone: false, language: '', indent: '' }])
    }
    setActive(key)
  }

  // Show the active tab's state in the editor; jump to a search hit once it has loaded.
  const activeTab = tabs.find((t) => t.key === active) ?? null
  useEffect(() => {
    const t = activeTab
    if (t && t.kind === 'text' && t.loaded && !t.commit) cm.show(t.key)
    else { cm.show(null); setCursor(null) }
    const g = pendingGoto.current
    if (t && g && g.key === t.key && t.loaded && t.mode === 'edit') { pendingGoto.current = null; requestAnimationFrame(() => cm.goto(g.key, g.line, g.col, g.length)) }
  }, [active, activeTab?.loaded, activeTab?.mode])

  // ── Saving ──
  const save = async (key: string, force = false): Promise<boolean> => {
    const t = tabsRef.current.find((x) => x.key === key)
    if (!t || !projectId || t.kind !== 'text' || t.commit || !t.loaded) return false
    if (roFor(t)) { setError(working ? `${working.name} is working in this folder; files are read-only until the card finishes.` : 'This file is read-only here.'); return false }
    const text = cm.text(key)
    if (text === null) return false
    const doc = cm.doc(key)
    try {
      const r = await window.tyslin.drive.writeText(projectId, t.path, text, force || t.gone ? null : t.mtimeMs)
      if (!r.ok) { patch(key, { external: { text: r.text, mtimeMs: r.mtimeMs } }); return false }
      if (doc) saved.current.set(key, doc)
      const still = cm.doc(key)
      patch(key, { mtimeMs: r.mtimeMs, dirty: !!still && !!doc && !still.eq(doc), external: null, gone: false })
      setPreviewNonce((n) => n + 1)
      setError(null)
      void git.refresh()
      return true
    } catch (e) { setError(errorText(e)); return false }
  }
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); if (activeRef.current) void saveRef.current(activeRef.current) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Closing ──
  const dropTab = (key: string): void => {
    cm.close(key)
    saved.current.delete(key)
    setTabs((ts) => {
      const i = ts.findIndex((t) => t.key === key)
      const next = ts.filter((t) => t.key !== key)
      if (activeRef.current === key) setActive(next[Math.min(i, next.length - 1)]?.key ?? null)
      return next
    })
  }
  const closeTab = async (key: string): Promise<boolean> => {
    const t = tabsRef.current.find((x) => x.key === key)
    if (!t) return true
    if (t.dirty) {
      const a = await confirm({ title: `Save changes to ${nameOf(t.path)}?`, description: 'Your edits are lost if you close it without saving.', action: 'Save', alt: "Don't save" })
      if (a === false) return false
      if (a === true && !(await save(key))) return false
    }
    dropTab(key)
    return true
  }
  /** Before leaving the screen or switching agency: save, discard or stay. */
  const confirmUnsaved = async (): Promise<boolean> => {
    const dirty = tabsRef.current.filter((t) => t.dirty)
    if (!dirty.length) return true
    const a = await confirm({
      title: dirty.length === 1 ? `Save changes to ${nameOf(dirty[0].path)}?` : `Save changes to ${dirty.length} files?`,
      description: 'You have unsaved edits. They are lost if you leave without saving.',
      action: dirty.length === 1 ? 'Save and leave' : 'Save all and leave', alt: 'Leave without saving'
    })
    if (a === false) return false
    if (a === true) for (const t of dirty) if (!(await save(t.key))) return false
    return true
  }
  const dirtyCount = tabs.filter((t) => t.dirty).length
  useEffect(() => { setLeaveGuard(dirtyCount ? confirmUnsaved : null) }, [dirtyCount, working])
  useEffect(() => () => setLeaveGuard(null), [])

  // Another agency: its own tabs.
  const shown = useRef(projectId)
  useEffect(() => {
    if (shown.current === projectId) return
    shown.current = projectId
    for (const t of tabsRef.current) { cm.close(t.key); saved.current.delete(t.key) }
    setTabs([]); setActive(null); setDiff(null); setError(null)
  }, [projectId])
  const switchAgency = async (id: string): Promise<void> => { if (id !== view?.agency.id && (await confirmUnsaved())) onAgency(id) }
  const switchRef = useRef(switchAgency)
  switchRef.current = switchAgency

  // ── The folder watcher: the tree, git status and open tabs follow changes on disk. ──
  useEffect(() => {
    if (!projectId) return
    void window.tyslin.drive.watch(projectId)
    let gitTimer: ReturnType<typeof setTimeout> | null = null
    const off = window.tyslin.drive.onChanged((c) => {
      if (c.projectId !== projectId) return
      setTick((n) => n + 1)
      if (c.git && !gitTimer) gitTimer = setTimeout(() => { gitTimer = null; void git.refresh() }, 400)
      const all = c.paths.length >= 200
      for (const t of tabsRef.current) if (t.kind === 'text' && !t.commit && t.loaded && (all || c.paths.includes(t.path))) void checkDisk(t.key)
    })
    return () => { off(); if (gitTimer) clearTimeout(gitTimer); void window.tyslin.drive.unwatch() }
  }, [projectId])

  const checkDisk = async (key: string): Promise<void> => {
    const t = tabsRef.current.find((x) => x.key === key)
    if (!t || !projectId) return
    let r: DriveText
    try { r = await window.tyslin.drive.readText(projectId, t.path) } catch { patch(key, { gone: true }); return }
    const now = tabsRef.current.find((x) => x.key === key)
    if (!now) return
    if (now.mtimeMs !== null && Math.abs(r.mtimeMs - now.mtimeMs) <= 0.5) { if (now.gone) patch(key, { gone: false }); return }
    if (cm.text(key) === r.text) { const d = cm.doc(key); if (d) saved.current.set(key, d); patch(key, { mtimeMs: r.mtimeMs, gone: false, dirty: false, external: null }); return }
    if (!now.dirty) {
      // An unmodified tab reloads silently.
      cm.replace(key, r.text)
      const d = cm.doc(key)
      if (d) saved.current.set(key, d)
      patch(key, { mtimeMs: r.mtimeMs, gone: false, dirty: false, external: null })
      setPreviewNonce((n) => n + 1)
    } else {
      patch(key, { external: { text: r.text, mtimeMs: r.mtimeMs }, gone: false })
    }
  }
  const reloadFromDisk = (t: Tab): void => {
    if (!t.external) return
    cm.replace(t.key, t.external.text)
    const d = cm.doc(t.key)
    if (d) saved.current.set(t.key, d)
    patch(t.key, { mtimeMs: t.external.mtimeMs, external: null, dirty: false, mode: t.mode === 'diff' && t.diffOf === 'disk' ? 'edit' : t.mode })
  }

  // ── Renames, moves and deletes from the Explorer keep the tabs pointing at the right files. ──
  const renamed = (from: string, to: string): void => {
    setTabs((ts) => ts.map((t) => {
      if (t.commit || !(t.path === from || t.path.startsWith(from + '/'))) return t
      const path = to + t.path.slice(from.length)
      cm.rename(t.key, path)
      const s = saved.current.get(t.key)
      if (s) { saved.current.delete(t.key); saved.current.set(path, s) }
      if (activeRef.current === t.key) setActive(path)
      return { ...t, key: path, path }
    }))
  }
  const beforeRemove = async (path: string): Promise<boolean> => {
    const hit = tabsRef.current.filter((t) => !t.commit && (t.path === path || t.path.startsWith(path + '/')))
    if (hit.some((t) => t.dirty)) {
      const a = await confirm({ title: 'Delete with unsaved edits?', description: 'An open tab has unsaved edits. They are lost when the file goes to the Trash.', action: 'Delete anyway', destructive: true })
      if (a !== true) return false
    }
    for (const t of hit) dropTab(t.key)
    return true
  }

  // ── Diff ──
  const fileGit = activeTab && !activeTab.commit ? git.fileOf(activeTab.path) : null
  const diffKey = activeTab ? `${activeTab.key}|${activeTab.diffOf}|${activeTab.mode}` : ''
  useEffect(() => {
    const t = activeTab
    if (!t || t.mode !== 'diff' || !projectId) return
    let live = true
    if (t.diffOf === 'disk' && t.external) {
      const mine = cm.text(t.key) ?? ''
      setDiff({ key: t.key, diff: { path: t.path, before: t.external.text, after: mine, label: 'On disk vs your edit', ...countLines(t.external.text, mine) }, loading: false, error: null })
      return
    }
    setDiff((d) => (d && d.key === t.key ? { ...d, loading: true } : { key: t.key, diff: null, loading: true, error: null }))
    const p = t.commit ? window.tyslin.git.commitDiff(projectId, t.path, t.commit.hash) : window.tyslin.git.diff(projectId, t.path, t.diffOf === 'staged')
    p.then((d) => { if (live) setDiff({ key: t.key, diff: d, loading: false, error: null }) })
      .catch((e) => { if (live) setDiff({ key: t.key, diff: null, loading: false, error: errorText(e) }) })
    return () => { live = false }
  }, [diffKey, git.status, tick])

  // ── The header: agency, the open file's path, Google Drive and Open folder. ──
  const note = syncNote(gd, projectId, null)
  const dot = !gd?.connected ? 'border border-border-strong' : gd.syncing ? 'animate-ring-pulse bg-lime motion-reduce:animate-none' : gd.lastError ? 'bg-destructive' : 'bg-green'
  useEffect(() => {
    if (!view || !projectId) { setHeader(null); return }
    setHeader(
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {agencies.length > 1 ? (
          <Select value={view.agency.id} onValueChange={(v) => void switchRef.current(v)}>
            <SelectTrigger className="h-8 w-auto max-w-[220px] min-w-0 flex-none gap-1.5 border-0 bg-transparent px-1.5 text-[15px] font-medium shadow-none" aria-label="Agency folder"><SelectValue /></SelectTrigger>
            <SelectContent>{agencies.map((v) => <SelectItem key={v.agency.id} value={v.agency.id}>{v.agency.name}</SelectItem>)}</SelectContent>
          </Select>
        ) : <span className="flex-none truncate text-[15px] font-medium">{view.agency.name}</span>}
        {activeTab && <><span aria-hidden="true" className="text-muted-foreground">/</span><span className="min-w-0 truncate font-mono text-[13px] text-muted-foreground" title={activeTab.path}>{activeTab.path}{activeTab.commit ? ` @ ${activeTab.commit.short}` : ''}</span></>}
        <div className="ml-auto flex flex-none items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" aria-label={`Google Drive: ${gd?.connected ? note || 'connected' : 'not connected'}`}><span className={cn('size-2 rounded-full', dot)} aria-hidden="true" />Drive</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 border-0 bg-transparent p-0 shadow-none"><GoogleDriveCard /></PopoverContent>
          </Popover>
          <Button variant="ghost" size="sm" onClick={() => void window.tyslin.drive.reveal(projectId, '')}><Icon name="open" size={13} /> Open folder</Button>
        </div>
      </div>
    )
  }, [view?.agency.id, view?.agency.name, agencies.length, activeTab?.path, activeTab?.commit?.short, projectId, dot, note, gd?.connected])
  useEffect(() => () => setHeader(null), [])

  if (!view || !projectId) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <Empty className="max-w-[520px]"><EmptyHeader><EmptyMedia><Pose pose={6} height={140} /></EmptyMedia><EmptyTitle>No agency yet</EmptyTitle><EmptyDescription>Files live in each agency's folder. Create one and its folder shows here.</EmptyDescription></EmptyHeader><EmptyContent><Button onClick={onNewAgency}>Create an agency</Button></EmptyContent></Empty>
      </div>
    )
  }

  const t = activeTab
  const modes: Record<Mode, boolean> = {
    edit: !!t && t.kind === 'text' && !t.commit,
    diff: !!t && t.kind === 'text' && (!!t.commit || !!fileGit || !!t.external),
    preview: !!t && !t.commit && canPreview(t.path)
  }
  const setMode = (m: Mode): void => {
    if (!t) return
    patch(t.key, { mode: m, ...(m === 'diff' && !t.commit ? { diffOf: t.external ? 'disk' : fileGit && !fileGit.unstaged && fileGit.staged ? 'staged' : t.diffOf === 'disk' ? 'work' : t.diffOf } : {}) })
  }
  const ro = t ? roFor(t) : false
  const saveState = !t || t.kind !== 'text' || !t.loaded ? null
    : t.commit || ro ? { text: 'Read-only', tone: 'muted' as const }
    : t.dirty ? { text: `Unsaved · ${isMac() ? 'Cmd' : 'Ctrl'}+S`, tone: 'warn' as const } : { text: 'Saved', tone: 'muted' as const }
  const showEdit = !!t && t.mode === 'edit' && t.kind === 'text' && t.loaded && !t.commit
  const memberTask = working?.sessionId && working.agentId ? () => onOpenTask(working.sessionId!, working.agentId!) : null

  const sidePanel = panel === 'explorer'
    ? <ExplorerPanel projectId={projectId} agencyName={view.agency.name} hidden={hidden} setHidden={setHidden} activePath={t && !t.commit ? t.path : null}
        letterOf={git.letterOf} changed={(git.status?.files ?? []).map((f) => f.path)} tick={tick} initialDir={initialDir}
        onOpen={(p) => openFile(p)} onNewTask={(p) => onNewTaskWith(view.agency.id, p)} beforeRemove={beforeRemove} onRenamed={renamed}
        onSearch={() => setPanel('search')} onError={setError} confirm={confirm} />
    : panel === 'search'
      ? <SearchPanel projectId={projectId} tick={tick} onOpenAt={(p, line, col, length) => openFile(p, { mode: 'edit', at: { line, col, length } })} />
      : <SourceControlPanel projectId={projectId} git={git} lockReason={lockReason} unsaved={dirtyCount} confirm={confirm}
          onOpenDiff={(p, staged) => openFile(p, { mode: fileKind(p) === 'text' ? 'diff' : 'preview', staged })} onOpenCommitFile={openCommitFile} />

  return (
    <div className="flex h-full min-h-0 min-w-0 text-foreground">
      <SideBar panel={panel} onPanel={setPanel} changes={git.status?.files.length ?? 0}>{sidePanel}</SideBar>

      <section aria-label="Editor" className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
        {tabs.length > 0 && (
          <EditorTabs
            tabs={tabs.map((x) => ({ key: x.key, name: x.commit ? `${nameOf(x.path)} (${x.commit.short})` : nameOf(x.path), title: x.path, dirty: x.dirty }))}
            active={active} onPick={setActive} onClose={(k) => void closeTab(k)}
            mode={t?.mode ?? 'edit'} modes={modes} onMode={setMode}
            wrap={t && t.kind === 'text' && t.loaded && !t.commit ? t.wrap : null}
            onWrap={(on) => { if (t) { cm.setWrap(t.key, on); patch(t.key, { wrap: on }) } }}
            onCloseOthers={() => { void (async () => { for (const x of tabsRef.current) if (x.key !== active && !(await closeTab(x.key))) return })() }}
            onReveal={() => t && void window.tyslin.drive.reveal(projectId, t.path)} />
        )}

        {working && (
          <Alert className="flex-none rounded-none border-x-0 border-t-0 border-b-border bg-lime-soft py-2.5 text-foreground" role="status">
            <svg viewBox="0 0 16 16" aria-hidden="true" className="animate-blink fill-lime motion-reduce:animate-none"><circle cx="8" cy="8" r="5" /></svg>
            <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-foreground">
              <span className="min-w-0 flex-1"><strong className="font-semibold">{working.name} is working in this folder.</strong> Files are read-only and commits wait until the card finishes.</span>
              {memberTask && <Button variant="outline" size="sm" onClick={memberTask}>Open the task</Button>}
            </AlertDescription>
          </Alert>
        )}
        {t?.readOnly === 'memory' && (
          <Bar>
            <span className="min-w-0 flex-1">Memory notes are read-only here. Edit them on the agency's Memory tab.</span>
            <Button variant="outline" size="sm" onClick={() => onOpenMemory(view.agency.id)}>Open Memory</Button>
          </Bar>
        )}
        {t?.readOnly === 'app' && <Bar><span className="min-w-0 flex-1">This is the app's own data (a board, map or design). It is read-only here.</span></Bar>}
        {t?.external && (
          <Bar warn>
            <span className="min-w-0 flex-1"><strong className="font-semibold">{nameOf(t.path)} changed on disk</strong> while you were editing it.</span>
            <Button variant="outline" size="sm" onClick={() => reloadFromDisk(t)}>Reload</Button>
            <Button variant="outline" size="sm" onClick={() => patch(t.key, { mtimeMs: t.external!.mtimeMs, external: null, mode: t.mode === 'diff' && t.diffOf === 'disk' ? 'edit' : t.mode })}>Keep mine</Button>
            <Button variant="outline" size="sm" onClick={() => patch(t.key, { mode: 'diff', diffOf: 'disk' })}>Compare</Button>
          </Bar>
        )}
        {t?.gone && (
          <Bar warn>
            <span className="min-w-0 flex-1"><strong className="font-semibold">{nameOf(t.path)} was deleted or moved on disk.</strong>{t.dirty ? ' Your edits are still here.' : ''}</span>
            {t.dirty && !ro && <Button variant="outline" size="sm" onClick={() => void save(t.key, true)}>Save mine again</Button>}
            <Button variant="outline" size="sm" onClick={() => dropTab(t.key)}>Close tab</Button>
          </Bar>
        )}
        {error && (
          <Alert variant="destructive" className="flex-none rounded-none border-x-0 border-t-0 py-2">
            <AlertDescription className="flex items-center gap-3 text-[13px]"><span className="min-w-0 flex-1">{error}</span><Button variant="ghost" size="sm" onClick={() => setError(null)}>Dismiss</Button></AlertDescription>
          </Alert>
        )}

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <CodeEditor mount={cm.ref} hidden={!showEdit} />
          {t && t.mode === 'diff' && <DiffView diff={diff?.key === t.key ? diff.diff : null} loading={diff?.key !== t.key || diff.loading} error={diff?.key === t.key ? diff.error : null} />}
          {t && t.mode === 'preview' && <FilePreview projectId={projectId} path={t.path} viewport="desktop" nonce={previewNonce} className="min-h-0 flex-1 bg-card" />}
          {t && t.mode === 'edit' && t.kind === 'text' && !t.loaded && (
            <div className="flex flex-1 flex-col items-start gap-3 p-6 text-[13px]">
              {t.error ? <>
                <p className="text-muted-foreground" role="alert">{t.error}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => void window.tyslin.drive.open(projectId, t.path)}>Open with another app</Button>
                  {fileGit && <Button variant="outline" size="sm" onClick={() => setMode('diff')}>Show the diff</Button>}
                </div>
              </> : <p className="text-muted-foreground" role="status">Opening {nameOf(t.path)}…</p>}
            </div>
          )}
          {!t && (
            <div className="flex flex-1 items-center justify-center p-8">
              <Empty className="max-w-[460px] border-0">
                <EmptyHeader>
                  <EmptyMedia><Pose pose={6} height={140} /></EmptyMedia>
                  <EmptyTitle>Pick a file in Explorer</EmptyTitle>
                  <EmptyDescription>Open a file to edit it, see its git changes or preview it. Files your agency makes show up in the tree as they land.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          )}
        </div>

        <EditorFooter branch={git.status?.repo ? (git.status.branch ?? (git.status.detached ? 'detached' : null)) : null}
          cursor={showEdit && cursor ? `Ln ${cursor.line}, Col ${cursor.col}` : null}
          language={t && t.kind === 'text' && t.loaded && !t.commit ? t.language : null}
          indent={t && t.kind === 'text' && t.loaded && !t.commit ? t.indent : null}
          state={saveState} />
      </section>
      {confirmEl}
    </div>
  )
}

/** A thin notice across the editor (read-only reasons, changes on disk). */
function Bar({ children, warn }: { children: React.ReactNode; warn?: boolean }): JSX.Element {
  return (
    <Alert className={cn('flex-none rounded-none border-x-0 border-t-0 py-2', warn ? 'bg-panel' : 'bg-background')}>
      <AlertDescription className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] text-foreground">{children}</AlertDescription>
    </Alert>
  )
}
