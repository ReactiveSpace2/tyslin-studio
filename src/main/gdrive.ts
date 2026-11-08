import { createHash, randomBytes } from 'crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs'
import { dirname, extname, join, relative, sep } from 'path'
import type { GDriveStatus, Project } from '@shared/types'
import * as db from './db'
import { authStatus, driveAccessToken, driveConnected } from './auth'

/**
 * Google Drive sync: every project folder of the current organization is mirrored, both ways, to
 * "Tyslin Studio/<organization>/<project>" in the user's Drive. Only the drive.file scope is used, so
 * Tyslin sees nothing in Drive except what it created.
 *
 * Per file the last synced md5 is kept (gsync_files). Compared with the local and Drive copies:
 * only one side changed → copy it over; both changed → keep both (the Drive copy is saved next to the
 * local file as "name (Google Drive).ext"); deleted on one side and unchanged on the other → delete on
 * the other side (Drive: to its trash; local: into the project's .tyslin-trash folder).
 * Hidden files and folders, node_modules and files over 100 MB are not synced.
 */

const FOLDER = 'application/vnd.google-apps.folder'
const MAX_SIZE = 100 * 1024 * 1024
const SIMPLE_LIMIT = 5 * 1024 * 1024
const AUTO_MINUTES = 5
const TRASH = '.tyslin-trash'

const api = (): string => (process.env.TYSLIN_GDRIVE_API || 'https://www.googleapis.com').replace(/\/$/, '')
const md5 = (buf: Buffer): string => createHash('md5').update(buf).digest('hex')
const q = (s: string): string => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

interface Remote { id: string; name: string; mimeType: string; md5Checksum?: string; size?: string }

async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const token = await driveAccessToken()
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string>) }
  let body = init.body
  if (init.json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(init.json) }
  const res = await fetch(api() + path, { ...init, headers, body })
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300)
    if (res.status === 403 && /accessNotConfigured|has not been used|disabled/i.test(text)) throw new Error('The Google Drive API is not enabled for this app yet.')
    throw Object.assign(new Error(`Google Drive ${res.status}: ${text}`), { status: res.status })
  }
  const type = res.headers.get('content-type') ?? ''
  return (type.includes('json') ? await res.json() : await res.arrayBuffer()) as T
}

async function list(query: string): Promise<Remote[]> {
  const out: Remote[] = []
  let pageToken = ''
  do {
    const r = await call<{ files: Remote[]; nextPageToken?: string }>(`/drive/v3/files?${new URLSearchParams({
      q: query, fields: 'nextPageToken,files(id,name,mimeType,md5Checksum,size)', pageSize: '1000', spaces: 'drive', ...(pageToken ? { pageToken } : {})
    })}`)
    out.push(...r.files)
    pageToken = r.nextPageToken ?? ''
  } while (pageToken)
  return out
}

async function exists(id: string): Promise<boolean> {
  try {
    const r = await call<{ trashed?: boolean }>(`/drive/v3/files/${encodeURIComponent(id)}?fields=id,trashed`)
    return !r.trashed
  } catch (e) {
    if ((e as { status?: number }).status === 404) return false
    throw e
  }
}

async function folder(name: string, parent: string): Promise<string> {
  const found = await list(`name = '${q(name)}' and mimeType = '${FOLDER}' and '${parent}' in parents and trashed = false`)
  if (found[0]) return found[0].id
  return (await call<{ id: string }>('/drive/v3/files?fields=id', { method: 'POST', json: { name, mimeType: FOLDER, parents: [parent] } })).id
}

/** Every file and folder under a Drive folder, by path relative to it. */
async function tree(rootId: string): Promise<{ files: Map<string, Remote>; folders: Map<string, string> }> {
  const files = new Map<string, Remote>()
  const folders = new Map<string, string>([['', rootId]])
  const queue: [string, string][] = [['', rootId]]
  while (queue.length) {
    const [rel, id] = queue.shift()!
    for (const f of await list(`'${id}' in parents and trashed = false`)) {
      const path = rel ? `${rel}/${f.name}` : f.name
      if (f.mimeType === FOLDER) { folders.set(path, f.id); queue.push([path, f.id]) }
      else if (!f.mimeType.startsWith('application/vnd.google-apps.') && !f.name.startsWith('.')) files.set(path, f)
    }
  }
  return { files, folders }
}

async function upload(data: Buffer, name: string, parent: string, existingId?: string): Promise<Remote> {
  const fields = 'id,name,mimeType,md5Checksum,size'
  const meta = existingId ? {} : { name, parents: [parent] }
  const base = existingId ? `/upload/drive/v3/files/${encodeURIComponent(existingId)}` : '/upload/drive/v3/files'
  const method = existingId ? 'PATCH' : 'POST'
  if (data.length <= SIMPLE_LIMIT) {
    const boundary = 'tyslin' + randomBytes(8).toString('hex')
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
      data, Buffer.from(`\r\n--${boundary}--`)
    ])
    return call<Remote>(`${base}?uploadType=multipart&fields=${fields}`, { method, body: new Uint8Array(body), headers: { 'Content-Type': `multipart/related; boundary=${boundary}` } })
  }
  // Large files: a resumable session, sent in one go.
  const token = await driveAccessToken()
  const start = await fetch(`${api()}${base}?uploadType=resumable&fields=${fields}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Upload-Content-Length': String(data.length) }, body: JSON.stringify(meta)
  })
  const session = start.headers.get('location')
  if (!start.ok || !session) throw new Error(`Google Drive upload could not start (${start.status}).`)
  const res = await fetch(session, { method: 'PUT', headers: { 'Content-Length': String(data.length) }, body: new Uint8Array(data) })
  if (!res.ok) throw new Error(`Google Drive upload failed (${res.status}).`)
  return (await res.json()) as Remote
}

const download = async (id: string): Promise<Buffer> => Buffer.from(await call<ArrayBuffer>(`/drive/v3/files/${encodeURIComponent(id)}?alt=media`))
const trash = (id: string): Promise<unknown> => call(`/drive/v3/files/${encodeURIComponent(id)}?fields=id`, { method: 'PATCH', json: { trashed: true } })

interface Local { abs: string; size: number; mtime: number }

/** Files in the project folder that sync (no hidden files or folders, no node_modules, nothing over 100 MB). */
function scan(root: string): { files: Map<string, Local>; skipped: Set<string> } {
  const files = new Map<string, Local>()
  const skipped = new Set<string>()
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.') || name === 'node_modules') continue
      const abs = join(dir, name)
      let st
      try { st = statSync(abs) } catch { continue }
      if (st.isDirectory()) walk(abs)
      else if (st.isFile()) {
        const rel = relative(root, abs).split(sep).join('/')
        if (st.size > MAX_SIZE) { skipped.add(rel); continue }
        files.set(rel, { abs, size: st.size, mtime: st.mtimeMs })
      }
    }
  }
  walk(root)
  return { files, skipped }
}

/** Moves a local file into the project's .tyslin-trash folder instead of deleting it. */
function trashLocal(root: string, rel: string): void {
  const from = join(root, rel)
  const d = new Date()
  const p2 = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}-${p2(d.getMinutes())}-${p2(d.getSeconds())}`
  const to = join(root, TRASH, `${stamp} ${rel.split('/').join(' - ')}`)
  mkdirSync(dirname(to), { recursive: true })
  renameSync(from, to)
}

/** "name (Google Drive).ext", or "name (Google Drive 2).ext" and so on when an earlier conflict copy is there. */
const conflictName = (root: string, rel: string): string => {
  const ext = extname(rel)
  const stem = rel.slice(0, rel.length - ext.length)
  let name = `${stem} (Google Drive)${ext}`
  for (let i = 2; existsSync(join(root, name)); i++) name = `${stem} (Google Drive ${i})${ext}`
  return name
}

let syncing: string | null = null
let lastError = ''
let lastRun: number | null = null
let emit: (s: GDriveStatus) => void = () => {}

export function initGDrive(onStatus: (s: GDriveStatus) => void): void {
  emit = onStatus
  // Automatic sync while the app is open.
  setTimeout(() => void autoSync(), 20_000)
  setInterval(() => void autoSync(), AUTO_MINUTES * 60_000)
}

async function autoSync(): Promise<void> {
  if (!driveConnected() || db.getSetting('gdrive:auto') === '0' || syncing) return
  try { await syncAll() } catch { /* recorded in the status */ }
}

export function gdriveStatus(): GDriveStatus {
  const projects = db.listProjects().filter((p) => p.folder).map((p) => {
    const s = db.gsyncProject(p.id)
    return { id: p.id, name: p.name, lastSync: s.lastSync, files: s.files, error: s.lastError }
  })
  const orgFolder = db.getSetting('gsync:orgFolder')
  return {
    configured: authStatus().configured,
    connected: driveConnected(),
    email: db.getSetting('gdrive:account') || '',
    auto: db.getSetting('gdrive:auto') !== '0',
    autoMinutes: AUTO_MINUTES,
    syncing: !!syncing,
    current: syncing ?? undefined,
    lastSync: lastRun,
    lastError,
    folderUrl: orgFolder ? `https://drive.google.com/drive/folders/${orgFolder}` : '',
    projects
  }
}

/** The organization's Drive folder ("Tyslin Studio/<organization>"), made if missing. */
async function orgFolder(): Promise<string> {
  let root = db.getSetting('gdrive:root')
  if (!root || !(await exists(root))) { root = await folder('Tyslin Studio', 'root'); db.setSetting('gdrive:root', root) }
  let org = db.getSetting('gsync:orgFolder')
  if (!org || !(await exists(org))) { org = await folder(db.currentOrg().name, root); db.setSetting('gsync:orgFolder', org) }
  return org
}

export async function syncAll(): Promise<GDriveStatus> {
  if (!driveConnected()) throw new Error('Connect Google Drive first.')
  if (syncing) return gdriveStatus()
  syncing = 'Starting'
  lastError = ''
  emit(gdriveStatus())
  try {
    const parent = await orgFolder()
    for (const p of db.listProjects().filter((x) => x.folder && existsSync(x.folder))) {
      syncing = p.name
      emit(gdriveStatus())
      try {
        const files = await syncProject(p, parent)
        db.gsyncSetProject({ ...db.gsyncProject(p.id), lastSync: Date.now(), lastError: '', files })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        db.gsyncSetProject({ ...db.gsyncProject(p.id), lastError: msg })
        lastError = `${p.name}: ${msg}`
        if (/not connected|access has ended|not enabled/i.test(msg)) break
      }
    }
    lastRun = Date.now()
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e)
  } finally {
    syncing = null
    emit(gdriveStatus())
  }
  return gdriveStatus()
}

/** Two-way sync of one project. Returns how many files are in sync afterwards. */
async function syncProject(p: Project, parent: string): Promise<number> {
  const root = p.folder!
  const state = db.gsyncProject(p.id)
  let folderId = state.folderId
  if (!folderId || !(await exists(folderId))) {
    // New (or replaced) Drive folder: nothing there was synced before, so start the file state afresh.
    // Projects with the same name get their own folders ("Name", "Name (2)", ...).
    const taken = new Set(db.listProjects().filter((x) => x.id !== p.id).map((x) => db.gsyncProject(x.id).folderId).filter(Boolean))
    let name = p.name
    folderId = await folder(name, parent)
    for (let i = 2; taken.has(folderId); i++) { name = `${p.name} (${i})`; folderId = await folder(name, parent) }
    for (const path of db.gsyncFiles(p.id).keys()) db.gsyncSetFile(p.id, { path, remove: true })
    db.gsyncSetProject({ ...state, folderId })
  }
  let base = db.gsyncFiles(p.id)
  const { files: local, skipped: tooLarge } = scan(root)
  const remote = await tree(folderId)
  // Safety: an emptied side never deletes the other side's files.
  if (base.size && !remote.files.size) { for (const path of base.keys()) db.gsyncSetFile(p.id, { path, remove: true }); base = new Map() }
  if (base.size && !local.size) throw new Error('The project folder is empty, so nothing was deleted from Google Drive. Check the folder, then sync again.')

  const folderFor = async (rel: string): Promise<string> => {
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
    if (remote.folders.has(dir)) return remote.folders.get(dir)!
    let cur = ''
    let id = folderId!
    for (const part of dir.split('/')) {
      cur = cur ? `${cur}/${part}` : part
      if (!remote.folders.has(cur)) remote.folders.set(cur, await folder(part, id))
      id = remote.folders.get(cur)!
    }
    return id
  }
  const localMd5 = (rel: string, l: Local): string => {
    const b = base.get(rel)
    // Unchanged size and time: trust the last hash instead of reading the file again.
    return b && b.size === l.size && b.mtime === l.mtime ? b.md5 : md5(readFileSync(l.abs))
  }
  const record = (rel: string, hash: string, remoteId: string): void => {
    const st = statSync(join(root, rel))
    db.gsyncSetFile(p.id, { path: rel, md5: hash, size: st.size, mtime: st.mtimeMs, remoteId })
  }
  const pull = async (rel: string, r: Remote, to = rel): Promise<void> => {
    const data = await download(r.id)
    const abs = join(root, to)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, data)
    if (to === rel) record(rel, r.md5Checksum ?? md5(data), r.id)
  }
  const push = async (rel: string, l: Local, existing?: Remote): Promise<void> => {
    const data = readFileSync(l.abs)
    const r = await upload(data, rel.split('/').pop()!, await folderFor(rel), existing?.id)
    record(rel, r.md5Checksum ?? md5(data), r.id)
  }

  const paths = new Set([...local.keys(), ...remote.files.keys(), ...base.keys()])
  let inSync = 0
  for (const rel of paths) {
    // Still here but now over 100 MB: not synced, and not a deletion either (the Drive copy stays as it is).
    if (tooLarge.has(rel)) continue
    const l = local.get(rel)
    const r = remote.files.get(rel)
    const b = base.get(rel)
    const L = l ? localMd5(rel, l) : null
    const R = r ? r.md5Checksum ?? null : null
    if (l && r && L === R) { record(rel, L!, r.id); inSync++; continue }
    if (!l && !r) { db.gsyncSetFile(p.id, { path: rel, remove: true }); continue }
    if (l && !r) {
      if (b && L === b.md5) { trashLocal(root, rel); db.gsyncSetFile(p.id, { path: rel, remove: true }) } // deleted in Drive
      else { await push(rel, l); inSync++ } // new here, or changed here after being deleted in Drive
      continue
    }
    if (!l && r) {
      if (b && R === b.md5) { await trash(r.id); db.gsyncSetFile(p.id, { path: rel, remove: true }) } // deleted here
      else { await pull(rel, r); inSync++ }
      continue
    }
    // Both sides exist and differ.
    if (b && L === b.md5) { await pull(rel, r!); inSync++ } // changed in Drive
    else if (b && R === b.md5) { await push(rel, l!, r); inSync++ } // changed here
    else {
      // Changed on both sides (or never synced): keep both. The Drive copy lands beside the local file,
      // which then replaces the Drive version; the copy uploads on the next sync.
      await pull(rel, r!, conflictName(root, rel))
      await push(rel, l!, r)
      inSync++
    }
  }
  return inSync
}

export function setAutoSync(on: boolean): GDriveStatus {
  db.setSetting('gdrive:auto', on ? '1' : '0')
  return gdriveStatus()
}

export function resetSyncState(): void {
  db.gsyncReset()
  db.setSetting('gsync:orgFolder', '')
  db.setSetting('gdrive:root', '')
  lastRun = null
  lastError = ''
}
