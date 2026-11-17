import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Agency } from '@shared/types'
import { templatePages } from '@shared/agencies'
import { DESIGN_BOARD_FILE, DESIGN_EXPORTS_DIR, DESIGN_MANIFEST, designExport, parseDesignBoard, type DesignExport } from '@shared/pages'
import * as db from './db'
import { inside } from './confine'
import { renderArtboard } from './preview'
import { shareDesign } from './assets'

/**
 * Pictures of the Design board for other teams (owner, 17 Nov 2026): after a designer's card and after the boss's
 * hand edits, every artboard whose file (or design/styles.css) changed since its last picture is drawn offscreen and
 * saved as design/exports/<name>.png and .jpg, and design/exports/designs.json lists them all. The web team builds
 * from them, the social team posts them, and nobody has to open the board. Written by Tyslin, not the designer.
 */

const mtime = (abs: string): number => { try { return statSync(abs).mtimeMs } catch { return 0 } }

const writeAtomic = (abs: string, data: Buffer | string): void => {
  const tmp = `${abs}.${process.pid}.tmp`
  writeFileSync(tmp, data)
  renameSync(tmp, abs)
}

/** One export at a time per team, so a card's export and the boss's edits don't draw the same artboard twice at once. */
const queue = new Map<string, Promise<number>>()

/** The team's folder when it has a Design board, else null. */
function boardFolder(agency: Agency): string | null {
  if (!templatePages(agency.templateId).some((p) => p.kind === 'design')) return null
  const folder = db.getProject(agency.projectId)?.folder
  return folder && existsSync(join(folder, DESIGN_BOARD_FILE)) ? folder : null
}

/** Saves the changed artboards (all of them with `force`, or only `files`); returns how many pictures were made. */
export function exportDesigns(agency: Agency, opts: { files?: string[]; force?: boolean } = {}): Promise<number> {
  const prev = queue.get(agency.id) ?? Promise.resolve(0)
  const next = prev.catch(() => 0).then(() => run(agency, opts))
  queue.set(agency.id, next)
  return next
}

async function run(agency: Agency, opts: { files?: string[]; force?: boolean }): Promise<number> {
  const folder = boardFolder(agency)
  if (!folder) return 0
  const doc = parseDesignBoard(readFileSync(join(folder, DESIGN_BOARD_FILE), 'utf8'))
  const outDir = inside(folder, DESIGN_EXPORTS_DIR)
  mkdirSync(outDir, { recursive: true })
  const styles = mtime(join(folder, 'design', 'styles.css'))
  const entries: DesignExport[] = []
  let made = 0
  for (const a of doc.artboards) {
    let src: string
    try { src = inside(folder, a.file) } catch { continue }
    if (!existsSync(src)) continue
    const changed = Math.max(mtime(src), styles)
    const e = designExport(a, changed)
    const png = inside(folder, e.png), jpg = inside(folder, e.jpg)
    const wanted = opts.files ? opts.files.includes(a.file) : true
    const stale = opts.force || mtime(png) < changed || mtime(jpg) < changed
    if (wanted && stale) {
      try {
        const img = await renderArtboard(agency.projectId, a.file, a.width, a.height)
        writeAtomic(png, img.toPNG())
        writeAtomic(jpg, img.toJPEG(90))
        made++
      } catch (err) {
        console.warn(`[design] ${agency.name}: could not save ${a.file}:`, err)
        continue
      }
    }
    if (existsSync(png)) {
      entries.push(e)
      // Every finished artboard is also in the project's shared Assets folder (owner, 18 Nov 2026).
      shareDesign(png, agency, e.title)
    }
  }
  writeAtomic(inside(folder, DESIGN_MANIFEST), JSON.stringify({ team: agency.name, updatedAt: Date.now(), designs: entries }, null, 2) + '\n')
  return made
}

/** The designs other teams can use: every Design board team's manifest in this project, with absolute paths. */
export function designsForOtherTeams(except: Agency | null): { team: string; folder: string; designs: DesignExport[] }[] {
  const out: { team: string; folder: string; designs: DesignExport[] }[] = []
  for (const a of db.listAgencies()) {
    if (except && a.id === except.id) continue
    const folder = boardFolder(a)
    if (!folder) continue
    try {
      const m = JSON.parse(readFileSync(join(folder, DESIGN_MANIFEST), 'utf8')) as { designs?: DesignExport[] }
      const designs = (m.designs ?? []).filter((d) => d && typeof d.png === 'string' && existsSync(join(folder, d.png)))
      if (designs.length) out.push({ team: a.name, folder, designs })
    } catch { /* no pictures yet */ }
  }
  return out
}

/** Every Design board team's design/ folder: other teams' agents may read these (tools.ts setExtraReadDirs). */
export const designReadDirs = (): string[] => db.listAgencies().map(boardFolder).filter((f): f is string => !!f).map((f) => join(f, 'design'))

/** The "## Designs" section for agents in other teams ('' when there are no pictures yet). */
export function designsPrompt(agency: Agency | null): string {
  const teams = designsForOtherTeams(agency)
  if (!teams.length) return ''
  const lines = ['## Designs from the Design team', 'Finished artboards from this project\'s Design team, saved as pictures. You may read these files (never change them): look at a picture to build a page that matches it, read the artboard\'s HTML and design/styles.css for exact colours, fonts and copy, or use the picture as the post image. When the work needs the picture inside this team\'s folder, say so in your result and the boss attaches it.']
  for (const t of teams) {
    lines.push(`${t.team} (list: ${join(t.folder, DESIGN_MANIFEST)}):`)
    for (const d of t.designs.slice(0, 30)) lines.push(`- ${d.title} (${d.use}, ${d.width} x ${d.height}): ${join(t.folder, d.png)} · ${join(t.folder, d.jpg)} · source ${join(t.folder, d.source)}`)
    if (t.designs.length > 30) lines.push(`- and ${t.designs.length - 30} more in the list`)
  }
  return lines.join('\n')
}
