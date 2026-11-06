import type { CanvasDoc, CanvasEl, CanvasElType } from '@shared/types'

/**
 * Canvas data helpers: defaults for new layers, cleaning up layers from files or a model's reply,
 * geometry and SVG export. Kept free of React so the rules are in one place.
 */

export const uid = (): string => Math.random().toString(36).slice(2, 10)

export const DEFAULTS: Record<CanvasElType, Omit<CanvasEl, 'id' | 'x' | 'y' | 'w' | 'h'>> = {
  frame: { type: 'frame', name: 'Frame', fill: '#FFFFFF', stroke: 'none', strokeWidth: 1, radius: 0, opacity: 1 },
  rect: { type: 'rect', fill: '#D9D9D9', stroke: 'none', strokeWidth: 1, radius: 0, opacity: 1 },
  ellipse: { type: 'ellipse', fill: '#D9D9D9', stroke: 'none', strokeWidth: 1, radius: 0, opacity: 1 },
  text: { type: 'text', fill: 'none', stroke: 'none', strokeWidth: 0, radius: 0, opacity: 1, text: '', fontSize: 24, fontWeight: 400, color: '#0F0F0D', align: 'left' },
  line: { type: 'line', fill: 'none', stroke: '#0F0F0D', strokeWidth: 2, radius: 0, opacity: 1, arrow: false }
}

export const TYPE_LABEL: Record<CanvasElType, string> = { frame: 'Frame', rect: 'Rectangle', ellipse: 'Ellipse', text: 'Text', line: 'Line' }

export const emptyDoc = (): CanvasDoc => ({ version: 2, elements: [] })

const num = (v: unknown, d: number, min = -1e6, max = 1e6): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d
}
/** Colours: hex, rgb()/rgba()/hsl() or a plain CSS name; anything else falls back. Never lets markup through. */
const color = (v: unknown, d: string): string => {
  if (typeof v !== 'string') return d
  const s = v.trim()
  if (s === 'none' || s === 'transparent') return 'none'
  if (/^#[0-9a-f]{3,8}$/i.test(s) || /^(rgb|rgba|hsl|hsla)\([\d\s.,%/]+\)$/i.test(s) || /^[a-z]{3,20}$/i.test(s)) return s
  return d
}

/** One layer from any source (a file, the clipboard, a model's reply), with every field checked. */
export function cleanEl(raw: unknown, keepId = true): CanvasEl | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const type = (['frame', 'rect', 'ellipse', 'text', 'line'] as const).find((t) => t === r.type) ?? (r.type === 'rectangle' ? 'rect' : r.type === 'circle' ? 'ellipse' : null)
  if (!type) return null
  const d = DEFAULTS[type]
  const el: CanvasEl = {
    ...d,
    id: keepId && typeof r.id === 'string' && /^[\w-]{1,40}$/.test(r.id) ? r.id : uid(),
    x: num(r.x, 0), y: num(r.y, 0),
    w: num(r.w ?? r.width, type === 'line' ? 100 : 100, type === 'line' ? -1e5 : 1, 1e5),
    h: num(r.h ?? r.height, type === 'line' ? 0 : 100, type === 'line' ? -1e5 : 1, 1e5),
    fill: color(r.fill, d.fill), stroke: color(r.stroke, d.stroke),
    strokeWidth: num(r.strokeWidth, d.strokeWidth, 0, 100), radius: num(r.radius, d.radius, 0, 10000), opacity: num(r.opacity, 1, 0, 1)
  }
  if (typeof r.name === 'string' && r.name.trim()) el.name = r.name.trim().slice(0, 80)
  if (type === 'text') {
    el.text = typeof r.text === 'string' ? r.text.slice(0, 5000) : ''
    el.fontSize = num(r.fontSize, 24, 4, 400)
    el.fontWeight = [300, 400, 500, 600, 700, 800].includes(num(r.fontWeight, 400)) ? num(r.fontWeight, 400) : 400
    el.color = color(r.color ?? (r.fill !== 'none' ? r.fill : undefined), '#0F0F0D')
    el.fill = 'none'
    el.align = (['left', 'center', 'right'] as const).find((a) => a === r.align) ?? 'left'
  }
  if (type === 'line') el.arrow = r.arrow === true
  return el
}

export function parseDoc(text: string): CanvasDoc {
  try {
    const j = JSON.parse(text) as { elements?: unknown[] }
    return { version: 2, elements: (j.elements ?? []).map((e) => cleanEl(e)).filter((e): e is CanvasEl => !!e) }
  } catch {
    return emptyDoc()
  }
}

/** The JSON object in a model's reply (with or without code fences or a sentence around it). */
export function extractJson(reply: string): Record<string, unknown> | null {
  const t = reply.replace(/```(?:json)?/gi, '')
  const a = t.indexOf('{')
  const b = t.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  try { return JSON.parse(t.slice(a, b + 1)) as Record<string, unknown> } catch { return null }
}

export interface Box { x: number; y: number; w: number; h: number }

/** Bounding box with positive size (lines can run backwards). */
export function box(e: Pick<CanvasEl, 'x' | 'y' | 'w' | 'h'>): Box {
  return { x: Math.min(e.x, e.x + e.w), y: Math.min(e.y, e.y + e.h), w: Math.abs(e.w), h: Math.abs(e.h) }
}

export function unionBox(els: CanvasEl[]): Box | null {
  if (!els.length) return null
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const e of els) {
    const b = box(e)
    x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h)
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

export const intersects = (a: Box, b: Box): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
export const contains = (outer: Box, inner: Box): boolean =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h

/** Layers drawn after a frame and fully inside it move with it (like children in a design tool). */
export function childrenOf(frame: CanvasEl, all: CanvasEl[]): CanvasEl[] {
  const fb = box(frame)
  const i = all.findIndex((e) => e.id === frame.id)
  return all.filter((e, j) => j > i && e.id !== frame.id && contains(fb, box(e)))
}

/** Arrow head at a line's end, as polygon points (drawn by hand: markers with context-stroke aren't reliable). */
export function arrowHead(e: Pick<CanvasEl, 'x' | 'y' | 'w' | 'h' | 'strokeWidth'>): string {
  const a = Math.atan2(e.h, e.w)
  const s = Math.max(8, e.strokeWidth * 4)
  const tx = e.x + e.w, ty = e.y + e.h
  const p = (ang: number): string => `${tx - s * Math.cos(a - ang)},${ty - s * Math.sin(a - ang)}`
  return `${tx},${ty} ${p(0.45)} ${p(-0.45)}`
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const paint = (c: string): string => (c === 'none' ? 'none' : esc(c))

/** Standalone SVG of the given layers, cropped to `area`. */
export function toSvg(els: CanvasEl[], area: Box): string {
  const parts: string[] = []
  for (const e of els) {
    const op = e.opacity < 1 ? ` opacity="${e.opacity}"` : ''
    const st = e.stroke !== 'none' && e.strokeWidth > 0 ? ` stroke="${paint(e.stroke)}" stroke-width="${e.strokeWidth}"` : ''
    const b = box(e)
    if (e.type === 'frame' || e.type === 'rect') parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${e.radius}" fill="${paint(e.fill)}"${st}${op}/>`)
    else if (e.type === 'ellipse') parts.push(`<ellipse cx="${b.x + b.w / 2}" cy="${b.y + b.h / 2}" rx="${b.w / 2}" ry="${b.h / 2}" fill="${paint(e.fill)}"${st}${op}/>`)
    else if (e.type === 'line') {
      parts.push(`<line x1="${e.x}" y1="${e.y}" x2="${e.x + e.w}" y2="${e.y + e.h}" stroke="${paint(e.stroke)}" stroke-width="${e.strokeWidth}" stroke-linecap="round"${op}/>`)
      if (e.arrow) parts.push(`<polygon points="${arrowHead(e)}" fill="${paint(e.stroke)}"${op}/>`)
    } else if (e.type === 'text') {
      const size = e.fontSize ?? 24
      const anchor = e.align === 'center' ? 'middle' : e.align === 'right' ? 'end' : 'start'
      const tx = e.align === 'center' ? b.x + b.w / 2 : e.align === 'right' ? b.x + b.w : b.x
      const lines = (e.text ?? '').split('\n')
      const spans = lines.map((l, i) => `<tspan x="${tx}" dy="${i === 0 ? size : size * 1.3}">${esc(l) || ' '}</tspan>`).join('')
      parts.push(`<text x="${tx}" y="${b.y - size * 0.2}" font-family="Geist, Inter, system-ui, sans-serif" font-size="${size}" font-weight="${e.fontWeight ?? 400}" fill="${paint(e.color ?? '#0F0F0D')}" text-anchor="${anchor}"${op}>${spans}</text>`)
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(area.w)}" height="${Math.ceil(area.h)}" viewBox="${area.x} ${area.y} ${area.w} ${area.h}">${parts.join('')}</svg>`
}

/** Rasterises an SVG (2x) and returns PNG base64 without the data-URL prefix. */
export async function svgToPng(svg: string, w: number, h: number, scale = 2): Promise<string> {
  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  await img.decode()
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * scale))
  c.height = Math.max(1, Math.round(h * scale))
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/png').split(',')[1]
}

/** What the model is asked for when designing from a prompt. */
export function designPrompt(request: string, size: { w: number; h: number; label: string }): string {
  return `Design this on a canvas: ${request}

Reply with ONLY one JSON object, no prose and no code fences:
{"name": "<short frame name>", "elements": [ ... ]}

The frame is ${size.w} x ${size.h} (${size.label}). Coordinates are in pixels from the frame's top-left corner.
Each element is one of:
- {"type": "rect", "x", "y", "w", "h", "fill": "#hex", "stroke": "#hex" or "none", "strokeWidth", "radius", "name"}
- {"type": "ellipse", "x", "y", "w", "h", "fill", "stroke", "strokeWidth"}
- {"type": "text", "x", "y", "w", "h", "text", "fontSize", "fontWeight" (400, 500, 600 or 700), "color": "#hex", "align": "left" | "center" | "right"}
- {"type": "line", "x", "y", "w", "h" (it runs from x,y to x+w,y+h), "stroke", "strokeWidth", "arrow": true or false}
Elements are drawn in order, so put backgrounds and cards before what sits on them. Keep everything inside the frame.
Use an 8 px spacing grid, clear hierarchy and real-looking content (no lorem ipsum). Make text boxes wide enough; h is about fontSize x 1.3 per line.`
}

/** What the model is asked for when changing selected layers. */
export function editPrompt(request: string, els: CanvasEl[]): string {
  return `Change these canvas elements as asked: ${request}

Reply with ONLY one JSON object, no prose and no code fences: {"elements": [ ... ]}
Use the same fields as the input. Keep "id" on elements you keep or change, leave "id" out on new elements, and leave out elements that should be deleted. Coordinates are absolute.

Elements:
${JSON.stringify(els.map(({ id, type, name, x, y, w, h, fill, stroke, strokeWidth, radius, opacity, text, fontSize, fontWeight, color, align, arrow }) =>
  ({ id, type, name, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), fill, stroke, strokeWidth, radius, opacity, text, fontSize, fontWeight, color, align, arrow })))}`
}

export const FRAME_SIZES = [
  { id: 'desktop', label: 'Desktop', w: 1440, h: 1024 },
  { id: 'tablet', label: 'Tablet', w: 834, h: 1194 },
  { id: 'mobile', label: 'Mobile', w: 390, h: 844 },
  { id: 'slide', label: 'Slide', w: 1920, h: 1080 },
  { id: 'social', label: 'Social post', w: 1080, h: 1080 }
] as const
