import { lstatSync, realpathSync } from 'fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'path'

/*
 * Folder confinement with no Electron imports, so it can be tested on its own. Used by drive.ts (and through it
 * git.ts) and by attachmentSave.ts.
 */

/**
 * A path inside the folder ('' = the folder itself); refuses escapes and .git. A symlink inside the folder (or a
 * dangling one) could still lead outside it, so where the path really goes is checked too (same rule as tools.ts).
 * Shared with git.ts, so every path git is given passes the same check.
 */
export function inside(folder: string, rel: string, allowRoot = false): string {
  const abs = resolve(folder, rel || '.')
  const r = relative(folder, abs)
  if ((!r && !allowRoot) || r.startsWith('..') || isAbsolute(r) || r.split(sep).includes('.git')) throw new Error('That path is outside the team folder.')
  let probe = abs
  for (;;) {
    try { lstatSync(probe); break } catch { /* not there yet: check its parent */ }
    const up = dirname(probe)
    if (up === probe) break
    probe = up
  }
  let real: string
  try { real = relative(realpathSync(folder), realpathSync(probe)) } catch { throw new Error('That path is outside the team folder.') }
  if (real.startsWith('..') || isAbsolute(real)) throw new Error('That path is outside the team folder.')
  return abs
}
