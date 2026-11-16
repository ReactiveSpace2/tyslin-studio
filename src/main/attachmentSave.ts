import { randomUUID } from 'crypto'
import { copyFileSync, lstatSync, mkdirSync, readFileSync, renameSync, statSync } from 'fs'
import { basename, extname, join } from 'path'
import { inside } from './confine'

/** Attached files are also saved into the project folder here, so workers can use them (owner, 14 Nov 2026). */
export const ATTACH_DIR = 'attachments'
/** Larger files stay where they are; the agent still gets their text (if any) in the message. */
const MAX_SAVE_BYTES = 50 * 1024 * 1024

/**
 * Copies an attached file into `<folder>/attachments/`, written directly (it is the user's own file, so no review).
 * The same file sent again reuses its copy; a different file with the same name gets "name-2.ext".
 * Returns the path relative to the folder, or null when it wasn't saved.
 * No Electron imports, so it can be tested on its own (tests/attachmentSave.test.ts).
 *
 * Confinement (16 Nov 2026 QA): `attachments/` (or anything above it) could be a symlink to another folder, which
 * wrote the copy outside the team folder while the context still said `saved="attachments/…"`. The folder is checked
 * with drive.ts's rule (`confine.ts inside`, realpath included) before and after it is created, and a name that is
 * already a symlink is skipped rather than read or replaced.
 */
export function saveIntoFolder(src: string, name: string, folder: string): string | null {
  try {
    const size = statSync(src).size
    if (size > MAX_SAVE_BYTES) return null
    const dir = inside(folder, ATTACH_DIR)
    mkdirSync(dir, { recursive: true })
    inside(folder, ATTACH_DIR)
    if (!lstatSync(dir).isDirectory()) return null
    const safe = basename(name).replace(/[\\/:*?"<>|\x00-\x1f]/g, '-') || 'file'
    const ext = extname(safe)
    const stem = safe.slice(0, safe.length - ext.length)
    const bytes = readFileSync(src)
    for (let n = 1; n < 100; n++) {
      const file = n === 1 ? safe : `${stem}-${n}${ext}`
      const dest = join(dir, file)
      let taken: ReturnType<typeof lstatSync> | null = null
      try { taken = lstatSync(dest) } catch { /* free */ }
      if (taken) {
        if (taken.isFile()) {
          try { if (readFileSync(dest).equals(bytes)) return `${ATTACH_DIR}/${file}` } catch { /* try the next name */ }
        }
        continue
      }
      const tmp = join(dir, `.${file}.${randomUUID()}.tmp`)
      copyFileSync(src, tmp)
      renameSync(tmp, dest)
      return `${ATTACH_DIR}/${file}`
    }
  } catch { /* unreadable, outside the folder, or the folder isn't writable: the message still goes, without the copy */ }
  return null
}
