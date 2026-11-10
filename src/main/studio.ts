import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import type { Project, StudioFile, StudioKind } from '@shared/types'
import * as db from './db'

/**
 * Plain files inside a project folder: the agency board (`boards/*.board.json`) and the folder helpers
 * (`newProjectFolderPath`, the Default project that first-run setup still names). With no project chosen
 * they go to the organization's Default project (a real folder under Documents). These are the app's own
 * files, not agent edits, so they skip the diff review.
 */

const KINDS: Record<StudioKind, { dir: string; ext: string }> = {
  mindmap: { dir: 'mindmaps', ext: '.mindmap.json' },
  automation: { dir: 'automations', ext: '.automation.json' },
  run: { dir: join('automations', 'runs'), ext: '.md' },
  canvas: { dir: 'canvas', ext: '.canvas.json' },
  board: { dir: 'boards', ext: '.board.json' },
  document: { dir: 'documents', ext: '.md' },
  svg: { dir: 'exports', ext: '.svg' },
  png: { dir: 'exports', ext: '.png' }
}

const safeName = (s: string): string => s.replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled'

/** The current organization's Default project, created with its folder the first time it's needed. */
export function defaultProject(): Project {
  const id = db.getSetting('project:default')
  const existing = id ? db.getProject(id) : null
  if (existing?.folder) {
    mkdirSync(existing.folder, { recursive: true })
    return existing
  }
  return createDefault('Default project')
}

function createDefault(name: string): Project {
  const org = db.currentOrg()
  const folder = join(app.getPath('documents'), 'Tyslin Studio', safeName(org.name), safeName(name))
  mkdirSync(folder, { recursive: true })
  const p = db.createProject(safeName(name), folder)
  db.setSetting('project:default', p.id)
  return p
}

/** Where a new agency's own folder would go under Documents/Tyslin Studio/<org>/ ("Name", or "Name 2" when taken). */
export function newProjectFolderPath(name: string): string {
  const base = join(app.getPath('documents'), 'Tyslin Studio', safeName(db.currentOrg().name))
  let folderName = safeName(name || 'New project')
  for (let i = 2; existsSync(join(base, folderName)); i++) folderName = `${safeName(name || 'New project')} ${i}`
  return join(base, folderName)
}

/** The Default project's folder, or null when it hasn't been created yet. */
export function defaultProjectFolder(): string | null {
  const id = db.getSetting('project:default')
  return (id ? db.getProject(id)?.folder : null) ?? null
}

/** The Default project's name ("Default project" until it is named). */
export function defaultProjectName(): string {
  const id = db.getSetting('project:default')
  return (id ? db.getProject(id)?.name : null) ?? 'Default project'
}

/**
 * Names the Default project (onboarding). Not created yet: it is created now, with a folder of that name.
 * Already there: only the name changes; its folder and files stay where they are.
 */
export function setDefaultProjectName(name: string): Project {
  const id = db.getSetting('project:default')
  const existing = id ? db.getProject(id) : null
  if (existing?.folder) {
    db.renameProject(existing.id, safeName(name))
    return db.getProject(existing.id)!
  }
  return createDefault(name)
}

/** The project to use: the chosen one (it must have a folder), or the Default project. */
export function projectFor(projectId: string | null): Project {
  if (!projectId) return defaultProject()
  const p = db.getProject(projectId)
  if (!p) throw new Error('That project no longer exists.')
  if (!p.folder) throw new Error(`${p.name} has no folder linked, so its files can't be saved. Pick a project with a folder, or the Default project.`)
  return p
}

/** Resolves a path inside the project folder; refuses anything outside it. */
function inside(folder: string, rel: string): string {
  const abs = resolve(folder, rel)
  const r = relative(folder, abs)
  if (!r || r.startsWith('..') || isAbsolute(r) || r.split(sep).includes('.git')) throw new Error('That path is outside the project folder.')
  return abs
}

export function readStudioFile(projectId: string | null, path: string): string {
  return readFileSync(inside(projectFor(projectId).folder!, path), 'utf8')
}

/** Writes a file; with `name` instead of a path, picks a free file name for that kind. */
/** Saves text, or binary data given as base64 (PNG exports). */
export function writeStudioFile(projectId: string | null, target: { path?: string; kind?: StudioKind; name?: string }, content: string, encoding: 'utf8' | 'base64' = 'utf8'): StudioFile {
  const project = projectFor(projectId)
  let rel = target.path
  if (!rel) {
    const { dir, ext } = KINDS[target.kind ?? 'canvas']
    const base = safeName(target.name ?? 'Untitled')
    rel = join(dir, base + ext)
    for (let i = 2; existsSync(join(project.folder!, rel)); i++) rel = join(dir, `${base} ${i}${ext}`)
  }
  const abs = inside(project.folder!, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, encoding === 'base64' ? Buffer.from(content, 'base64') : content, encoding === 'base64' ? undefined : 'utf8')
  const name = rel.split(/[\\/]/).pop()!
  const ext = Object.values(KINDS).find((k) => name.endsWith(k.ext))?.ext ?? ''
  return { name: name.slice(0, name.length - ext.length), path: rel.split(sep).join('/'), updatedAt: Date.now() }
}
