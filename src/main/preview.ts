import { app, protocol, type BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { extname, isAbsolute, join, relative, resolve, sep } from 'path'
import type { Attachment, PreviewFile } from '@shared/types'
import { PREVIEW_SCHEME, previewKind } from '@shared/preview'
import * as db from './db'
import { addCapturedImage } from './attachments'

/**
 * The Preview tab's back end: a custom `tyslin-preview://<projectId>/<path>` scheme that serves files from
 * that project's folder and nothing else, the list of previewable files (newest first), and a screenshot of
 * the preview area that becomes an image attachment for "Send with screenshot".
 */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.map': 'application/json'
}
/** Only the page's own files: no other hosts, no remote fonts or scripts. 'self' is this project's origin. */
const CSP = "default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src 'self'; frame-src 'none'; form-action 'none'"
const SKIP = new Set(['node_modules', '.git', 'dist', 'out', '.next', '.expo', 'coverage', 'build'])
const MAX_FILES = 400

/** Must run before `app.whenReady`: makes the scheme behave like https (relative URLs, fetch, service-worker-free). */
export function registerPreviewScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: PREVIEW_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: false } }])
}

/** Resolves a request path inside the project folder, or throws. Same rule as studio.ts `inside`. */
function fileFor(projectId: string, rel: string): string {
  const p = db.getProject(projectId)
  if (!p?.folder) throw new Error('No such project')
  const abs = resolve(p.folder, rel)
  const r = relative(p.folder, abs)
  if (!r || r.startsWith('..') || isAbsolute(r) || r.split(sep).includes('.git')) throw new Error('Outside the project folder')
  return abs
}

/** After `app.whenReady`. */
export function registerPreviewProtocol(): void {
  protocol.handle(PREVIEW_SCHEME, (request) => {
    try {
      const u = new URL(request.url)
      // Standard schemes lower-case the host; project ids are lower-case UUIDs, so it round-trips.
      let rel = decodeURIComponent(u.pathname.replace(/^\/+/, ''))
      let abs = fileFor(u.hostname, rel)
      if (statSync(abs).isDirectory()) { rel = join(rel, 'index.html'); abs = fileFor(u.hostname, rel) }
      const body = readFileSync(abs)
      return new Response(body, { headers: { 'content-type': MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream', 'content-security-policy': CSP, 'cache-control': 'no-store' } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return new Response(msg, { status: msg.includes('Outside') || msg.includes('No such') ? 403 : 404, headers: { 'content-type': 'text/plain' } })
    }
  })
}

/** Previewable files in the project folder, newest first. */
export function listPreviewFiles(projectId: string): PreviewFile[] {
  const p = db.getProject(projectId)
  if (!p?.folder) return []
  const root = p.folder
  const out: PreviewFile[] = []
  const walk = (dir: string, depth: number): void => {
    if (out.length >= MAX_FILES || depth > 5) return
    let names: string[] = []
    try { names = readdirSync(dir) } catch { return }
    for (const name of names) {
      if (out.length >= MAX_FILES) return
      if (name.startsWith('.') || SKIP.has(name)) continue
      const full = join(dir, name)
      try {
        const st = statSync(full)
        if (st.isDirectory()) { walk(full, depth + 1); continue }
        const kind = previewKind(name)
        if (kind) out.push({ path: relative(root, full).split(sep).join('/'), kind, size: st.size, updatedAt: st.mtimeMs })
      } catch { /* unreadable entry */ }
    }
  }
  walk(root, 0)
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Captures a region of the window (CSS pixels, as the renderer measures it) as a PNG and registers it as an
 * image attachment, so the next `sessions:send` can carry it.
 */
export async function capturePreview(win: BrowserWindow, rect: { x: number; y: number; width: number; height: number }, name: string): Promise<Attachment> {
  const z = win.webContents.getZoomFactor()
  const r = { x: Math.max(0, Math.round(rect.x * z)), y: Math.max(0, Math.round(rect.y * z)), width: Math.max(1, Math.round(rect.width * z)), height: Math.max(1, Math.round(rect.height * z)) }
  const img = await win.webContents.capturePage(r)
  const dir = join(app.getPath('userData'), 'captures')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${randomUUID()}.png`)
  writeFileSync(file, img.toPNG())
  return addCapturedImage(file, name.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'screenshot.png')
}
