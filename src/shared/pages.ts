/**
 * Agency pages (10 Nov 2026): extra tabs on the Agency screen. A template lists the page types it shows
 * (`AgencyTemplate.pages`); each page type is built once and reused. Table and calendar pages read one JSON file
 * in the agency folder, kept up to date by the agency's agents; the screens page lists the folder itself.
 */

export type AgencyPageKind = 'screens' | 'table' | 'calendar' | 'campaigns'

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
      return [`- ${pageFile(p)} (${p.about}), shown on the agency's "${p.title}" page: { "columns": [${cols}], "rows": [ { ${p.columns?.[0] ? JSON.stringify(p.columns[0]) : '"name"'}: "...", ... } ] }. One row per item; keep the columns as listed.`]
    }
    if (p.kind === 'calendar') {
      return [`- ${pageFile(p)} (${p.about}), shown on the agency's "${p.title}" page: { "items": [ { "date": "YYYY-MM-DD", "channel": "...", "title": "...", "state": "draft" } ] }. state is one of draft, approved, scheduled, posted. One item per post.`]
    }
    return []
  })
  if (!lines.length) return ''
  return [
    '## Agency pages',
    'Keep these files in the agency folder up to date whenever your work changes what they hold. Write them with your file tools (write_file, edit_file), never with shell redirection or scripts, and keep them valid JSON:',
    ...lines
  ].join('\n')
}
