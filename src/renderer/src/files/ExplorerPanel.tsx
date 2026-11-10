import { useEffect, useRef, useState } from 'react'
import type { DriveEntry, GitLetter } from '@shared/types'
import { Icon, type IconName } from '../components/Icon'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { LETTER_CLASS, LETTER_LABEL, errorText } from './useGit'
import type { Confirm } from './useConfirm'

interface Props {
  projectId: string
  agencyName: string
  hidden: boolean
  setHidden: (v: boolean) => void
  activePath: string | null
  letterOf: (path: string) => GitLetter | null
  changed: string[]
  /** Bumped when the folder changes on disk, so open folders reload. */
  tick: number
  /** A folder to show open (route `dir`). */
  initialDir?: string
  onOpen: (path: string) => void
  onNewTask: (path: string) => void
  /** Before a delete: closes the tabs under that path (false = the user kept them). */
  beforeRemove: (path: string) => Promise<boolean>
  onRenamed: (from: string, to: string) => void
  onSearch: () => void
  onError: (msg: string | null) => void
  confirm: Confirm
}

type Naming = { mode: 'file' | 'folder'; dir: string; value: string } | { mode: 'rename'; path: string; value: string }
const DRAG = 'application/x-tyslin-path'
const parentOf = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
const ICONS: Partial<Record<DriveEntry['kind'], IconName>> = { image: 'art', board: 'kanban', mindmap: 'mindmap', automation: 'workflow', canvas: 'canvas', archive: 'folder' }

/**
 * Explorer: the agency folder as a tree (folders first, loaded as they open), with git letters, drag to move,
 * drop from the desktop to add, and a context menu per row. memory/ and boards/ show only with Show hidden files.
 */
export function ExplorerPanel(p: Props): JSX.Element {
  const [dirs, setDirs] = useState<Record<string, DriveEntry[]>>({})
  const [folder, setFolder] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)
  const [naming, setNaming] = useState<Naming | null>(null)
  const [dropOn, setDropOn] = useState<string | null>(null)
  const openRef = useRef(open)
  openRef.current = open

  const load = async (dir: string): Promise<void> => {
    try {
      const l = await window.tyslin.drive.list(p.projectId, dir, p.hidden)
      setFolder(l.folder)
      setDirs((d) => ({ ...d, [dir]: l.entries }))
    } catch (e) {
      // A folder that went away: forget it.
      if (dir) { setDirs((d) => { const n = { ...d }; delete n[dir]; return n }); setOpen((o) => { const n = new Set(o); n.delete(dir); return n }) }
      else p.onError(errorText(e))
    }
  }
  const reloadAll = (): void => { void load(''); for (const d of openRef.current) void load(d) }

  useEffect(() => {
    setDirs({}); setSelected(null); void load('')
    // Open the route's folder and its parents.
    const parts = (p.initialDir ?? '').split('/').filter(Boolean)
    const want = parts.map((_, i) => parts.slice(0, i + 1).join('/'))
    setOpen(new Set(want))
    for (const d of want) void load(d)
  }, [p.projectId])
  useEffect(reloadAll, [p.hidden, p.tick])

  const act = async (fn: () => Promise<unknown>): Promise<boolean> => {
    p.onError(null)
    try { await fn(); reloadAll(); return true } catch (e) { p.onError(errorText(e)); return false }
  }
  const toggle = (dir: string, on: boolean): void => {
    setOpen((o) => { const n = new Set(o); if (on) n.add(dir); else n.delete(dir); return n })
    if (on) void load(dir)
  }
  /** Where New file and New folder go: the selected folder, or the selected file's folder. */
  const targetDir = (): string => {
    if (!selected) return ''
    const isDir = Object.values(dirs).some((list) => list.some((e) => e.path === selected && e.isDir))
    return isDir ? selected : parentOf(selected)
  }

  const submit = async (): Promise<void> => {
    if (!naming) return
    const v = naming.value.trim()
    if (!v) return
    if (naming.mode === 'file') {
      const dir = naming.dir
      let made = ''
      if (await act(async () => { made = await window.tyslin.drive.createFile(p.projectId, dir, v) })) { if (dir) toggle(dir, true); p.onOpen(made) }
    } else if (naming.mode === 'folder') {
      const dir = naming.dir
      if (await act(() => window.tyslin.drive.mkdir(p.projectId, dir, v)) && dir) toggle(dir, true)
    } else {
      const from = (naming as { path: string }).path
      const to = (parentOf(from) ? parentOf(from) + '/' : '') + v.replace(/[\\/]+/g, ' ')
      if (to !== from && await act(() => window.tyslin.drive.rename(p.projectId, from, v))) p.onRenamed(from, to)
    }
    setNaming(null)
  }

  const remove = async (e: DriveEntry): Promise<void> => {
    const ok = await p.confirm({
      title: `Move ${e.name} to the Trash?`,
      description: e.isDir ? 'The folder and everything in it go to the system Trash. You can put them back from there.' : 'It goes to the system Trash. You can put it back from there.',
      action: 'Move to Trash', destructive: true
    })
    if (ok !== true || !(await p.beforeRemove(e.path))) return
    await act(() => window.tyslin.drive.remove(p.projectId, e.path))
  }

  const duplicate = (e: DriveEntry): void => { void act(() => window.tyslin.drive.duplicate(p.projectId, e.path)) }
  const copyPath = (e: DriveEntry): void => {
    const sep = folder.includes('\\') ? '\\' : '/'
    void navigator.clipboard.writeText(folder + sep + e.path.split('/').join(sep)).catch(() => p.onError('Could not copy to the clipboard.'))
  }

  const drop = (ev: React.DragEvent, dir: string): void => {
    ev.preventDefault()
    ev.stopPropagation()
    setDropOn(null)
    const moving = ev.dataTransfer.getData(DRAG)
    if (moving) {
      if (moving === dir || parentOf(moving) === dir) return
      const to = (dir ? dir + '/' : '') + moving.split('/').pop()
      void act(() => window.tyslin.drive.move(p.projectId, moving, dir)).then((ok) => { if (ok) { p.onRenamed(moving, to); if (dir) toggle(dir, true) } })
      return
    }
    const paths = window.tyslin.drive.pathsFor(Array.from(ev.dataTransfer.files))
    if (paths.length) void act(() => window.tyslin.drive.copyIn(p.projectId, dir, paths)).then(() => { if (dir) toggle(dir, true) })
  }
  const dropProps = (key: string, dir: string): Pick<React.HTMLAttributes<HTMLElement>, 'onDragOver' | 'onDragLeave' | 'onDrop'> => ({
    onDragOver: (ev) => { ev.preventDefault(); ev.stopPropagation(); ev.dataTransfer.dropEffect = ev.dataTransfer.types.includes(DRAG) ? 'move' : 'copy'; if (dropOn !== key) setDropOn(key) },
    onDragLeave: (ev) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setDropOn((d) => (d === key ? null : d)) },
    onDrop: (ev) => drop(ev, dir)
  })

  const rows = (dir: string, depth: number): JSX.Element[] => (dirs[dir] ?? []).map((e) => {
    const pad = { paddingLeft: 8 + depth * 14 }
    const menu = (
      <ContextMenuContent className="w-56">
        <ContextMenuItem onSelect={() => (e.isDir ? toggle(e.path, !open.has(e.path)) : p.onOpen(e.path))}>{e.isDir ? (open.has(e.path) ? 'Close folder' : 'Open folder') : 'Open'}</ContextMenuItem>
        {e.isDir && <ContextMenuItem onSelect={() => setNaming({ mode: 'file', dir: e.path, value: '' })}>New file here</ContextMenuItem>}
        {e.isDir && <ContextMenuItem onSelect={() => setNaming({ mode: 'folder', dir: e.path, value: '' })}>New folder here</ContextMenuItem>}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => setNaming({ mode: 'rename', path: e.path, value: e.name })}>Rename</ContextMenuItem>
        <ContextMenuItem onSelect={() => duplicate(e)}>Duplicate</ContextMenuItem>
        <ContextMenuItem onSelect={() => copyPath(e)}>Copy path</ContextMenuItem>
        <ContextMenuItem onSelect={() => void window.tyslin.drive.reveal(p.projectId, e.path)}>Show in folder</ContextMenuItem>
        {!e.isDir && <ContextMenuItem onSelect={() => p.onNewTask(e.path)}>New task with this file</ContextMenuItem>}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => void remove(e)}>Delete</ContextMenuItem>
      </ContextMenuContent>
    )
    const common = {
      draggable: true,
      onDragStart: (ev: React.DragEvent) => { ev.dataTransfer.setData(DRAG, e.path); ev.dataTransfer.effectAllowed = 'move' },
      onFocus: () => setSelected(e.path),
      role: 'treeitem',
      'aria-level': depth + 1,
      'aria-selected': selected === e.path
    }
    if (e.isDir) {
      const isOpen = open.has(e.path)
      const dot = p.changed.some((c) => c.startsWith(e.path + '/'))
      return (
        <Collapsible key={e.path} open={isOpen} onOpenChange={(o) => toggle(e.path, o)} {...dropProps(e.path, e.path)} className={cn(dropOn === e.path && DROP)}>
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div>
                <CollapsibleTrigger className={cn(ROW, selected === e.path && 'bg-sidebar-accent')} style={pad} onClick={() => setSelected(e.path)} {...common}>
                  <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={13} className="text-muted-foreground" />
                  <Icon name="folder" size={15} className="text-green" />
                  <span className="min-w-0 flex-1 truncate">{e.name}</span>
                  {dot && <span className="mr-1.5 size-1.5 flex-none rounded-full bg-text-amber" aria-label="Contains changes" />}
                </CollapsibleTrigger>
              </div>
            </ContextMenuTrigger>
            {menu}
          </ContextMenu>
          <CollapsibleContent>{isOpen && rows(e.path, depth + 1)}</CollapsibleContent>
        </Collapsible>
      )
    }
    const letter = p.letterOf(e.path)
    return (
      <ContextMenu key={e.path}>
        <ContextMenuTrigger asChild>
          <button type="button" className={cn(ROW, p.activePath === e.path && 'bg-sidebar-accent font-medium')} style={pad}
            onClick={() => { setSelected(e.path); p.onOpen(e.path) }} {...common}
            {...dropProps('f:' + e.path, dir)}>
            <span className="w-[13px] flex-none" />
            <Icon name={ICONS[e.kind] ?? 'file'} size={15} className="text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{e.name}</span>
            {letter && <span className={cn('w-4 flex-none text-center font-mono text-[11px] font-medium', LETTER_CLASS[letter])} aria-label={LETTER_LABEL[letter]} title={LETTER_LABEL[letter]}>{letter}</span>}
          </button>
        </ContextMenuTrigger>
        {menu}
      </ContextMenu>
    )
  })

  const root = dirs['']
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-10 flex-none items-center justify-between gap-1 pr-1.5 pl-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Explorer</h2>
        <div className="flex items-center">
          <MiniButton label="New file" icon="filePlus" onClick={() => setNaming({ mode: 'file', dir: targetDir(), value: '' })} />
          <MiniButton label="New folder" icon="folderPlus" onClick={() => setNaming({ mode: 'folder', dir: targetDir(), value: '' })} />
          <MiniButton label="Search in files" icon="search" onClick={p.onSearch} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className={MINI} aria-label="More Explorer actions" title="More"><Icon name="more" size={15} /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuCheckboxItem checked={p.hidden} onCheckedChange={(v) => p.setHidden(v === true)}>Show hidden files</DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => reloadAll()}>Refresh</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setOpen(new Set())}>Collapse all folders</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void window.tyslin.drive.reveal(p.projectId, '')}>Open the folder</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {naming && (
        <form className="flex flex-none flex-col gap-1.5 px-3 pb-2" onSubmit={(e) => { e.preventDefault(); void submit() }}>
          <Label htmlFor="explorer-name" className="text-xs font-normal text-muted-foreground">
            {naming.mode === 'rename' ? `Rename ${naming.path.split('/').pop()}` : `New ${naming.mode} in ${naming.dir ? naming.dir + '/' : p.agencyName}`}
          </Label>
          <div className="flex items-center gap-1.5">
            <Input id="explorer-name" autoFocus className="h-8 min-w-0 flex-1 font-mono text-[13px]" value={naming.value} placeholder={naming.mode === 'folder' ? 'folder-name' : 'name.md'}
              onChange={(e) => setNaming({ ...naming, value: e.target.value })} onKeyDown={(e) => { if (e.key === 'Escape') setNaming(null) }} />
            <Button type="submit" size="sm">{naming.mode === 'rename' ? 'Rename' : 'Create'}</Button>
          </div>
        </form>
      )}

      <ScrollArea className={cn('min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block', dropOn === '' && DROP)} {...dropProps('', '')}>
        <div role="tree" aria-label={`${p.agencyName} folder`} className="flex flex-col px-1.5 pb-2">
          {root && root.length === 0 && <p className="px-2 py-3 text-[13px] text-muted-foreground">This folder is empty. Drop files here or use New file.</p>}
          {rows('', 0)}
        </div>
      </ScrollArea>
      <p className="flex-none border-t border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        {p.hidden ? 'Hidden files are shown. memory/ and the app\'s own data are read-only here.' : 'memory/ and boards/ are hidden. Turn on Show hidden files in the … menu to see them (read-only here).'}
      </p>
    </div>
  )
}

const ROW = 'flex h-[30px] w-full min-w-0 cursor-default items-center gap-1.5 rounded-md pr-2 text-left text-[13.5px] text-foreground outline-none hover:bg-sidebar-accent/70 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-inset'
const DROP = 'rounded-md outline-2 -outline-offset-2 outline-green outline-dashed'
/** 28 px to look at, 44 px to hit (the ::after reaches out 8 px on every side). */
export const MINI = 'relative size-7 text-muted-foreground after:absolute after:-inset-2 after:content-[""] hover:text-foreground'

export function MiniButton({ label, icon, onClick, disabled, className }: { label: string; icon: IconName; onClick: () => void; disabled?: boolean; className?: string }): JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className={cn(MINI, className)} aria-label={label} onClick={onClick} disabled={disabled}><Icon name={icon} size={15} /></Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
