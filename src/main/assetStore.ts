import { randomUUID } from 'crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'fs'
import { dirname, extname, join, relative, resolve, sep } from 'path'

/**
 * The project's shared Assets folder (owner, 18 Nov 2026: "in one project copy all images to the Assets folder, shared
 * across all agent teams"): Documents/Tyslin Studio/<project>/Assets. Every picture a team uses lands here (Unsplash
 * picks, pictures the boss attaches, the Design team's exports), with who made it in credits.json. Every team's
 * agents may read it, and the preview serves it at /__assets__/ so any team's pages and artboards can show it.
 * No Electron imports: the pictures tool process (picturesMcp.ts) and the tests use this too.
 */
export const ASSETS_DIRNAME = 'Assets'
export const CREDITS_FILE = 'credits.json'
/** The preview path that serves the shared Assets folder (preview.ts). */
export const ASSETS_URL_PREFIX = '__assets__/'
export const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif'])
const MAX_BYTES = 50 * 1024 * 1024

export type AssetCredit = {
  /** Path inside Assets, with forward slashes. */
  file: string
  source: 'unsplash' | 'attachment' | 'design' | 'other'
  title?: string
  /** Who made it, and the link the credit points to. */
  author?: string
  authorUrl?: string
  /** Where it came from (the photo's page on Unsplash), and the address to show it from when the source asks for that. */
  pageUrl?: string
  hotlinkUrl?: string
  /** The credit line to put next to it on a page, as HTML; empty when none is needed. */
  creditHtml?: string
  /** The team that brought it in. */
  team?: string
  addedAt: number
}

const writeAtomic = (abs: string, data: Buffer | string): void => {
  const tmp = `${abs}.${randomUUID()}.tmp`
  writeFileSync(tmp, data)
  renameSync(tmp, abs)
}

/** A path inside the Assets folder, or throws (no `..`, no absolute paths, no symlinked folders on the way). */
export function insideAssets(assetsDir: string, rel: string): string {
  const abs = resolve(assetsDir, rel)
  const r = relative(assetsDir, abs)
  if (!r || r.startsWith('..') || r.startsWith(sep) || resolve(assetsDir, r) !== abs) throw new Error('Outside the Assets folder')
  let cur = assetsDir
  for (const part of r.split(sep).slice(0, -1)) {
    cur = join(cur, part)
    try { if (lstatSync(cur).isSymbolicLink()) throw new Error('Outside the Assets folder') } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
  }
  return abs
}

/** A file name that is safe on every system. */
export function safeFileName(name: string, fallback = 'picture'): string {
  const s = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120)
  return s && s !== '.' && s !== '..' ? s : fallback
}

/**
 * Saves bytes as `<sub>/<name>` inside Assets. The same bytes already there under that name (or name-2, …) reuse it;
 * another file with the name gets "name-2.ext", unless `replace` (a newer version of the same picture, like a
 * re-exported artboard) overwrites it. Returns the path inside Assets, or null when it wasn't saved.
 */
export function saveAsset(assetsDir: string, sub: string, name: string, bytes: Buffer, opts: { replace?: boolean } = {}): string | null {
  if (bytes.length > MAX_BYTES) return null
  const folder = dirname(insideAssets(assetsDir, join(sub, 'file')))
  mkdirSync(folder, { recursive: true })
  const safe = safeFileName(name)
  const ext = extname(safe)
  const stem = safe.slice(0, safe.length - ext.length)
  for (let n = 1; n < 200; n++) {
    const file = n === 1 ? safe : `${stem}-${n}${ext}`
    const dest = join(folder, file)
    let taken: ReturnType<typeof lstatSync> | null = null
    try { taken = lstatSync(dest) } catch { /* free */ }
    const rel = relative(assetsDir, dest).split(sep).join('/')
    if (taken && opts.replace && taken.isFile()) {
      let same = false
      try { same = readFileSync(dest).equals(bytes) } catch { /* rewrite it */ }
      if (!same) writeAtomic(dest, bytes)
      return rel
    }
    if (taken) {
      if (taken.isFile()) { try { if (readFileSync(dest).equals(bytes)) return rel } catch { /* next name */ } }
      continue
    }
    writeAtomic(dest, bytes)
    return rel
  }
  return null
}

/** Copies a file into Assets (see saveAsset); null when it is too big, unreadable or not a picture. */
export function copyIntoAssets(assetsDir: string, sub: string, src: string, name: string, opts: { replace?: boolean } = {}): string | null {
  try {
    if (!IMAGE_EXT.has(extname(name).toLowerCase())) return null
    if (statSync(src).size > MAX_BYTES) return null
    return saveAsset(assetsDir, sub, name, readFileSync(src), opts)
  } catch { return null }
}

export function readCredits(assetsDir: string): AssetCredit[] {
  try {
    const v = JSON.parse(readFileSync(join(assetsDir, CREDITS_FILE), 'utf8')) as { assets?: AssetCredit[] }
    return Array.isArray(v.assets) ? v.assets.filter((a) => a && typeof a.file === 'string') : []
  } catch { return [] }
}

/** Adds or replaces (by file) a credit in credits.json, written atomically. */
export function addCredit(assetsDir: string, credit: AssetCredit): void {
  mkdirSync(assetsDir, { recursive: true })
  const list = readCredits(assetsDir).filter((c) => c.file !== credit.file)
  list.push(credit)
  writeAtomic(join(assetsDir, CREDITS_FILE), JSON.stringify({ about: 'Pictures shared by every team in this project, and who made them. Kept by Tyslin.', assets: list }, null, 2) + '\n')
}

export type AssetEntry = { file: string; size: number; modified: number; credit?: AssetCredit }

/** Every picture in Assets (newest first, at most `max`), with its credit when there is one. */
export function listAssets(assetsDir: string, max = 500): AssetEntry[] {
  if (!existsSync(assetsDir)) return []
  const credits = new Map(readCredits(assetsDir).map((c) => [c.file, c]))
  const out: AssetEntry[] = []
  const walk = (dir: string, depth: number): void => {
    if (depth > 4 || out.length > max * 4) return
    let names: string[] = []
    try { names = readdirSync(dir) } catch { return }
    for (const n of names) {
      if (n.startsWith('.')) continue
      const abs = join(dir, n)
      let st: ReturnType<typeof lstatSync>
      try { st = lstatSync(abs) } catch { continue }
      if (st.isSymbolicLink()) continue
      if (st.isDirectory()) walk(abs, depth + 1)
      else if (IMAGE_EXT.has(extname(n).toLowerCase())) {
        const file = relative(assetsDir, abs).split(sep).join('/')
        out.push({ file, size: st.size, modified: st.mtimeMs, credit: credits.get(file) })
      }
    }
  }
  walk(assetsDir, 0)
  return out.sort((a, b) => b.modified - a.modified).slice(0, max)
}
