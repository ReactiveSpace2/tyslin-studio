import { app } from 'electron'
import { execFile } from 'child_process'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'fs'
import { basename, extname, join } from 'path'
import { pathToFileURL } from 'url'
import { which } from './engines'

/**
 * Office files in the Preview (11 Nov 2026, owner: "hybrid"): Word and Excel are drawn in the window
 * (docx-preview, SheetJS); PowerPoint, old .doc/.odt/.rtf, and "Download as PDF" for any Office file go
 * through the user's own LibreOffice, run headless with argument arrays only. Tyslin never installs it.
 * Converted PDFs are cached in `<userData>/preview-cache/` by path, size and mtime.
 */

const CACHE_DIR = 'preview-cache'
/** LibreOffice's own profile for Tyslin's runs, so a LibreOffice the user has open doesn't block conversion. */
const PROFILE_DIR = join('adapters', 'libreoffice-profile')
const TIMEOUT_MS = 90_000
const CACHE_MAX = 60

const KNOWN = process.platform === 'darwin'
  ? ['/Applications/LibreOffice.app/Contents/MacOS/soffice']
  : process.platform === 'win32'
    ? [join(process.env.ProgramFiles ?? 'C:\\Program Files', 'LibreOffice', 'program', 'soffice.exe'), join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'LibreOffice', 'program', 'soffice.exe')]
    : ['/usr/bin/soffice', '/usr/lib/libreoffice/program/soffice', '/opt/libreoffice/program/soffice', '/snap/bin/libreoffice']

let found: string | null | undefined

/** The soffice binary, or null when LibreOffice isn't installed. Looked up once per launch (and again after a miss). */
export function soffice(): string | null {
  if (found) return found
  found = which('soffice') ?? which('libreoffice') ?? KNOWN.find((p) => existsSync(p)) ?? null
  return found
}

export const cacheDir = (): string => join(app.getPath('userData'), CACHE_DIR)

const inFlight = new Map<string, Promise<string>>()

/** Converts an Office file to PDF (cached) and returns the PDF's path. Throws a readable message on failure. */
export function officeToPdf(abs: string): Promise<string> {
  const bin = soffice()
  if (!bin) return Promise.reject(new Error('LibreOffice is not installed. Install it from libreoffice.org to show this file.'))
  const st = statSync(abs)
  const key = createHash('sha1').update(`${abs}\0${st.size}\0${st.mtimeMs}`).digest('hex').slice(0, 20)
  const dir = cacheDir()
  const out = join(dir, `${key}.pdf`)
  if (existsSync(out)) return Promise.resolve(out)
  const running = inFlight.get(out)
  if (running) return running

  const job = new Promise<string>((resolveJob, reject) => {
    // Each job converts in its own folder: soffice names the output after the input file.
    const work = join(dir, `${key}.tmp`)
    mkdirSync(work, { recursive: true })
    const profile = pathToFileURL(join(app.getPath('userData'), PROFILE_DIR)).href
    execFile(bin, [`-env:UserInstallation=${profile}`, '--headless', '--norestore', '--nolockcheck', '--convert-to', 'pdf', '--outdir', work, abs],
      { timeout: TIMEOUT_MS, windowsHide: true, killSignal: 'SIGKILL' },
      (err, _stdout, stderr) => {
        const made = join(work, `${basename(abs, extname(abs))}.pdf`)
        try {
          if (err || !existsSync(made)) {
            const why = err && (err as NodeJS.ErrnoException & { killed?: boolean }).killed ? 'it took longer than 90 seconds' : (String(stderr || err?.message || '').trim().split('\n').pop() || 'no PDF was made')
            reject(new Error(`LibreOffice could not convert ${basename(abs)}: ${why}`))
            return
          }
          // rename across the same folder is atomic; a reader never sees half a PDF.
          renameSync(made, out)
          trimCache(dir)
          resolveJob(out)
        } finally {
          rmSync(work, { recursive: true, force: true })
        }
      })
  }).finally(() => inFlight.delete(out))
  inFlight.set(out, job)
  return job
}

/** Keeps the newest CACHE_MAX PDFs. */
function trimCache(dir: string): void {
  try {
    const pdfs = readdirSync(dir).filter((n) => n.endsWith('.pdf')).map((n) => ({ n, t: statSync(join(dir, n)).mtimeMs })).sort((a, b) => b.t - a.t)
    for (const { n } of pdfs.slice(CACHE_MAX)) rmSync(join(dir, n), { force: true })
  } catch { /* cache only */ }
}
