/**
 * The Preview tab: files an agency made, shown inside the task. Shared by main (the `tyslin-preview://`
 * protocol) and the renderer (the surface). Nothing outside the project folder or localhost is ever shown.
 */

export const PREVIEW_SCHEME = 'tyslin-preview'

/**
 * `word` (.docx) and `sheet` (Excel, ODS, CSV) are drawn in the window (docx-preview, SheetJS); `slides` and
 * `office` (old Word, ODT, RTF) are converted to PDF by the user's LibreOffice (main/office.ts) and shown as a PDF.
 */
export type PreviewKind = 'page' | 'image' | 'pdf' | 'markdown' | 'word' | 'sheet' | 'slides' | 'office'

const KINDS: Record<string, PreviewKind> = {
  '.html': 'page', '.htm': 'page', '.svg': 'image', '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.webp': 'image',
  '.pdf': 'pdf', '.md': 'markdown',
  '.docx': 'word', '.xlsx': 'sheet', '.xlsm': 'sheet', '.xls': 'sheet', '.ods': 'sheet', '.csv': 'sheet', '.tsv': 'sheet',
  '.pptx': 'slides', '.ppt': 'slides', '.odp': 'slides', '.doc': 'office', '.odt': 'office', '.rtf': 'office'
}

/** The label after the file name in the Preview header ("editing.html · Page"). */
export const KIND_LABEL: Record<PreviewKind, string> = {
  page: 'Page', image: 'Image', pdf: 'PDF', markdown: 'Markdown', word: 'Word', sheet: 'Spreadsheet', slides: 'Slides', office: 'Document'
}

/** Kinds that need LibreOffice to be shown at all. */
export const needsLibreOffice = (k: PreviewKind): boolean => k === 'slides' || k === 'office'
/** Kinds "Download as PDF" can make: pages (printed by Chromium), PDFs (a copy), and Office files (LibreOffice). */
export const pdfExportable = (k: PreviewKind): boolean => k !== 'image' && k !== 'markdown'
/** Kinds the zoom menu applies to (pages scale to the panel; PDFs bring their own zoom). */
export const zoomable = (k: PreviewKind): boolean => k === 'word' || k === 'sheet' || k === 'markdown' || k === 'image'

/** What kind of preview a file gets, or null when it can't be previewed. */
export function previewKind(path: string): PreviewKind | null {
  const i = path.lastIndexOf('.')
  return i < 0 ? null : (KINDS[path.slice(i).toLowerCase()] ?? null)
}

/** The URL the preview surface loads for a project file; the protocol handler confines it to the project folder. */
export function previewUrl(projectId: string, path: string, asPdf = false): string {
  return `${PREVIEW_SCHEME}://${projectId}/${path.split('/').map(encodeURIComponent).join('/')}${asPdf ? '?as=pdf' : ''}`
}

/** Viewports the preview can show. Phone is the mockups' 390 px; the page scales down to fit the panel. */
export const VIEWPORTS = {
  desktop: { label: 'Desktop', width: 1280, height: 800 },
  tablet: { label: 'Tablet', width: 768, height: 1024 },
  phone: { label: 'Phone', width: 390, height: 844 }
} as const
export type Viewport = keyof typeof VIEWPORTS
