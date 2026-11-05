import { app, shell } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import type { Project, StudioFile, StudioKind } from '@shared/types'
import * as db from './db'

/**
 * Files made on the Mind mapper, Workflows and Canvas screens. They are ordinary files in the
 * project's folder, so they can be read, edited and committed outside Tyslin. With no project
 * chosen they go to the organization's Default project (a real folder under Documents).
 * These are the user's own documents saved by the app, not agent edits, so they skip the diff review.
 */

const KINDS: Record<StudioKind, { dir: string; ext: string }> = {
  mindmap: { dir: 'mindmaps', ext: '.mindmap.json' },
  workflow: { dir: 'workflows', ext: '.workflow.json' },
  run: { dir: join('workflows', 'runs'), ext: '.md' },
  canvas: { dir: 'canvas', ext: '.md' }
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
  const org = db.currentOrg()
  const folder = join(app.getPath('documents'), 'Tyslin Studio', safeName(org.name), 'Default project')
  mkdirSync(folder, { recursive: true })
  const p = db.createProject('Default project', folder)
  db.setSetting('project:default', p.id)
  return p
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

export function listStudioFiles(kind: StudioKind, projectId: string | null): { project: Project; files: StudioFile[] } {
  const project = projectFor(projectId)
  const { dir, ext } = KINDS[kind]
  const abs = join(project.folder!, dir)
  let files: StudioFile[] = []
  try {
    files = readdirSync(abs)
      .filter((f) => f.endsWith(ext))
      .map((f) => {
        const st = statSync(join(abs, f))
        return { name: f.slice(0, -ext.length), path: join(dir, f).split(sep).join('/'), updatedAt: st.mtimeMs }
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
  } catch { /* folder not made yet */ }
  return { project, files }
}

export function readStudioFile(projectId: string | null, path: string): string {
  return readFileSync(inside(projectFor(projectId).folder!, path), 'utf8')
}

/** Writes a file; with `name` instead of a path, picks a free file name for that kind. */
export function writeStudioFile(projectId: string | null, target: { path?: string; kind?: StudioKind; name?: string }, content: string): StudioFile {
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
  writeFileSync(abs, content, 'utf8')
  const name = rel.split(/[\\/]/).pop()!
  const ext = Object.values(KINDS).find((k) => name.endsWith(k.ext))?.ext ?? ''
  return { name: name.slice(0, name.length - ext.length), path: rel.split(sep).join('/'), updatedAt: Date.now() }
}

export function removeStudioFile(projectId: string | null, path: string): void {
  rmSync(inside(projectFor(projectId).folder!, path), { force: true })
}

export function revealStudioFile(projectId: string | null, path?: string): void {
  const folder = projectFor(projectId).folder!
  if (path) shell.showItemInFolder(inside(folder, path))
  else void shell.openPath(folder)
}
