import { existsSync, readFileSync, realpathSync, statSync, watch, type FSWatcher } from 'fs'
import { isAbsolute, relative, resolve, sep } from 'path'
import { CALENDAR_STATES, pageFile as specFile, type AgencyPageSpec, type CalendarData, type CalendarItem, type CalendarState, type PageData, type TableData } from '@shared/pages'
import { templatePages } from '@shared/agencies'
import * as db from './db'

/**
 * Agency pages (10 Nov 2026): extra tabs on the Agency screen, declared per template (`AgencyTemplate.pages`).
 * Table and calendar pages read one JSON file in the agency's folder (`data/<page>.json`), which the agency's
 * agents keep up to date with their file tools; the screens page lists the folder through `preview:list`.
 * Read-only: nothing here writes, and every path stays inside the agency folder.
 */

const MAX_BYTES = 2 * 1024 * 1024

function agencyFolder(agencyId: string): { folder: string; pages: AgencyPageSpec[] } {
  const agency = db.getAgency(agencyId)
  if (!agency) throw new Error('That agency no longer exists.')
  const folder = db.getProject(agency.projectId)?.folder
  if (!folder) throw new Error('This agency has no folder.')
  return { folder, pages: templatePages(agency.templateId) }
}

/** The page's file inside the folder, or throws; symlinks may not lead out of it. */
function pageFile(folder: string, file: string): string {
  const abs = resolve(folder, file)
  const rel = relative(folder, abs)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Outside the agency folder')
  if (existsSync(abs)) {
    const real = relative(realpathSync(folder), realpathSync(abs))
    if (real.startsWith('..') || isAbsolute(real)) throw new Error('Outside the agency folder')
  }
  return abs
}

const cell = (v: unknown): string | number | null => (v === null || v === undefined ? null : typeof v === 'number' ? v : typeof v === 'string' ? v : typeof v === 'boolean' ? String(v) : JSON.stringify(v))

/** `{ columns, rows }`: columns as strings or `{ key, label }`; rows as objects by key or arrays in column order. */
function table(raw: unknown, defaults: string[]): TableData {
  const o = raw as { columns?: unknown; rows?: unknown }
  if (!o || typeof o !== 'object' || !Array.isArray(o.rows)) throw new Error('Expected { "columns": [...], "rows": [...] }.')
  const given = Array.isArray(o.columns) ? o.columns : []
  let columns = given.map((c) => typeof c === 'string' ? { key: c, label: c } : c && typeof c === 'object' && 'key' in c ? { key: String((c as { key: unknown }).key), label: String((c as { label?: unknown }).label ?? (c as { key: unknown }).key) } : null).filter((c): c is { key: string; label: string } => !!c && !!c.key)
  if (!columns.length) {
    const keys = defaults.length ? defaults : [...new Set(o.rows.flatMap((r) => (r && typeof r === 'object' && !Array.isArray(r) ? Object.keys(r) : [])))]
    columns = keys.map((k) => ({ key: k, label: k }))
  }
  const rows = o.rows.map((r) => {
    const out: Record<string, string | number | null> = {}
    columns.forEach((c, i) => { out[c.key] = cell(Array.isArray(r) ? r[i] : r && typeof r === 'object' ? (r as Record<string, unknown>)[c.key] : undefined) })
    return out
  })
  return { columns, rows }
}

/** `{ items: [{ date: "YYYY-MM-DD", channel, title, state }] }`; an unknown state reads as draft. */
function calendar(raw: unknown): CalendarData {
  const o = raw as { items?: unknown }
  if (!o || typeof o !== 'object' || !Array.isArray(o.items)) throw new Error('Expected { "items": [{ "date", "channel", "title", "state" }] }.')
  const items: CalendarItem[] = []
  for (const it of o.items) {
    if (!it || typeof it !== 'object') continue
    const r = it as Record<string, unknown>
    const date = String(r.date ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const state = String(r.state ?? 'draft').toLowerCase() as CalendarState
    items.push({ date, channel: String(r.channel ?? ''), title: String(r.title ?? ''), state: CALENDAR_STATES.includes(state) ? state : 'draft' })
  }
  return { items: items.sort((a, b) => a.date.localeCompare(b.date)) }
}

/** A table or calendar page's data: `{ data }`, `{ missing: true }` when the file isn't there yet, or `{ error }`. */
export function readPage(agencyId: string, pageId: string): PageData {
  const { folder, pages } = agencyFolder(agencyId)
  const spec = pages.find((p) => p.id === pageId)
  if (!spec) return { error: 'This agency has no such page.' }
  if (spec.kind !== 'table' && spec.kind !== 'calendar') return { error: 'This page has no data file.' }
  const file = specFile(spec)
  try {
    const abs = pageFile(folder, file)
    if (!existsSync(abs)) return { missing: true, file }
    if (statSync(abs).size > MAX_BYTES) return { error: `${file} is over 2 MB.`, file }
    const raw = JSON.parse(readFileSync(abs, 'utf8')) as unknown
    return spec.kind === 'table' ? { kind: 'table', data: table(raw, spec.columns ?? []), file } : { kind: 'calendar', data: calendar(raw), file }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { error: err instanceof SyntaxError ? `${file} isn't valid JSON: ${msg}` : msg, file }
  }
}

/** One recursive watcher per agency folder while an agency page is open; `pages:changed` names the changed path. */
const watchers = new Map<string, { w: FSWatcher; refs: number }>()
const SKIP = /(^|[\\/])(\.git|node_modules|\.next|dist|out|build|coverage)([\\/]|$)/

export function watchAgency(agencyId: string, send: (p: { agencyId: string; path: string }) => void): void {
  const cur = watchers.get(agencyId)
  if (cur) { cur.refs++; return }
  const { folder } = agencyFolder(agencyId)
  const pending = new Set<string>()
  let timer: NodeJS.Timeout | null = null
  try {
    const w = watch(folder, { recursive: true }, (_e, name) => {
      const rel = name ? String(name).split(sep).join('/') : ''
      if (rel && SKIP.test(rel)) return
      pending.add(rel)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { for (const p of pending) send({ agencyId, path: p }); pending.clear() }, 400)
    })
    w.on('error', () => unwatchAgency(agencyId, true))
    watchers.set(agencyId, { w, refs: 1 })
  } catch (err) {
    console.warn(`[pages] can't watch ${folder}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export function unwatchAgency(agencyId: string, all = false): void {
  const cur = watchers.get(agencyId)
  if (!cur) return
  cur.refs = all ? 0 : cur.refs - 1
  if (cur.refs > 0) return
  cur.w.close()
  watchers.delete(agencyId)
}
