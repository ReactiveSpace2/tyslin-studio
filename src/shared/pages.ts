/**
 * Agency pages (10 Nov 2026): extra tabs on the Agency screen. A template lists the page types it shows
 * (`AgencyTemplate.pages`); each page type is built once and reused. Table and calendar pages read one JSON file
 * in the agency folder, kept up to date by the agency's agents; the screens page lists the folder itself.
 */

export type AgencyPageKind = 'screens' | 'table' | 'calendar' | 'campaigns' | 'design'

export interface AgencyPageSpec {
  /** Tab id and, for table and calendar pages, the data file name: data/<id>.json. */
  id: string
  kind: AgencyPageKind
  /** Tab label. */
  title: string
  /** What the data file holds, for the agents' instructions and the empty state. */
  about: string
  /** Default column keys for a table, in order, used when the file names none. */
  columns?: string[]
  /** Overrides data/<id>.json. Always inside the agency folder. */
  file?: string
}

export const pageFile = (p: AgencyPageSpec): string => p.file ?? `data/${p.id}.json`

/**
 * The Design board (Design team, 17 Nov 2026): one canvas of artboards. `design/board.json` lists them; each artboard
 * is one self-contained HTML file the designer writes with its file tools, at the artboard's size. The board shows
 * every file live and lets the boss tweak text, colours and sizes by hand (agency/pages/DesignBoard.tsx).
 */
export const DESIGN_BOARD_FILE = 'design/board.json'

export interface Artboard {
  /** The HTML file, relative to the team folder, e.g. "design/home.html". */
  file: string
  title: string
  width: number
  height: number
  /** Where it sits on the canvas; left out = placed in a row after the others. */
  x?: number
  y?: number
}

export interface DesignBoardDoc { artboards: Artboard[] }

/** Sizes the "Add artboard" menu and the designer's skill share (CSS px; print at 96 px per inch). */
export const ARTBOARD_PRESETS: { id: string; group: 'Web' | 'App' | 'Social' | 'Print'; label: string; width: number; height: number }[] = [
  { id: 'web', group: 'Web', label: 'Web page', width: 1440, height: 2400 },
  { id: 'web-phone', group: 'Web', label: 'Web page on a phone', width: 390, height: 2000 },
  { id: 'app', group: 'App', label: 'Web app screen', width: 1280, height: 800 },
  { id: 'phone', group: 'App', label: 'Phone app screen', width: 390, height: 844 },
  { id: 'post', group: 'Social', label: 'Square post', width: 1080, height: 1080 },
  { id: 'portrait', group: 'Social', label: 'Portrait post', width: 1080, height: 1350 },
  { id: 'story', group: 'Social', label: 'Story', width: 1080, height: 1920 },
  { id: 'link', group: 'Social', label: 'Link image', width: 1200, height: 627 },
  { id: 'a4', group: 'Print', label: 'A4 page', width: 794, height: 1123 },
  { id: 'trifold', group: 'Print', label: 'A4 tri-fold (one side)', width: 1123, height: 794 },
  { id: 'letter', group: 'Print', label: 'US Letter page', width: 816, height: 1056 }
]

const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : null)

/** Reads board.json leniently: bad entries are skipped, sizes kept between 40 and 8000 px, files only under the folder. */
export function parseDesignBoard(text: string): DesignBoardDoc {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error('design/board.json is not valid JSON.') }
  const list = Array.isArray((raw as { artboards?: unknown })?.artboards) ? (raw as { artboards: unknown[] }).artboards : []
  const artboards: Artboard[] = []
  for (const a of list) {
    if (!a || typeof a !== 'object') continue
    const o = a as Record<string, unknown>
    const file = typeof o.file === 'string' ? o.file.trim().replace(/^\.\//, '') : ''
    const width = num(o.width, 40, 8000), height = num(o.height, 40, 8000)
    if (!file || !/\.html?$/i.test(file) || file.startsWith('/') || file.split('/').includes('..') || !width || !height) continue
    if (artboards.some((x) => x.file === file)) continue
    artboards.push({ file, title: typeof o.title === 'string' && o.title.trim() ? o.title.trim().slice(0, 80) : file.replace(/^.*\//, ''), width, height, ...(num(o.x, -100000, 100000) !== null ? { x: num(o.x, -100000, 100000)! } : {}), ...(num(o.y, -100000, 100000) !== null ? { y: num(o.y, -100000, 100000)! } : {}) })
  }
  return { artboards }
}

/** Every artboard with a place: given ones keep theirs, the rest go in a row to the right, 80 px apart. */
export function layoutArtboards(doc: DesignBoardDoc): (Artboard & { x: number; y: number })[] {
  let right = 0
  for (const a of doc.artboards) if (a.x !== undefined) right = Math.max(right, a.x + a.width + 80)
  return doc.artboards.map((a) => {
    if (a.x !== undefined && a.y !== undefined) return { ...a, x: a.x, y: a.y }
    const placed = { ...a, x: right, y: a.y ?? 0 }
    right += a.width + 80
    return placed
  })
}

/** `{ "columns": [...], "rows": [...] }` after reading: columns as keys and labels, rows as plain objects. */
export interface TableData {
  columns: { key: string; label: string }[]
  rows: Record<string, string | number | null>[]
}

export const CALENDAR_STATES = ['draft', 'approved', 'scheduled', 'posted'] as const
export type CalendarState = (typeof CALENDAR_STATES)[number]
export interface CalendarItem { date: string; channel: string; title: string; state: CalendarState }
/** `{ "items": [{ "date": "YYYY-MM-DD", "channel", "title", "state" }] }`. */
export interface CalendarData { items: CalendarItem[] }

/** `pages:read`: the data, or why there is none. */
export type PageData =
  | { kind: 'table'; data: TableData; file: string; missing?: undefined; error?: undefined }
  | { kind: 'calendar'; data: CalendarData; file: string; missing?: undefined; error?: undefined }
  | { missing: true; file: string; kind?: undefined; error?: undefined }
  | { error: string; file?: string; kind?: undefined; missing?: undefined }

/**
 * The paragraph the Lead and workers get for each page with a data file: which file, its shape, and that it is
 * written with the file tools. Appended to the template's instructions (`memberInstructions`) and, for agencies
 * created earlier, to the run's system prompt.
 */
export function pageInstructions(pages: AgencyPageSpec[]): string {
  const lines = pages.flatMap((p) => {
    if (p.kind === 'table') {
      const cols = p.columns?.length ? p.columns.map((c) => JSON.stringify(c)).join(', ') : '"name", ...'
      return [`- ${pageFile(p)} (${p.about}), shown on the team's "${p.title}" page: { "columns": [${cols}], "rows": [ { ${p.columns?.[0] ? JSON.stringify(p.columns[0]) : '"name"'}: "...", ... } ] }. One row per item; keep the columns as listed.`]
    }
    if (p.kind === 'calendar') {
      return [`- ${pageFile(p)} (${p.about}), shown on the team's "${p.title}" page: { "items": [ { "date": "YYYY-MM-DD", "channel": "...", "title": "...", "state": "draft" } ] }. state is one of draft, approved, scheduled, posted. One item per post.`]
    }
    if (p.kind === 'design') {
      return [`- ${DESIGN_BOARD_FILE} lists the artboards shown on the team's "${p.title}" page: { "artboards": [ { "file": "design/home.html", "title": "Home page", "width": 1440, "height": 2400 } ] }. Each artboard is one self-contained HTML file at that size (follow the artboards skill). Add an artboard to the list when you create its file; never remove one the boss made. The boss may have edited an artboard by hand: read the file again before you change it, and keep their edits.`]
    }
    return []
  })
  if (!lines.length) return ''
  return [
    '## Team pages',
    'Keep these files in the team folder up to date whenever your work changes what they hold. Write them with your own file-editing tools, never with shell redirection or scripts, and keep them valid JSON:',
    ...lines
  ].join('\n')
}
