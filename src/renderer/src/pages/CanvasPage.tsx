import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCurrentProject } from '../currentProject'
import type { Agent, CanvasDoc, CanvasEl, CanvasElType, Project, StudioFile } from '@shared/types'
import { DEFAULT_MODEL_AGENT } from '@shared/models'
import { Icon, type IconName } from '../components/Icon'
import { SAVE_LABEL, StudioFiles, StudioOverview, useAutosave } from '../components/StudioFiles'
import { AgentSelect } from '../components/AgentSelect'
import {
  DEFAULTS, FRAME_SIZES, TYPE_LABEL, arrowHead, box, childrenOf, cleanEl, designPrompt, editPrompt, emptyDoc, extractJson,
  intersects, parseDoc, svgToPng, toSvg, uid, unionBox, type Box
} from '../canvasModel'

interface Props {
  agents: Agent[]
  projects: Project[]
  onOpenChat: (agentId: string, projectId: string | null, sessionId?: string) => void
  /** A file to open straight away (from Drive). */
  initial?: { projectId: string; path: string }
}

type Tool = 'select' | 'hand' | CanvasElType
type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'start' | 'end'
type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'draw'; id: string; ox: number; oy: number }
  | { kind: 'move'; sx: number; sy: number; orig: Map<string, { x: number; y: number }>; moved: boolean }
  | { kind: 'resize'; handle: Handle; sx: number; sy: number; orig: CanvasEl }
  | { kind: 'marquee'; sx: number; sy: number; base: string[] }

const TOOLS: [Tool, IconName, string, string][] = [
  ['select', 'cursor', 'Move', 'V'], ['hand', 'hand', 'Hand', 'H'], ['frame', 'frame', 'Frame', 'F'], ['rect', 'square', 'Rectangle', 'R'],
  ['ellipse', 'circle', 'Ellipse', 'O'], ['line', 'line', 'Line', 'L'], ['text', 'type', 'Text', 'T']
]
const KEY_TOOL: Record<string, Tool> = { v: 'select', h: 'hand', f: 'frame', r: 'rect', o: 'ellipse', l: 'line', t: 'text' }
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const CURSOR: Record<string, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', start: 'move', end: 'move' }
const MAX_HISTORY = 100
const isTyping = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
const hex = (c: string | undefined, d = '#000000'): string => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : c && /^#[0-9a-f]{3}$/i.test(c) ? '#' + c.slice(1).split('').map((x) => x + x).join('') : d)
const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))

/**
 * Canvas: a design board. Draw frames, shapes, lines and text by hand, or describe a screen and let the
 * default model (or any agent) lay it out; it can also change the selected layers. Saved as
 * canvas/<name>.canvas.json in the project folder (the Default project when none is chosen).
 */
export function CanvasPage({ agents, projects, onOpenChat, initial }: Props): JSX.Element {
  // The project picked in the title bar; App remounts this screen when it changes.
  const [projectId] = useCurrentProject()
  const [file, setFile] = useState<StudioFile | null>(null)
  const [doc, setDoc] = useState<CanvasDoc | null>(null)
  const [dirty, setDirty] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [tool, setTool] = useState<Tool>('select')
  const [sel, setSel] = useState<string[]>([])
  const [view, setView] = useState({ x: 80, y: 80, zoom: 0.5 })
  const [editing, setEditing] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<Box | null>(null)
  const [tab, setTab] = useState<'design' | 'ai'>('design')
  const [agentId, setAgentId] = useState<string>(DEFAULT_MODEL_AGENT)
  const [aiMode, setAiMode] = useState<'new' | 'edit'>('new')
  const [size, setSize] = useState<string>('desktop')
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [aiNote, setAiNote] = useState<{ ok: boolean; text: string; sessionId?: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [, setHist] = useState(0)

  const boardRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const past = useRef<CanvasEl[][]>([])
  const future = useRef<CanvasEl[][]>([])
  const clip = useRef<CanvasEl[]>([])
  const space = useRef(false)
  const docRef = useRef(doc)
  docRef.current = doc
  const viewRef = useRef(view)
  viewRef.current = view

  const els = doc?.elements ?? []
  const byId = useMemo(() => new Map(els.map((e) => [e.id, e])), [els])
  const selected = sel.map((id) => byId.get(id)).filter((e): e is CanvasEl => !!e)
  const one = selected.length === 1 ? selected[0] : null

  const json = doc ? JSON.stringify(doc, null, 1) : null
  const save = useAutosave(json, dirty, async (v) => { if (file) await window.tyslin.studio.write(projectId, { path: file.path }, v) }, () => { setDirty(false); setRefresh((r) => r + 1) })

  // ---------- history ----------
  /** Remembers the current layers so the next change can be undone. */
  const snapshot = (): void => {
    if (!docRef.current) return
    past.current.push(docRef.current.elements)
    if (past.current.length > MAX_HISTORY) past.current.shift()
    future.current = []
    setHist((h) => h + 1)
  }
  /** Sets layers without a history entry (live dragging after a snapshot). */
  const apply = (next: CanvasEl[]): void => {
    const d: CanvasDoc = { version: 2, elements: next }
    docRef.current = d
    setDoc(d)
    setDirty(true)
  }
  const commit = (next: CanvasEl[]): void => { snapshot(); apply(next) }
  const undo = (): void => {
    const prev = past.current.pop()
    if (!prev || !docRef.current) return
    future.current.push(docRef.current.elements)
    apply(prev); setSel((s) => s.filter((id) => prev.some((e) => e.id === id))); setHist((h) => h + 1)
  }
  const redo = (): void => {
    const next = future.current.pop()
    if (!next || !docRef.current) return
    past.current.push(docRef.current.elements)
    apply(next); setHist((h) => h + 1)
  }

  // ---------- view ----------
  const fit = useCallback((list: CanvasEl[]): void => {
    const r = boardRef.current?.getBoundingClientRect()
    const b = unionBox(list)
    if (!r) return
    if (!b) { setView({ x: 80, y: 80, zoom: 0.5 }); return }
    const zoom = Math.min(2, Math.max(0.05, Math.min((r.width - 120) / Math.max(b.w, 1), (r.height - 120) / Math.max(b.h, 1))))
    setView({ zoom, x: (r.width - b.w * zoom) / 2 - b.x * zoom, y: (r.height - b.h * zoom) / 2 - b.y * zoom })
  }, [])
  const toWorld = (cx: number, cy: number): { x: number; y: number } => {
    const r = boardRef.current!.getBoundingClientRect()
    const v = viewRef.current
    return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom }
  }
  const zoomAt = (factor: number, cx?: number, cy?: number): void => {
    const r = boardRef.current?.getBoundingClientRect()
    if (!r) return
    const px = cx ?? r.left + r.width / 2, py = cy ?? r.top + r.height / 2
    setView((v) => {
      const zoom = Math.min(8, Math.max(0.05, v.zoom * factor))
      const wx = (px - r.left - v.x) / v.zoom, wy = (py - r.top - v.y) / v.zoom
      return { zoom, x: px - r.left - wx * zoom, y: py - r.top - wy * zoom }
    })
  }

  // ---------- files ----------
  const open = async (f: StudioFile | null, pid: string | null = projectId): Promise<void> => {
    setFile(f); setDoc(null); setDirty(false); setSel([]); setEditing(null); setAiNote(null); setNotice(null)
    past.current = []; future.current = []
    if (!f) return
    const d = parseDoc(await window.tyslin.studio.read(pid, f.path))
    setDoc(d)
    requestAnimationFrame(() => fit(d.elements))
  }
  useEffect(() => {
    if (!initial) return
    const name = initial.path.split('/').pop()!.replace(/\.canvas\.json$/, '')
    void open({ name, path: initial.path, updatedAt: Date.now() }, initial.projectId)
  }, [initial?.path])
  const create = async (name: string): Promise<void> => {
    const d = emptyDoc()
    const f = await window.tyslin.studio.write(projectId, { kind: 'canvas', name }, JSON.stringify(d))
    setRefresh((x) => x + 1)
    setFile(f); setDoc(d); setDirty(false); setSel([]); setNotice(null); past.current = []; future.current = []
    setView({ x: 80, y: 80, zoom: 0.5 })
  }

  // Wheel: pan, or zoom with Ctrl/Cmd (and trackpad pinch). Needs a non-passive listener.
  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY)
      else setView((v) => ({ ...v, x: v.x - (e.shiftKey ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey ? 0 : e.deltaY) }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [doc !== null])

  // ---------- editing helpers ----------
  const update = (ids: string[], patch: (e: CanvasEl) => Partial<CanvasEl>, record = true): void => {
    const list = docRef.current?.elements ?? []
    const next = list.map((e) => (ids.includes(e.id) ? { ...e, ...patch(e) } : e))
    if (record) commit(next)
    else apply(next)
  }
  const remove = (ids: string[]): void => {
    if (!ids.length) return
    commit(els.filter((e) => !ids.includes(e.id)))
    setSel([])
  }
  const duplicate = (ids: string[], offset = 16): void => {
    const copies = els.filter((e) => ids.includes(e.id)).map((e) => ({ ...e, id: uid(), x: e.x + offset, y: e.y + offset }))
    if (!copies.length) return
    commit([...els, ...copies])
    setSel(copies.map((c) => c.id))
  }
  const paste = (): void => {
    if (!clip.current.length) return
    const copies = clip.current.map((e) => ({ ...e, id: uid(), x: e.x + 24, y: e.y + 24 }))
    clip.current = copies
    commit([...els, ...copies])
    setSel(copies.map((c) => c.id))
  }
  /** Moves the selection in the layer order: to the front or back, or one step. */
  const arrange = (how: 'front' | 'forward' | 'backward' | 'back'): void => {
    if (!sel.length) return
    const picked = els.filter((e) => sel.includes(e.id))
    const rest = els.filter((e) => !sel.includes(e.id))
    let next: CanvasEl[]
    if (how === 'front') next = [...rest, ...picked]
    else if (how === 'back') next = [...picked, ...rest]
    else {
      next = [...els]
      const order = how === 'forward' ? [...next.keys()].reverse() : [...next.keys()]
      for (const i of order) {
        if (!sel.includes(next[i].id)) continue
        const j = how === 'forward' ? i + 1 : i - 1
        if (j < 0 || j >= next.length || sel.includes(next[j].id)) continue
        ;[next[i], next[j]] = [next[j], next[i]]
      }
    }
    commit(next)
  }
  const align = (how: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'): void => {
    const u = unionBox(selected)
    if (!u || selected.length < 2) return
    update(sel, (e) => {
      const b = box(e)
      const dx = how === 'left' ? u.x - b.x : how === 'right' ? u.x + u.w - b.x - b.w : how === 'hcenter' ? u.x + u.w / 2 - b.x - b.w / 2 : 0
      const dy = how === 'top' ? u.y - b.y : how === 'bottom' ? u.y + u.h - b.y - b.h : how === 'vcenter' ? u.y + u.h / 2 - b.y - b.h / 2 : 0
      return { x: Math.round(e.x + dx), y: Math.round(e.y + dy) }
    })
  }

  // ---------- pointer ----------
  const startMove = (e: React.PointerEvent, ids: string[]): void => {
    const p = toWorld(e.clientX, e.clientY)
    const moving = new Set(ids)
    // Frames carry what sits inside them.
    for (const id of ids) {
      const el = byId.get(id)
      if (el?.type === 'frame') childrenOf(el, els).forEach((c) => moving.add(c.id))
    }
    const orig = new Map([...moving].map((id) => [id, { x: byId.get(id)!.x, y: byId.get(id)!.y }]))
    drag.current = { kind: 'move', sx: p.x, sy: p.y, orig, moved: false }
  }

  const onBoardDown = (e: React.PointerEvent): void => {
    if (!doc || editing) return
    boardRef.current?.focus()
    boardRef.current?.setPointerCapture(e.pointerId)
    if (e.button === 1 || tool === 'hand' || space.current) {
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }
      return
    }
    if (e.button !== 0) return
    const p = toWorld(e.clientX, e.clientY)
    if (tool !== 'select') {
      const type = tool as CanvasElType
      const frames = els.filter((x) => x.type === 'frame').length
      const el: CanvasEl = {
        ...DEFAULTS[type], id: uid(), x: Math.round(p.x), y: Math.round(p.y), w: 0, h: 0,
        ...(type === 'frame' ? { name: `Frame ${frames + 1}` } : {}),
        ...(type === 'text' ? { w: 240, h: Math.round((DEFAULTS.text.fontSize ?? 24) * 1.3) } : {})
      }
      commit([...els, el])
      setSel([el.id])
      drag.current = { kind: 'draw', id: el.id, ox: el.x, oy: el.y }
      return
    }
    drag.current = { kind: 'marquee', sx: p.x, sy: p.y, base: e.shiftKey ? sel : [] }
    if (!e.shiftKey) setSel([])
  }

  const onElDown = (e: React.PointerEvent, el: CanvasEl): void => {
    if (tool !== 'select' || space.current || e.button !== 0 || editing) return // drawing or panning: the board handles it
    e.stopPropagation()
    boardRef.current?.focus()
    boardRef.current?.setPointerCapture(e.pointerId)
    let ids = sel
    if (e.shiftKey) {
      ids = sel.includes(el.id) ? sel.filter((x) => x !== el.id) : [...sel, el.id]
      setSel(ids)
      if (!ids.includes(el.id)) return
    } else if (!sel.includes(el.id)) {
      ids = [el.id]
      setSel(ids)
    }
    startMove(e, ids)
  }

  const onHandleDown = (e: React.PointerEvent, el: CanvasEl, handle: Handle): void => {
    e.stopPropagation()
    boardRef.current?.setPointerCapture(e.pointerId)
    snapshot() // one history entry per resize
    const p = toWorld(e.clientX, e.clientY)
    drag.current = { kind: 'resize', handle, sx: p.x, sy: p.y, orig: { ...el } }
  }

  const onBoardMove = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d || !docRef.current) return
    const list = docRef.current.elements
    if (d.kind === 'pan') { setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy })); return }
    const p = toWorld(e.clientX, e.clientY)
    if (d.kind === 'draw') {
      apply(list.map((x) => {
        if (x.id !== d.id) return x
        let w = p.x - d.ox, h = p.y - d.oy
        if (x.type === 'line') {
          if (e.shiftKey) { const a = Math.round(Math.atan2(h, w) / (Math.PI / 4)) * (Math.PI / 4); const len = Math.hypot(w, h); w = Math.cos(a) * len; h = Math.sin(a) * len }
          return { ...x, w: Math.round(w), h: Math.round(h) }
        }
        if (x.type === 'text') return { ...x, x: Math.round(Math.min(d.ox, p.x)), w: Math.max(40, Math.round(Math.abs(w))) }
        if (e.shiftKey) { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s }
        return { ...x, x: Math.round(Math.min(d.ox, d.ox + w)), y: Math.round(Math.min(d.oy, d.oy + h)), w: Math.round(Math.abs(w)), h: Math.round(Math.abs(h)) }
      }))
      return
    }
    if (d.kind === 'move') {
      const dx = Math.round(p.x - d.sx), dy = Math.round(p.y - d.sy)
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 2) return
      if (!d.moved) { snapshot(); d.moved = true }
      apply(list.map((x) => { const o = d.orig.get(x.id); return o ? { ...x, x: o.x + dx, y: o.y + dy } : x }))
      return
    }
    if (d.kind === 'resize') {
      const o = d.orig
      const dx = p.x - d.sx, dy = p.y - d.sy
      if (o.type === 'line') {
        const next = d.handle === 'start'
          ? { x: Math.round(o.x + dx), y: Math.round(o.y + dy), w: Math.round(o.w - dx), h: Math.round(o.h - dy) }
          : { w: Math.round(o.w + dx), h: Math.round(o.h + dy) }
        apply(list.map((x) => (x.id === o.id ? { ...x, ...next } : x)))
        return
      }
      let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h
      if (d.handle.includes('w')) x1 += dx
      if (d.handle.includes('e')) x2 += dx
      if (d.handle.includes('n')) y1 += dy
      if (d.handle.includes('s')) y2 += dy
      // Shift on a corner keeps the proportions.
      if (e.shiftKey && d.handle.length === 2 && o.w > 0 && o.h > 0) {
        const h = Math.abs(x2 - x1) * (o.h / o.w)
        if (d.handle.includes('n')) y1 = y2 - h
        else y2 = y1 + h
      }
      const next = { x: Math.round(Math.min(x1, x2)), y: Math.round(Math.min(y1, y2)), w: Math.max(1, Math.round(Math.abs(x2 - x1))), h: Math.max(1, Math.round(Math.abs(y2 - y1))) }
      apply(list.map((x) => (x.id === o.id ? { ...x, ...next } : x)))
      return
    }
    if (d.kind === 'marquee') {
      const m = { x: Math.min(d.sx, p.x), y: Math.min(d.sy, p.y), w: Math.abs(p.x - d.sx), h: Math.abs(p.y - d.sy) }
      setMarquee(m)
      // Frames are picked only when the box covers them, so dragging inside a frame picks what's in it.
      const hit = list.filter((x) => {
        const b = box(x)
        return x.type === 'frame'
          ? m.x <= b.x && m.y <= b.y && m.x + m.w >= b.x + b.w && m.y + m.h >= b.y + b.h
          : intersects(m, { ...b, w: Math.max(b.w, 1), h: Math.max(b.h, 1) })
      }).map((x) => x.id)
      setSel([...new Set([...d.base, ...hit])])
    }
  }

  const onBoardUp = (): void => {
    const d = drag.current
    drag.current = null
    setMarquee(null)
    if (!d || !docRef.current || d.kind !== 'draw') return
    const list = docRef.current.elements
    const el = list.find((x) => x.id === d.id)
    if (!el) return
    // A click without a drag gets a sensible size.
    const size = el.type === 'line' && Math.abs(el.w) + Math.abs(el.h) < 4 ? { w: 160, h: 0 }
      : el.type === 'frame' && el.w < 4 && el.h < 4 ? { w: 390, h: 844 }
        : (el.type === 'rect' || el.type === 'ellipse') && el.w < 4 && el.h < 4 ? { w: 100, h: 100 } : null
    if (size) apply(list.map((x) => (x.id === el.id ? { ...x, ...size } : x)))
    setTool('select')
    if (el.type === 'text') setEditing(el.id)
  }

  /** Double-click edits text. Pointer capture sends the event to the board, so find the layer under the pointer. */
  const onBoardDouble = (e: React.MouseEvent): void => {
    if (tool !== 'select') return
    const hit = document.elementsFromPoint(e.clientX, e.clientY).map((n) => n.closest('[data-id]')?.getAttribute('data-id')).find(Boolean)
    const el = hit ? docRef.current?.elements.find((x) => x.id === hit) : null
    if (el?.type === 'text') { setSel([el.id]); setEditing(el.id) }
  }

  // ---------- keyboard ----------
  useEffect(() => {
    if (!doc) return
    const down = (e: KeyboardEvent): void => {
      if (isTyping(e.target) || editing) return
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (k === ' ') { space.current = true; e.preventDefault(); return }
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return }
      if (mod && k === 'y') { e.preventDefault(); redo(); return }
      if (mod && k === 'd') { e.preventDefault(); duplicate(sel); return }
      if (mod && k === 'c') { clip.current = selected.map((x) => ({ ...x })); return }
      if (mod && k === 'x') { clip.current = selected.map((x) => ({ ...x })); remove(sel); return }
      if (mod && k === 'v') { e.preventDefault(); paste(); return }
      if (mod && k === 'a') { e.preventDefault(); setSel(els.map((x) => x.id)); return }
      if (mod || e.altKey) return
      if (k === 'delete' || k === 'backspace') { e.preventDefault(); remove(sel); return }
      if (k === 'escape') { setSel([]); setTool('select'); return }
      if (k === 'enter' && one?.type === 'text') { e.preventDefault(); setEditing(one.id); return }
      if (e.shiftKey && (k === '!' || e.code === 'Digit1')) { fit(els); return }
      if (e.shiftKey && (k === ')' || e.code === 'Digit0')) { zoomAt(1 / viewRef.current.zoom); return }
      if (k === ']' || k === '}') { arrange(e.shiftKey ? 'front' : 'forward'); return }
      if (k === '[' || k === '{') { arrange(e.shiftKey ? 'back' : 'backward'); return }
      if (k.startsWith('arrow') && sel.length) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0
        const dy = k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0
        update(sel, (x) => ({ x: x.x + dx, y: x.y + dy }))
        return
      }
      if (KEY_TOOL[k]) setTool(KEY_TOOL[k])
    }
    const up = (e: KeyboardEvent): void => { if (e.key === ' ') space.current = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  })

  // ---------- export ----------
  const exportAs = async (kind: 'svg' | 'png'): Promise<void> => {
    const target = one?.type === 'frame' ? [one, ...childrenOf(one, els)] : selected.length ? selected : els
    const area = unionBox(target)
    if (!area || !file) return
    const pad = one?.type === 'frame' ? 0 : 16
    const a = { x: area.x - pad, y: area.y - pad, w: area.w + pad * 2, h: area.h + pad * 2 }
    const svg = toSvg(target, a)
    const name = one?.type === 'frame' ? `${file.name} - ${one.name ?? 'Frame'}` : file.name
    try {
      const f = kind === 'svg'
        ? await window.tyslin.studio.write(projectId, { kind: 'svg', name }, svg)
        : await window.tyslin.studio.write(projectId, { kind: 'png', name }, await svgToPng(svg, a.w, a.h), 'base64')
      setNotice(`Saved ${f.path}`)
      void window.tyslin.studio.reveal(projectId, f.path)
    } catch (e) {
      setNotice(`Couldn't export: ${errorText(e)}`)
    }
  }

  // ---------- prompt ----------
  const generate = async (): Promise<void> => {
    const req = prompt.trim()
    if (!req || !doc || busy) return
    setBusy(true); setAiNote(null)
    const editingSel = aiMode === 'edit' && selected.length > 0
    const fs = FRAME_SIZES.find((s) => s.id === size) ?? FRAME_SIZES[0]
    const r = await window.tyslin.studio.ask(agentId, projectId, editingSel ? editPrompt(req, selected) : designPrompt(req, { w: fs.w, h: fs.h, label: fs.label }), `Canvas: ${file?.name ?? 'design'}`)
    setBusy(false)
    if (!r.ok) { setAiNote({ ok: false, text: r.error ?? 'The model could not answer.', sessionId: r.sessionId }); return }
    const j = extractJson(r.reply)
    const raw = Array.isArray(j?.elements) ? (j!.elements as unknown[]) : null
    if (!raw) { setAiNote({ ok: false, text: 'The reply had no layers I could read. Try again, or open the chat to see what came back.', sessionId: r.sessionId }); return }
    const cur = docRef.current!.elements
    if (editingSel) {
      const selIds = new Set(selected.map((x) => x.id))
      const back = raw.map((x) => cleanEl(x)).filter((x): x is CanvasEl => !!x)
        // An id the model reused from outside the selection becomes a new layer.
        .map((x) => (!selIds.has(x.id) && cur.some((c) => c.id === x.id) ? { ...x, id: uid() } : x))
      const changed = back.filter((b) => selIds.has(b.id))
      const added = back.filter((b) => !selIds.has(b.id))
      // Changed layers stay where they were in the order; new ones go after the last selected layer.
      const lastIdx = Math.max(...cur.map((x, i) => (selIds.has(x.id) ? i : -1)))
      const next: CanvasEl[] = []
      cur.forEach((x, i) => {
        if (selIds.has(x.id)) { const nx = changed.find((b) => b.id === x.id); if (nx) next.push(nx) } else next.push(x)
        if (i === lastIdx) next.push(...added)
      })
      commit(next)
      setSel(back.map((b) => b.id))
      const removed = selIds.size - changed.length
      setAiNote({ ok: true, text: `Changed ${changed.length}, added ${added.length}${removed ? `, removed ${removed}` : ''}.`, sessionId: r.sessionId })
      return
    }
    // New design: a frame to the right of everything else, holding the layers.
    const u = unionBox(cur)
    const fx = u ? Math.round(u.x + u.w + 120) : 0
    const fy = u ? Math.round(u.y) : 0
    const name = typeof j!.name === 'string' && j!.name.trim() ? String(j!.name).trim().slice(0, 80) : req.slice(0, 40)
    const frame: CanvasEl = { ...DEFAULTS.frame, id: uid(), name, x: fx, y: fy, w: fs.w, h: fs.h }
    const kids = raw.map((x) => cleanEl(x, false)).filter((x): x is CanvasEl => !!x)
      .map((x) => ({ ...x, type: x.type === 'frame' ? 'rect' as const : x.type, x: x.x + fx, y: x.y + fy }))
    commit([...cur, frame, ...kids])
    setSel([frame.id])
    setTab('design')
    requestAnimationFrame(() => fit([frame]))
    setAiNote({ ok: true, text: `Added "${frame.name}" with ${kids.length} layers.`, sessionId: r.sessionId })
  }

  // ---------- render ----------
  const z = view.zoom
  const edEl = editing ? byId.get(editing) : null
  const canUndo = past.current.length > 0, canRedo = future.current.length > 0

  const renderEl = (el: CanvasEl): JSX.Element => {
    const b = box(el)
    const common = {
      'data-id': el.id,
      onPointerDown: (e: React.PointerEvent) => onElDown(e, el),
      opacity: el.opacity
    }
    const stroke = el.stroke !== 'none' && el.strokeWidth > 0 ? { stroke: el.stroke, strokeWidth: el.strokeWidth } : {}
    switch (el.type) {
      case 'frame':
        return (
          <g key={el.id} data-id={el.id} opacity={el.opacity}>
            {/* The name label always picks the frame; its body does too while it's empty. With layers inside,
                dragging on the body draws a selection box, as in other design tools. */}
            <text x={b.x} y={b.y - 6 / z} fontSize={12 / z} className="cv-frame-label" onPointerDown={(e) => onElDown(e, el)}>{el.name ?? 'Frame'}</text>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={el.radius} fill={el.fill} {...stroke}
              onPointerDown={(e) => { if (!childrenOf(el, els).length) onElDown(e, el) }} />
          </g>
        )
      case 'rect': return <rect key={el.id} {...common} x={b.x} y={b.y} width={b.w} height={b.h} rx={el.radius} fill={el.fill} {...stroke} />
      case 'ellipse': return <ellipse key={el.id} {...common} cx={b.x + b.w / 2} cy={b.y + b.h / 2} rx={b.w / 2} ry={b.h / 2} fill={el.fill} {...stroke} />
      case 'line':
        return (
          <g key={el.id} {...common}>
            <line x1={el.x} y1={el.y} x2={el.x + el.w} y2={el.y + el.h} stroke="transparent" strokeWidth={Math.max(el.strokeWidth, 12 / z)} />
            <line x1={el.x} y1={el.y} x2={el.x + el.w} y2={el.y + el.h} stroke={el.stroke} strokeWidth={el.strokeWidth} strokeLinecap="round" />
            {el.arrow && <polygon points={arrowHead(el)} fill={el.stroke} />}
          </g>
        )
      case 'text':
        return (
          <foreignObject key={el.id} {...common} x={b.x} y={b.y} width={Math.max(b.w, 1)} height={Math.max(b.h, 1)} overflow="visible">
            <div className="cv-text" style={{ fontSize: el.fontSize, fontWeight: el.fontWeight, color: el.color, textAlign: el.align, visibility: editing === el.id ? 'hidden' : undefined }}>
              {el.text || ' '}
            </div>
          </foreignObject>
        )
    }
  }

  const handles = (el: CanvasEl): JSX.Element[] => {
    const s = 8 / z
    if (el.type === 'line') {
      return ([['start', el.x, el.y], ['end', el.x + el.w, el.y + el.h]] as const).map(([h, x, y]) => (
        <rect key={h} x={x - s / 2} y={y - s / 2} width={s} height={s} strokeWidth={1 / z} className="cv-handle" style={{ cursor: CURSOR[h] }} onPointerDown={(e) => onHandleDown(e, el, h)} />
      ))
    }
    const b = box(el)
    const pos: Record<string, [number, number]> = {
      nw: [b.x, b.y], n: [b.x + b.w / 2, b.y], ne: [b.x + b.w, b.y], e: [b.x + b.w, b.y + b.h / 2],
      se: [b.x + b.w, b.y + b.h], s: [b.x + b.w / 2, b.y + b.h], sw: [b.x, b.y + b.h], w: [b.x, b.y + b.h / 2]
    }
    return HANDLES.filter((h) => el.type !== 'text' || !['n', 's'].includes(h)).map((h) => (
      <rect key={h} x={pos[h][0] - s / 2} y={pos[h][1] - s / 2} width={s} height={s} strokeWidth={1 / z} className="cv-handle" style={{ cursor: CURSOR[h] }} onPointerDown={(e) => onHandleDown(e, el, h)} />
    ))
  }

  return (
    <div className="studio">
      <StudioFiles kind="canvas" title="Canvas" newLabel="New design" allLabel="All designs" projects={projects} projectId={projectId}
        selected={file?.path ?? null} onSelect={(f) => void open(f)} refreshKey={refresh}
        onNew={(n) => void create(n)} onDelete={async (f) => { await window.tyslin.studio.remove(projectId, f.path); if (file?.path === f.path) void open(null); setRefresh((r) => r + 1) }} />
      <div className="studio-main">
        {!doc ? (
          <StudioOverview kind="canvas" title="Canvas" newLabel="New design" projectId={projectId} refreshKey={refresh}
            intro={<>Design screens, slides and diagrams. Draw frames, shapes, lines and text by hand, or describe what you want and the default model lays it out. Designs are saved in the project folder under <code className="mono">canvas/</code>; exports go to <code className="mono">exports/</code>.</>}
            onOpen={(f) => void open(f)} onNew={(n) => void create(n)} />
        ) : (
          <>
            <div className="studio-bar cv-bar">
              <strong className="studio-title">{file?.name}</strong>
              <span className="hint">{SAVE_LABEL[save]}</span>
              <div className="cv-tools" role="toolbar" aria-label="Tools">
                {TOOLS.map(([t, icon, label, key]) => (
                  <button key={t} type="button" className={'cv-tool' + (tool === t ? ' on' : '')} aria-pressed={tool === t} title={`${label} (${key})`} aria-label={label} onClick={() => setTool(t)}>
                    <Icon name={icon} size={16} />
                  </button>
                ))}
              </div>
              <span style={{ flex: 1 }} />
              <button type="button" className="cv-tool" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={undo}><Icon name="undo" size={15} /></button>
              <button type="button" className="cv-tool" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!canRedo} onClick={redo}><Icon name="redo" size={15} /></button>
              <span className="cv-sep" />
              <button type="button" className="cv-tool" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.25)}><Icon name="minus" size={14} /></button>
              <button type="button" className="cv-zoom mono" title="Zoom to fit (Shift+1)" onClick={() => fit(els)}>{Math.round(z * 100)}%</button>
              <button type="button" className="cv-tool" aria-label="Zoom in" onClick={() => zoomAt(1.25)}><Icon name="plus" size={14} /></button>
              <span className="cv-sep" />
              <button type="button" className="btn btn-sm" disabled={!els.length} onClick={() => void exportAs('png')} title={one?.type === 'frame' ? 'Export the selected frame' : selected.length ? 'Export the selection' : 'Export everything'}><Icon name="download" size={13} /> PNG</button>
              <button type="button" className="btn btn-sm" disabled={!els.length} onClick={() => void exportAs('svg')} title="Export as SVG">SVG</button>
            </div>
            <div className="studio-split">
              <div ref={boardRef} className={'cv-board cv-mode-' + tool} tabIndex={0} aria-label="Canvas board"
                onPointerDown={onBoardDown} onPointerMove={onBoardMove} onPointerUp={onBoardUp} onPointerCancel={onBoardUp} onDoubleClick={onBoardDouble}
                style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${24 * z}px ${24 * z}px` }}>
                <svg className="cv-svg" width="100%" height="100%">
                  <g transform={`translate(${view.x} ${view.y}) scale(${z})`}>
                    {els.map(renderEl)}
                    {selected.map((el) => { const b = box(el); return el.type === 'line' ? null : <rect key={'s' + el.id} x={b.x} y={b.y} width={b.w} height={b.h} className="cv-sel" strokeWidth={1.5 / z} /> })}
                    {one && !editing && handles(one)}
                    {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} className="cv-marquee" strokeWidth={1 / z} />}
                  </g>
                </svg>
                {edEl && (
                  <textarea className="cv-text-edit" autoFocus rows={1} value={edEl.text ?? ''} aria-label="Text"
                    style={{ left: edEl.x * z + view.x, top: edEl.y * z + view.y, width: Math.max(edEl.w, 40) * z, minHeight: edEl.h * z, fontSize: (edEl.fontSize ?? 24) * z, fontWeight: edEl.fontWeight, color: edEl.color, textAlign: edEl.align }}
                    onChange={(e) => {
                      const t = e.target
                      const h = Math.round(Math.max((edEl.fontSize ?? 24) * 1.3, t.scrollHeight / z))
                      update([edEl.id], () => ({ text: t.value, h }), false)
                    }}
                    onFocus={(e) => { const t = e.target; t.setSelectionRange(t.value.length, t.value.length) }}
                    onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); (e.target as HTMLTextAreaElement).blur() } }}
                    onBlur={() => {
                      const cur = docRef.current?.elements.find((x) => x.id === edEl.id)
                      setEditing(null)
                      // Empty text boxes don't stay.
                      if (cur && !(cur.text ?? '').trim()) { apply(docRef.current!.elements.filter((x) => x.id !== edEl.id)); setSel([]) }
                    }}
                    onPointerDown={(e) => e.stopPropagation()} />
                )}
                {!els.length && <p className="cv-empty hint">Pick a tool above (F frame, R rectangle, T text) and draw, or describe a design in the Prompt tab.</p>}
                {notice && <button type="button" className="cv-notice" onClick={() => setNotice(null)}>{notice}</button>}
              </div>
              <aside className="studio-side cv-side">
                <div className="seg cv-tabs" role="tablist" aria-label="Panel">
                  <button type="button" role="tab" aria-selected={tab === 'design'} className={tab === 'design' ? 'on' : ''} onClick={() => setTab('design')}><Icon name="layers" size={13} /> Design</button>
                  <button type="button" role="tab" aria-selected={tab === 'ai'} className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}><Icon name="sparkle" size={13} /> Prompt</button>
                </div>
                {tab === 'design'
                  ? <DesignPanel els={els} selected={selected} sel={sel} setSel={setSel} update={update} remove={remove} duplicate={duplicate} arrange={arrange} align={align} />
                  : (
                    <div className="cv-ai">
                      <label className="field" style={{ gap: 4 }}><span className="label">Model or agent</span><AgentSelect agents={agents} value={agentId} onChange={setAgentId} /></label>
                      <div className="seg" role="group" aria-label="What to do">
                        <button type="button" className={aiMode === 'new' || !selected.length ? 'on' : ''} aria-pressed={aiMode === 'new' || !selected.length} onClick={() => setAiMode('new')}>New design</button>
                        <button type="button" className={aiMode === 'edit' && selected.length ? 'on' : ''} aria-pressed={aiMode === 'edit' && !!selected.length} disabled={!selected.length} onClick={() => setAiMode('edit')}>Change selection</button>
                      </div>
                      {aiMode === 'new' || !selected.length ? (
                        <label className="field" style={{ gap: 4 }}>
                          <span className="label">Frame size</span>
                          <select className="select" value={size} onChange={(e) => setSize(e.target.value)}>
                            {FRAME_SIZES.map((s) => <option key={s.id} value={s.id}>{s.label} ({s.w} × {s.h})</option>)}
                          </select>
                        </label>
                      ) : <span className="hint">{selected.length} {selected.length === 1 ? 'layer' : 'layers'} selected. The model changes, adds or removes layers as you ask.</span>}
                      <label className="field" style={{ gap: 4 }}>
                        <span className="label">{aiMode === 'edit' && selected.length ? 'What to change' : 'Describe the design'}</span>
                        <textarea className="textarea" rows={6} value={prompt} onChange={(e) => setPrompt(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void generate() } }}
                          placeholder={aiMode === 'edit' && selected.length ? 'e.g. Make the buttons lime with dark text and add a secondary button' : 'e.g. Pricing page with three plans, a monthly/yearly toggle and an FAQ'} />
                      </label>
                      <button type="button" className="btn btn-primary" disabled={busy || !prompt.trim()} onClick={() => void generate()}>
                        <Icon name="sparkle" size={13} /> {busy ? 'Designing…' : aiMode === 'edit' && selected.length ? 'Change selection' : 'Generate design'}
                      </button>
                      {aiNote && (
                        <p className={'hint ' + (aiNote.ok ? 'ok' : 'account-error')} role="status">
                          {aiNote.text}{' '}
                          {aiNote.sessionId && <button type="button" className="link-btn" onClick={() => onOpenChat(agentId, projectId, aiNote.sessionId)}>Open chat</button>}
                        </p>
                      )}
                      <p className="hint">Each request runs as a chat (with the Studio assistant for "Default model"), so it shows in the status bar and can be stopped there. Ctrl+Enter sends.</p>
                    </div>
                  )}
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface DesignProps {
  els: CanvasEl[]
  selected: CanvasEl[]
  sel: string[]
  setSel: (ids: string[]) => void
  update: (ids: string[], patch: (e: CanvasEl) => Partial<CanvasEl>, record?: boolean) => void
  remove: (ids: string[]) => void
  duplicate: (ids: string[]) => void
  arrange: (how: 'front' | 'forward' | 'backward' | 'back') => void
  align: (how: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') => void
}

const TYPE_ICON: Record<CanvasElType, IconName> = { frame: 'frame', rect: 'square', ellipse: 'circle', text: 'type', line: 'line' }
const layerName = (e: CanvasEl): string => e.name ?? (e.type === 'text' ? (e.text ?? '').split('\n')[0].slice(0, 40) || 'Text' : TYPE_LABEL[e.type])

/** Right panel, Design tab: the selected layer's properties, alignment for several, and the layer list. */
function DesignPanel({ els, selected, sel, setSel, update, remove, duplicate, arrange, align }: DesignProps): JSX.Element {
  const one = selected.length === 1 ? selected[0] : null
  const ids = selected.map((e) => e.id)
  const numField = (label: string, key: 'x' | 'y' | 'w' | 'h', e: CanvasEl): JSX.Element => (
    <label className="cv-num"><span>{label}</span>
      <input className="input mono" type="number" value={Math.round(e[key])} onChange={(ev) => {
        const v = parseFloat(ev.target.value)
        if (Number.isFinite(v)) update([e.id], () => ({ [key]: (key === 'w' || key === 'h') && e.type !== 'line' ? Math.max(1, v) : v }))
      }} />
    </label>
  )
  const colorField = (label: string, value: string, set: (c: string) => void, allowNone: boolean): JSX.Element => (
    <div className="cv-color">
      <span className="label">{label}</span>
      <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
        <input type="color" aria-label={`${label} colour`} value={hex(value === 'none' ? undefined : value, '#D9D9D9')} onChange={(e) => set(e.target.value.toUpperCase())} />
        <input className="input mono" aria-label={`${label} value`} value={value} onChange={(e) => set(e.target.value)}
          onBlur={(e) => set(cleanEl({ type: 'rect', fill: e.target.value })?.fill ?? 'none')} />
        {allowNone && <button type="button" className="btn btn-sm" onClick={() => set(value === 'none' ? '#D9D9D9' : 'none')}>{value === 'none' ? 'Add' : 'None'}</button>}
      </div>
    </div>
  )

  return (
    <div className="cv-design">
      {one && (
        <section className="cv-props" aria-label="Properties">
          <div className="cv-props-head"><Icon name={TYPE_ICON[one.type]} size={14} /><strong>{TYPE_LABEL[one.type]}</strong></div>
          <label className="field" style={{ gap: 4 }}><span className="label">Name</span>
            <input className="input" value={one.name ?? ''} placeholder={layerName(one)} onChange={(e) => update(ids, () => ({ name: e.target.value || undefined }))} />
          </label>
          <div className="cv-grid">{numField('X', 'x', one)}{numField('Y', 'y', one)}{numField(one.type === 'line' ? 'ΔX' : 'W', 'w', one)}{numField(one.type === 'line' ? 'ΔY' : 'H', 'h', one)}</div>
          {one.type === 'text' ? (
            <>
              <label className="field" style={{ gap: 4 }}><span className="label">Text</span>
                <textarea className="textarea" rows={3} value={one.text ?? ''} onChange={(e) => update(ids, () => ({ text: e.target.value }))} />
              </label>
              <div className="cv-grid">
                <label className="cv-num"><span>Size</span><input className="input mono" type="number" min={4} value={one.fontSize ?? 24} onChange={(e) => { const v = parseFloat(e.target.value); if (v > 0) update(ids, (x) => ({ fontSize: v, h: Math.max(x.h, Math.round(v * 1.3)) })) }} /></label>
                <label className="cv-num"><span>Weight</span>
                  <select className="select" value={one.fontWeight ?? 400} onChange={(e) => update(ids, () => ({ fontWeight: Number(e.target.value) }))}>
                    {[300, 400, 500, 600, 700, 800].map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                </label>
              </div>
              {colorField('Colour', one.color ?? '#0F0F0D', (c) => update(ids, () => ({ color: c === 'none' ? '#0F0F0D' : c })), false)}
              <div className="seg" role="group" aria-label="Text alignment">
                {(['left', 'center', 'right'] as const).map((a) => <button key={a} type="button" className={one.align === a ? 'on' : ''} aria-pressed={one.align === a} onClick={() => update(ids, () => ({ align: a }))}>{a[0].toUpperCase() + a.slice(1)}</button>)}
              </div>
            </>
          ) : (
            <>
              {one.type !== 'line' && colorField('Fill', one.fill, (c) => update(ids, () => ({ fill: c })), true)}
              {colorField('Stroke', one.stroke, (c) => update(ids, (x) => ({ stroke: c, strokeWidth: c !== 'none' && !x.strokeWidth ? 1 : x.strokeWidth })), one.type !== 'line')}
              <div className="cv-grid">
                <label className="cv-num"><span>Stroke width</span><input className="input mono" type="number" min={0} value={one.strokeWidth} onChange={(e) => { const v = parseFloat(e.target.value); if (v >= 0) update(ids, () => ({ strokeWidth: v })) }} /></label>
                {(one.type === 'rect' || one.type === 'frame') && <label className="cv-num"><span>Radius</span><input className="input mono" type="number" min={0} value={one.radius} onChange={(e) => { const v = parseFloat(e.target.value); if (v >= 0) update(ids, () => ({ radius: v })) }} /></label>}
              </div>
              {one.type === 'line' && (
                <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={!!one.arrow} onChange={(e) => update(ids, () => ({ arrow: e.target.checked }))} /> Arrow at the end</label>
              )}
            </>
          )}
          <label className="cv-num cv-opacity"><span>Opacity</span>
            <input type="range" min={0} max={100} value={Math.round(one.opacity * 100)} onChange={(e) => update(ids, () => ({ opacity: Number(e.target.value) / 100 }))} />
            <span className="mono">{Math.round(one.opacity * 100)}%</span>
          </label>
        </section>
      )}
      {selected.length > 1 && (
        <section className="cv-props" aria-label="Selection">
          <div className="cv-props-head"><strong>{selected.length} layers</strong></div>
          <div className="cv-align" role="group" aria-label="Align">
            {([['left', 'Left'], ['hcenter', 'Centre'], ['right', 'Right'], ['top', 'Top'], ['vcenter', 'Middle'], ['bottom', 'Bottom']] as const).map(([a, l]) => (
              <button key={a} type="button" className="btn btn-sm" onClick={() => align(a)}>{l}</button>
            ))}
          </div>
        </section>
      )}
      {selected.length > 0 && (
        <div className="cv-actions">
          <button type="button" className="btn btn-sm" onClick={() => arrange('front')} title="Bring to front (Shift+])">To front</button>
          <button type="button" className="btn btn-sm" onClick={() => arrange('back')} title="Send to back (Shift+[)">To back</button>
          <button type="button" className="btn btn-sm" onClick={() => duplicate(ids)} title="Duplicate (Ctrl+D)">Duplicate</button>
          <button type="button" className="btn btn-sm cv-danger" onClick={() => remove(ids)} title="Delete (Delete)"><Icon name="trash" size={12} /> Delete</button>
        </div>
      )}
      <section aria-label="Layers">
        <span className="section-label" style={{ padding: 0 }}>Layers</span>
        {els.length === 0 ? <p className="hint">No layers yet.</p> : (
          <ul className="cv-layers">
            {[...els].reverse().map((e) => (
              <li key={e.id}>
                <button type="button" className={'cv-layer' + (sel.includes(e.id) ? ' on' : '')} aria-pressed={sel.includes(e.id)}
                  onClick={(ev) => setSel(ev.shiftKey ? (sel.includes(e.id) ? sel.filter((x) => x !== e.id) : [...sel, e.id]) : [e.id])}>
                  <Icon name={TYPE_ICON[e.type]} size={13} /><span>{layerName(e)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="hint cv-keys"><strong>Keys:</strong> V move · F frame · R rectangle · O ellipse · L line · T text · H or Space hand · Ctrl+wheel zoom · Shift+1 fit · Ctrl+D duplicate · [ ] order · Delete</p>
    </div>
  )
}
