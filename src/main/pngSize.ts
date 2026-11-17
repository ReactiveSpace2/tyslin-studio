import { closeSync, openSync, readSync } from 'fs'

/**
 * Whether a PNG doesn't match an artboard's size (designExport.ts, QA 18 Nov 2026). A picture at 2x or 3x of the size
 * (a high-density screen) matches; anything else, or a file that isn't a PNG, doesn't. A missing file is left to the
 * caller's own check (false). No Electron imports, so tests can use it.
 */
export function pngWrongSize(png: string, width: number, height: number): boolean {
  const head = Buffer.alloc(24)
  let n = 0
  try { const fd = openSync(png, 'r'); try { n = readSync(fd, head, 0, 24, 0) } finally { closeSync(fd) } } catch { return false }
  if (n < 24 || head.toString('latin1', 12, 16) !== 'IHDR') return true
  const scale = head.readUInt32BE(16) / width
  return scale < 0.99 || Math.abs(scale - Math.round(scale)) > 0.01 || Math.abs(head.readUInt32BE(20) / height - scale) > 0.01
}
