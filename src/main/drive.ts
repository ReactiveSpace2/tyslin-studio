import { dialog, shell, type BrowserWindow } from 'electron'
import { chmodSync, closeSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, realpathSync, renameSync, statSync, watch, writeFileSync, type FSWatcher } from 'fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'path'
import type { DriveChange, DriveEntry, DriveKind, DriveListing, DrivePreview, DriveSearchFile, DriveSearchOptions, DriveSearchResult, DriveText, DriveWriteResult } from '@shared/types'
import { projectFor } from './studio'

/**
 * Drive: a file browser over each project's folder (the Default project when none is chosen).
 * Mind maps, automations, run logs and Canvas designs live here too, as ordinary files.
 * Every path is resolved inside the project folder; nothing outside it can be read or changed.
 */

const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])
const TEXT = new Set(['.md', '.txt', '.json', '.csv', '.ts', '.tsx', '.js', '.jsx', '.py', '.html', '.css', '.yml', '.yaml', '.toml', '.xml', '.sh', '.sql', '.log', '.env.example'])
const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' }
const MAX_TEXT = 512 * 1024
const MAX_IMAGE = 8 * 1024 * 1024

export function root(projectId: string | null): { folder: string; projectId: string } {
  const p = projectFor(projectId)
  return { folder: p.folder!, projectId: p.id }
}

/**
 * A path inside the folder ('' = the folder itself); refuses escapes and .git. A symlink inside the folder (or a
 * dangling one) could still lead outside it, so where the path really goes is checked too (same rule as tools.ts).
 * Shared with git.ts, so every path git is given passes the same check.
 */
export function inside(folder: string, rel: string, allowRoot = false): string {
  const abs = resolve(folder, rel || '.')
  const r = relative(folder, abs)
  if ((!r && !allowRoot) || r.startsWith('..') || isAbsolute(r) || r.split(sep).includes('.git')) throw new Error('That path is outside the project folder.')
  let probe = abs
  for (;;) {
    try { lstatSync(probe); break } catch { /* not there yet: check its parent */ }
    const up = dirname(probe)
    if (up === probe) break
    probe = up
  }
  let real: string
  try { real = relative(realpathSync(folder), realpathSync(probe)) } catch { throw new Error('That path is outside the project folder.') }
  if (real.startsWith('..') || isAbsolute(real)) throw new Error('That path is outside the project folder.')
  return abs
}

const toRel = (folder: string, abs: string): string => relative(folder, abs).split(sep).join('/')

const ARCHIVE = new Set(['.zip', '.tar', '.gz', '.tgz', '.7z', '.rar', '.bz2', '.xz'])
/** App data: shown in Kanban, Mind mapper, Canvas and Automation, not in Drive (unless hidden files are shown). */
const APP_KINDS = new Set<DriveKind>(['mindmap', 'board', 'automation', 'canvas'])
const APP_DIRS = new Set(['boards', 'mindmaps', 'canvas', 'automations', 'workflows'])
/** Hidden at the folder's root unless Show hidden files is on: the app's data plus agency memory (edited on the Memory tab). */
const HIDDEN_DIRS = new Set([...APP_DIRS, 'memory'])

function kindOf(name: string, isDir: boolean): DriveKind {
  if (isDir) return 'folder'
  if (name.endsWith('.mindmap.json')) return 'mindmap'
  if (name.endsWith('.board.json')) return 'board'
  if (name.endsWith('.automation.json')) return 'automation'
  if (name.endsWith('.canvas.json')) return 'canvas'
  const ext = extname(name).toLowerCase()
  if (IMAGE.has(ext)) return 'image'
  if (ext === '.pdf') return 'pdf'
  if (ARCHIVE.has(ext) || name.toLowerCase().endsWith('.tar.gz')) return 'archive'
  if (TEXT.has(ext) || !ext) return 'text'
  return 'file'
}

export function driveList(projectId: string | null, dir: string, showHidden = false): DriveListing {
  const { folder, projectId: id } = root(projectId)
  const abs = inside(folder, dir, true)
  const entries: DriveEntry[] = []
  const atRoot = abs === folder
  for (const name of readdirSync(abs)) {
    if (name === '.git' || (!showHidden && name.startsWith('.'))) continue
    // Drive shows real files: Tyslin's own app data (boards, maps, designs, automations) stays in their screens.
    if (!showHidden && atRoot && HIDDEN_DIRS.has(name)) continue
    try {
      const st = statSync(join(abs, name))
      const isDir = st.isDirectory()
      const kind = kindOf(name, isDir)
      if (!showHidden && APP_KINDS.has(kind)) continue
      entries.push({ name, path: toRel(folder, join(abs, name)), isDir, kind, size: isDir ? 0 : st.size, updatedAt: st.mtimeMs })
    } catch { /* unreadable entry: skip */ }
  }
  entries.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, undefined, { numeric: true }))
  return { projectId: id, folder, dir: toRel(folder, abs), entries }
}

export function drivePreview(projectId: string | null, path: string): DrivePreview {
  const { folder } = root(projectId)
  const abs = inside(folder, path)
  const st = statSync(abs)
  const ext = extname(abs).toLowerCase()
  if (IMAGE.has(ext)) {
    if (st.size > MAX_IMAGE) return { kind: 'none', note: 'Too large to preview.' }
    return { kind: 'image', dataUrl: `data:${MIME[ext]};base64,${readFileSync(abs).toString('base64')}` }
  }
  if (st.isDirectory()) return { kind: 'none', note: 'No preview for a folder.' }
  // Read only the start: a multi-gigabyte video or archive must not be loaded whole into memory.
  const buf = Buffer.alloc(Math.min(st.size, MAX_TEXT))
  const fd = openSync(abs, 'r')
  try { readSync(fd, buf, 0, buf.length, 0) } finally { closeSync(fd) }
  if (buf.subarray(0, 8000).includes(0)) return { kind: 'none', note: 'No preview for this kind of file.' }
  return { kind: 'text', text: buf.toString('utf8'), truncated: st.size > MAX_TEXT }
}

export function driveMkdir(projectId: string | null, dir: string, name: string): void {
  const { folder } = root(projectId)
  const clean = name.trim().replace(/[\\/]+/g, ' ')
  if (!clean || clean === '.' || clean === '..') throw new Error('Give the folder a name.')
  const abs = inside(folder, join(dir, clean))
  if (existsSync(abs)) throw new Error(`${clean} already exists here.`)
  mkdirSync(abs, { recursive: true })
}

export function driveRename(projectId: string | null, path: string, name: string): void {
  const { folder } = root(projectId)
  const clean = name.trim().replace(/[\\/]+/g, ' ')
  if (!clean || clean === '.' || clean === '..') throw new Error('Give it a name.')
  const from = inside(folder, path)
  const to = inside(folder, join(path, '..', clean))
  if (existsSync(to)) throw new Error(`${clean} already exists here.`)
  renameSync(from, to)
}

export function driveMove(projectId: string | null, path: string, toDir: string): void {
  const { folder } = root(projectId)
  const from = inside(folder, path)
  const dest = inside(folder, toDir, true)
  if (dest === from || dest.startsWith(from + sep)) throw new Error('A folder can\'t go inside itself.')
  const to = join(dest, basename(from))
  if (existsSync(to)) throw new Error(`${basename(from)} already exists there.`)
  renameSync(from, to)
}

/** Moves a file or folder to the system Trash (never deleted outright). */
export async function driveRemove(projectId: string | null, path: string): Promise<void> {
  const { folder } = root(projectId)
  const abs = inside(folder, path)
  if (!existsSync(abs)) return
  await shell.trashItem(abs)
}

/** Copies files or folders from elsewhere on the computer into a folder of the project (a free name when taken). */
export function driveCopyIn(projectId: string | null, dir: string, sources: string[]): number {
  const { folder } = root(projectId)
  const dest = inside(folder, dir, true)
  let n = 0
  for (const src of sources) {
    if (!isAbsolute(src) || !existsSync(src)) continue
    const st = statSync(src)
    const ext = st.isDirectory() ? '' : extname(src)
    const stem = basename(src, ext)
    let to = join(dest, stem + ext)
    for (let i = 2; existsSync(to); i++) to = join(dest, `${stem} ${i}${ext}`)
    if (st.isDirectory()) cpSync(src, to, { recursive: true })
    else copyFileSync(src, to)
    n++
  }
  return n
}

export async function driveUpload(win: BrowserWindow | null, projectId: string | null, dir: string): Promise<number> {
  const r = win
    ? await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], title: 'Add files to this folder' })
    : await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
  return r.canceled ? 0 : driveCopyIn(projectId, dir, r.filePaths)
}

export function driveOpen(projectId: string | null, path: string): void {
  const { folder } = root(projectId)
  void shell.openPath(inside(folder, path))
}

export function driveReveal(projectId: string | null, path: string): void {
  const { folder } = root(projectId)
  if (!path) void shell.openPath(folder)
  else shell.showItemInFolder(inside(folder, path))
}

// ── The Files editor (10 Nov 2026): text read/write, new files, search, and a folder watcher. ──

/** Files the editor opens: up to 2 MB, and only text (no NUL byte in the first 8 KB). */
const MAX_EDIT = 2 * 1024 * 1024
const BINARY_PROBE = 8 * 1024

/** Why a file is read-only in the editor: agency memory (edited on the Memory tab) or the app's own data. */
export function readOnlyReason(rel: string): DriveText['readOnly'] {
  const parts = rel.split('/')
  if (parts[0] === 'memory') return 'memory'
  if (APP_DIRS.has(parts[0]) || APP_KINDS.has(kindOf(parts[parts.length - 1], false))) return 'app'
  return null
}

function isBinary(buf: Buffer): boolean {
  return buf.subarray(0, BINARY_PROBE).includes(0)
}

export function driveReadText(projectId: string | null, path: string): DriveText {
  const { folder } = root(projectId)
  const abs = inside(folder, path)
  const st = statSync(abs)
  if (st.isDirectory()) throw new Error('That is a folder.')
  if (st.size > MAX_EDIT) throw new Error(`${basename(abs)} is over 2 MB, too large to open here. Open it with another app instead.`)
  const buf = readFileSync(abs)
  if (isBinary(buf)) throw new Error(`${basename(abs)} isn't a text file, so it can't be edited here. Open it with another app instead.`)
  return { text: buf.toString('utf8'), mtimeMs: st.mtimeMs, size: st.size, readOnly: readOnlyReason(toRel(folder, abs)) }
}

/**
 * Saves the user's own edit directly (no diff review: agents' writes still go through pending_changes).
 * Atomic: a temporary file next to it, then a rename, like boardTools.ts writeBoard. When the file changed on disk
 * since it was opened (`expectedMtimeMs`), nothing is written and the current text comes back instead.
 */
export function driveWriteText(projectId: string | null, path: string, text: string, expectedMtimeMs: number | null): DriveWriteResult {
  const { folder } = root(projectId)
  const abs = inside(folder, path)
  const rel = toRel(folder, abs)
  const ro = readOnlyReason(rel)
  if (ro === 'memory') throw new Error('Memory notes are edited on the agency\'s Memory tab.')
  if (ro === 'app') throw new Error('This is the app\'s own data; it can\'t be edited here.')
  if (Buffer.byteLength(text, 'utf8') > MAX_EDIT) throw new Error('That is over 2 MB, too large to save here.')
  let mode: number | null = null
  if (existsSync(abs)) {
    const st = statSync(abs)
    if (st.isDirectory()) throw new Error('That is a folder.')
    mode = st.mode
    if (expectedMtimeMs !== null && Math.abs(st.mtimeMs - expectedMtimeMs) > 0.5) {
      const now = driveReadText(projectId, rel)
      return { ok: false, text: now.text, mtimeMs: now.mtimeMs }
    }
  } else if (expectedMtimeMs !== null) {
    throw new Error(`${basename(abs)} was deleted or moved since you opened it.`)
  }
  const tmp = join(dirname(abs), `.${basename(abs)}.${process.pid}.tyslin-tmp`)
  writeFileSync(tmp, text, 'utf8')
  if (mode !== null) { try { chmodSync(tmp, mode & 0o7777) } catch { /* keep the default mode */ } }
  renameSync(tmp, abs)
  const st = statSync(abs)
  return { ok: true, mtimeMs: st.mtimeMs, size: st.size }
}

export function driveCreateFile(projectId: string | null, dir: string, name: string): string {
  const { folder } = root(projectId)
  const clean = name.trim().replace(/[\\/]+/g, ' ')
  if (!clean || clean === '.' || clean === '..') throw new Error('Give the file a name.')
  const abs = inside(folder, join(dir, clean))
  if (existsSync(abs)) throw new Error(`${clean} already exists here.`)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, '', { encoding: 'utf8', flag: 'wx' })
  return toRel(folder, abs)
}

/** Copies a file or folder next to itself as "name copy.ext" (then "name copy 2.ext"). Returns the new path. */
export function driveDuplicate(projectId: string | null, path: string): string {
  const { folder } = root(projectId)
  const from = inside(folder, path)
  const st = statSync(from)
  const ext = st.isDirectory() ? '' : extname(from)
  const stem = basename(from, ext)
  let to = join(dirname(from), `${stem} copy${ext}`)
  for (let i = 2; existsSync(to); i++) to = join(dirname(from), `${stem} copy ${i}${ext}`)
  inside(folder, toRel(folder, to))
  if (st.isDirectory()) cpSync(from, to, { recursive: true })
  else copyFileSync(from, to)
  return toRel(folder, to)
}

const SEARCH_LIMIT = 500
const SEARCH_FILES = 20000
const SKIP_DIRS = new Set(['.git', 'node_modules'])

/** Find in files: skips .git, node_modules, hidden folders, the app's data, binaries and files over 2 MB; stops at 500 matches. */
export function driveSearch(projectId: string | null, query: string, opts: DriveSearchOptions): DriveSearchResult {
  const { folder } = root(projectId)
  const q = String(query ?? '')
  if (!q) return { files: [], total: 0, truncated: false }
  let re: RegExp
  try {
    re = new RegExp(opts.regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), opts.caseSensitive ? 'g' : 'gi')
  } catch (e) {
    throw new Error(`That isn't a valid regular expression: ${(e as Error).message.replace(/^Invalid regular expression: /, '')}`)
  }
  const files: DriveSearchFile[] = []
  let total = 0
  let seen = 0
  let truncated = false
  const walk = (abs: string, atRoot: boolean): void => {
    let names: string[]
    try { names = readdirSync(abs).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) } catch { return }
    for (const name of names) {
      if (truncated) return
      if (SKIP_DIRS.has(name) || name.startsWith('.') || (atRoot && HIDDEN_DIRS.has(name))) continue
      const p = join(abs, name)
      let st
      try { st = lstatSync(p) } catch { continue }
      if (st.isSymbolicLink()) continue
      if (st.isDirectory()) { walk(p, false); continue }
      if (!st.isFile() || st.size > MAX_EDIT || APP_KINDS.has(kindOf(name, false))) continue
      if (++seen > SEARCH_FILES) { truncated = true; return }
      let buf: Buffer
      try { buf = readFileSync(p) } catch { continue }
      if (isBinary(buf)) continue
      const lines = buf.toString('utf8').split(/\r?\n/)
      const hits: DriveSearchFile['hits'] = []
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        re.lastIndex = 0
        const m = re.exec(line)
        if (!m) continue
        const start = line.length > 240 ? Math.max(0, m.index - 60) : 0
        hits.push({ line: i + 1, col: m.index + 1, length: Math.max(1, m[0].length), text: line.length > 240 ? line.slice(start, m.index + 180) : line, start })
        if (++total >= SEARCH_LIMIT) { truncated = true; break }
      }
      if (hits.length) files.push({ path: toRel(folder, p), hits })
    }
  }
  walk(folder, true)
  return { files, total, truncated }
}

/**
 * Watches the open agency's folder so the tree, git status and open tabs follow agents' (and the terminal's) changes.
 * macOS and Windows watch recursively natively; Linux has no native recursive watch, so each folder gets its own
 * watcher (skipping node_modules, hidden and app folders, up to WATCH_DIRS). Inside .git only HEAD and index count.
 * Events are debounced and sent as one `drive:changed`.
 */
const WATCH_DIRS = 3000
let watching: { projectId: string; folder: string; watchers: Map<string, FSWatcher>; timer: NodeJS.Timeout | null; paths: Set<string>; git: boolean } | null = null

export function driveWatch(projectId: string | null, send: (c: DriveChange) => void): void {
  driveUnwatch()
  const { folder, projectId: id } = root(projectId)
  const w = { projectId: id, folder, watchers: new Map<string, FSWatcher>(), timer: null as NodeJS.Timeout | null, paths: new Set<string>(), git: false }
  watching = w
  const flush = (): void => {
    w.timer = null
    if (watching !== w) return
    const c: DriveChange = { projectId: w.projectId, paths: [...w.paths].slice(0, 200), git: w.git }
    w.paths.clear(); w.git = false
    send(c)
  }
  const bump = (rel: string): void => {
    if (watching !== w) return
    const parts = rel.split(/[\\/]/)
    if (parts[0] === '.git') {
      if (parts.length === 2 && (parts[1] === 'HEAD' || parts[1] === 'index')) w.git = true
      else return
    } else {
      if (parts.includes('node_modules') || parts.some((p) => p.endsWith('.tyslin-tmp'))) return
      w.paths.add(parts.join('/'))
      w.git = true // a file change can change git status too
    }
    if (!w.timer) w.timer = setTimeout(flush, 300)
  }
  const add = (abs: string, recursive: boolean): void => {
    if (w.watchers.has(abs) || w.watchers.size >= WATCH_DIRS) return
    try {
      const fw = watch(abs, { recursive }, (_ev, name) => {
        const rel = toRel(folder, name ? join(abs, name.toString()) : abs)
        bump(rel)
        // Linux: a new folder needs its own watcher.
        if (!recursive && name) {
          const p = join(abs, name.toString())
          try { if (statSync(p).isDirectory() && !skipWatch(basename(p))) walkWatch(p) } catch { /* removed again */ }
        }
      })
      fw.on('error', () => { fw.close(); w.watchers.delete(abs) })
      w.watchers.set(abs, fw)
    } catch { /* unreadable folder: not watched */ }
  }
  const skipWatch = (name: string): boolean => SKIP_DIRS.has(name) || (name.startsWith('.') && name !== '.git')
  const walkWatch = (abs: string): void => {
    add(abs, false)
    let names: string[] = []
    try { names = readdirSync(abs) } catch { return }
    for (const n of names) {
      if (skipWatch(n)) continue
      const p = join(abs, n)
      try { if (lstatSync(p).isDirectory()) walkWatch(p) } catch { /* gone */ }
    }
  }
  if (process.platform === 'linux') walkWatch(folder)
  else add(folder, true)
  const gitDir = join(folder, '.git')
  if (process.platform === 'linux' && existsSync(gitDir)) {
    try {
      if (statSync(gitDir).isDirectory()) {
        const fw = watch(gitDir, (_ev, name) => { if (name) bump(`.git/${name.toString()}`) })
        fw.on('error', () => fw.close())
        w.watchers.set(gitDir, fw)
      }
    } catch { /* no git folder */ }
  }
}

export function driveUnwatch(): void {
  if (!watching) return
  for (const fw of watching.watchers.values()) { try { fw.close() } catch { /* already closed */ } }
  if (watching.timer) clearTimeout(watching.timer)
  watching = null
}
