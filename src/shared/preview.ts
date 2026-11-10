/**
 * The Preview tab: files an agency made, shown inside the task. Shared by main (the `tyslin-preview://`
 * protocol) and the renderer (the surface). Nothing outside the project folder or localhost is ever shown.
 */

export const PREVIEW_SCHEME = 'tyslin-preview'

export type PreviewKind = 'page' | 'image' | 'pdf' | 'markdown'

const KINDS: Record<string, PreviewKind> = {
  '.html': 'page', '.htm': 'page', '.svg': 'image', '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.webp': 'image',
  '.pdf': 'pdf', '.md': 'markdown'
}

/** What kind of preview a file gets, or null when it can't be previewed. */
export function previewKind(path: string): PreviewKind | null {
  const i = path.lastIndexOf('.')
  return i < 0 ? null : (KINDS[path.slice(i).toLowerCase()] ?? null)
}

/** The URL the preview surface loads for a project file; the protocol handler confines it to the project folder. */
export function previewUrl(projectId: string, path: string): string {
  return `${PREVIEW_SCHEME}://${projectId}/${path.split('/').map(encodeURIComponent).join('/')}`
}

/** Viewports the preview can show. Phone is the mockups' 390 px; the page scales down to fit the panel. */
export const VIEWPORTS = {
  desktop: { label: 'Desktop', width: 1280, height: 800 },
  tablet: { label: 'Tablet', width: 768, height: 1024 },
  phone: { label: 'Phone', width: 390, height: 844 }
} as const
export type Viewport = keyof typeof VIEWPORTS
