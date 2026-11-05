import { dialog, shell, type BrowserWindow } from 'electron'
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'fs'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'path'
import type { DriveEntry, DriveKind, DriveListing, DrivePreview } from '@shared/types'
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

function root(projectId: string | null): { folder: string; projectId: string } {
  const p = projectFor(projectId)
  return { folder: p.folder!, projectId: p.id }
}

/** A path inside the folder ('' = the folder itself); refuses escapes and .git. */
function inside(folder: string, rel: string, allowRoot = false): string {
  const abs = resolve(folder, rel || '.')
  const r = relative(folder, abs)
  if ((!r && !allowRoot) || r.startsWith('..') || isAbsolute(r) || r.split(sep).includes('.git')) throw new Error('That path is outside the project folder.')
  return abs
}

const toRel = (folder: string, abs: string): string => relative(folder, abs).split(sep).join('/')

const ARCHIVE = new Set(['.zip', '.tar', '.gz', '.tgz', '.7z', '.rar', '.bz2', '.xz'])
/** App data: shown in Kanban, Mind mapper, Canvas and Automation, not in Drive (unless hidden files are shown). */
const APP_KINDS = new Set<DriveKind>(['mindmap', 'board', 'automation', 'canvas'])
const APP_DIRS = new Set(['boards', 'mindmaps', 'canvas', 'automations', 'workflows'])

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
    if (!showHidden && atRoot && APP_DIRS.has(name)) continue
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
  const buf = readFileSync(abs, { flag: 'r' }).subarray(0, MAX_TEXT)
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

export function driveRemove(projectId: string | null, path: string): void {
  const { folder } = root(projectId)
  rmSync(inside(folder, path), { recursive: true, force: true })
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
