import { app, session, shell } from 'electron'
import { existsSync, mkdirSync, renameSync, rmSync } from 'fs'
import { join, relative, isAbsolute, dirname, basename } from 'path'
import * as db from './db'

/**
 * "Reset Tyslin Studio" (Settings → About). Afterwards the app starts like a fresh install: sign-in, setup,
 * the built-in agents and the Engineering team in a new Default project.
 *
 * - App data on this computer is deleted: every organization's database (agents, teams, projects, chats,
 *   tasks, skills, keys, settings) and chat attachments.
 * - Files are moved to the system Trash, never deleted: the whole Documents/Tyslin Studio folder, and inside
 *   folders the user linked as projects, only Tyslin's own folders (boards, mind maps, Canvas, automations,
 *   documents, exports). Everything else in a linked folder stays.
 */
/** True from the moment a reset starts; the scheduler checks it. */
export let resetting = false

const STUDIO_DIRS = ['memory', 'boards', 'mindmaps', 'canvas', 'automations', 'workflows', 'documents', 'exports', '.tyslin-trash']

const inside = (parent: string, child: string): boolean => {
  const r = relative(parent, child)
  return !!r && !r.startsWith('..') && !isAbsolute(r)
}

/** Moves to the system Trash; where there is none, renames it aside so a fresh start doesn't pick it up. */
async function toTrash(path: string): Promise<void> {
  if (!existsSync(path)) return
  try {
    await shell.trashItem(path)
  } catch {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
    const aside = join(dirname(path), `${basename(path)} (before reset ${stamp})`)
    try { renameSync(path, aside) } catch { /* left in place */ }
  }
}

export async function resetEverything(stopWork: () => void): Promise<void> {
  const studioBase = join(app.getPath('documents'), 'Tyslin Studio')
  const folders = db.allProjectFolders()
  stopWork()
  resetting = true
  // Timers (scheduler, Drive sync) may still fire before the restart; the database is gone, so ignore them.
  process.on('uncaughtException', () => {})
  process.on('unhandledRejection', () => {})
  db.closeAll()

  await toTrash(studioBase)
  for (const f of folders) {
    if (f === studioBase || inside(studioBase, f) || !existsSync(f)) continue
    for (const d of STUDIO_DIRS) await toTrash(join(f, d))
  }

  const data = app.getPath('userData')
  for (const name of ['tyslin.db', 'tyslin.db-wal', 'tyslin.db-shm', 'orgs', 'attachments']) {
    rmSync(join(data, name), { recursive: true, force: true })
  }
  mkdirSync(data, { recursive: true })
  // Per-window memory (the remembered project, the last tab) goes too.
  await session.defaultSession.clearStorageData({ storages: ['localstorage', 'indexdb', 'cachestorage'] })

  app.relaunch()
  app.exit(0)
}
