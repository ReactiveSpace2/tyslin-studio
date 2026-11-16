import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Attachment, PreviewFile } from '@shared/types'
import { ARTBOARD_PRESETS, DESIGN_BOARD_FILE, layoutArtboards, parseDesignBoard, type DesignBoardDoc } from '@shared/pages'
import { previewUrl } from '@shared/preview'
import type { AgencyView } from '../../agencies'
import { firstName } from '../../boardStats'
import { Icon } from '../../components/Icon'
import { Pose } from '../../components/Pose'
import { usePageWatch } from './usePageData'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/** What the editor inside an artboard (main/designEditor.ts) says about the part the boss picked. */
interface Picked {
  tag: string; label: string; text: string | null; canEditText: boolean; canParent: boolean
  color: string; background: string; fontSize: number; fontWeight: string; radius: number; padding: number; align: string
  width: number; height: number
}
type Tool = 'move' | 'edit'

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
/** "rgb(12, 34, 56)" → "#0c2238"; transparent → ''. */
function toHex(css: string): string {
  const m = /rgba?\(([^)]+)\)/.exec(css)
  if (!m) return ''
  const [r, g, b, a] = m[1].split(',').map((x) => parseFloat(x))
  if (a === 0) return ''
  return '#' + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')
}
const BLANK = (title: string, w: number, h: number, styles: boolean): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title.replace(/</g, '')}</title>
${styles ? '<link rel="stylesheet" href="styles.css">\n' : ''}<style>body{margin:0}.artboard{width:${w}px;min-height:${h}px;box-sizing:border-box;padding:48px;font-family:system-ui,sans-serif}</style>
</head>
<body>
<main class="artboard">
<h1>${title.replace(/</g, '')}</h1>
<p>Double-click any text to change it, or ask the designer to draw here.</p>
</main>
</body>
</html>
`

/**
 * The Design board (Design team, 17 Nov 2026; an approved custom surface, like Preview): every artboard listed in
 * design/board.json, drawn live at its real size on a canvas you can pan and zoom. Move tool: drag the canvas or an
 * artboard's name to move it. Edit tool: click a part of an artboard to pick it, double-click text to change it, and
 * change colours, sizes and spacing in the side panel. Hand edits save straight into the artboard's file (the boss's own
 * edit, like Files); Undo puts the previous version back. The designer's writes show as soon as they land.
 */
export function DesignBoard({ view, onSend, className }: { view: AgencyView; onSend?: (text: string, attachments: Attachment[]) => Promise<void>; className?: string }): JSX.Element {
  const projectId = view.project.id
  const designer = view.workers[0] ? firstName(view.workers[0].name) : 'the designer'
  const lead = view.lead ? firstName(view.lead.name) : 'the Lead'
  const tick = usePageWatch(view.agency.id, (p) => p.startsWith('design/'))
  const [doc, setDoc] = useState<DesignBoardDoc | null | 'missing'>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const boardMtime = useRef<number | null>(null)
  const [tool, setTool] = useState<Tool>('edit')
  const [zoom, setZoom] = useState(0.25)
  const [pan, setPan] = useState({ x: 40, y: 60 })
  const fitted = useRef(false)
  const [picked, setPicked] = useState<{ file: string; info: Picked } | null>(null)
  const [reload, setReload] = useState<Record<string, number>>({})
  const shown = useRef<Record<string, number>>({})
  const ownSaves = useRef<Record<string, number>>({})
  const texts = useRef<Record<string, { text: string; mtime: number }>>({})
  const undo = useRef<Record<string, string[]>>({})
  const redo = useRef<Record<string, string[]>>({})
  const lastFile = useRef<string | null>(null)
  const queue = useRef<Record<string, Promise<void>>>({})
  const frames = useRef<Record<string, HTMLIFrameElement | null>>({})
  const space = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ file: string; dx: number; dy: number } | null>(null)
  const [hasStyles, setHasStyles] = useState(false)
  const flash = (t: string): void => { setNote(t); window.setTimeout(() => setNote((n) => (n === t ? '' : n)), 4000) }

  // board.json and every artboard's last change; a file the designer changed (not our own save) reloads.
  useEffect(() => {
    let live = true
    void (async () => {
      let next: DesignBoardDoc | 'missing'
      try {
        const t = await window.tyslin.drive.readText(projectId, DESIGN_BOARD_FILE)
        boardMtime.current = t.mtimeMs
        next = parseDesignBoard(t.text)
        setError('')
      } catch (e) {
        const msg = errText(e)
        if (/ENOENT|no such file|not found/i.test(msg)) { boardMtime.current = null; next = 'missing' } else { if (live) setError(msg); return }
      }
      let files: PreviewFile[] = []
      try { files = await window.tyslin.preview.list(projectId) } catch { /* keep the frames as they are */ }
      if (!live) return
      setHasStyles(await window.tyslin.drive.readText(projectId, 'design/styles.css').then(() => true, () => false))
      if (!live) return
      const changed: Record<string, number> = {}
      for (const f of files) {
        const was = shown.current[f.path]
        if (was === undefined) { shown.current[f.path] = f.updatedAt; continue }
        if (f.updatedAt !== was && f.updatedAt !== ownSaves.current[f.path]) { changed[f.path] = f.updatedAt; delete texts.current[f.path] }
        shown.current[f.path] = f.updatedAt
      }
      if (Object.keys(changed).length) setReload((r) => ({ ...r, ...changed }))
      setDoc(next)
    })()
    return () => { live = false }
  }, [projectId, tick])

  const placed = useMemo(() => (doc && doc !== 'missing' ? layoutArtboards(doc) : []), [doc])

  const fit = useCallback((): void => {
    const el = space.current
    if (!el || !placed.length) return
    const minX = Math.min(...placed.map((a) => a.x)), minY = Math.min(...placed.map((a) => a.y))
    const maxX = Math.max(...placed.map((a) => a.x + a.width)), maxY = Math.max(...placed.map((a) => a.y + a.height))
    const z = Math.max(0.03, Math.min(1, (el.clientWidth - 80) / (maxX - minX), (el.clientHeight - 100) / (maxY - minY)))
    setZoom(z)
    setPan({ x: 40 - minX * z, y: 60 - minY * z })
  }, [placed])
  // After the panel has its final size (a fit on the first render used a shorter box).
  useEffect(() => { if (!fitted.current && placed.length) { fitted.current = true; requestAnimationFrame(() => requestAnimationFrame(fit)) } }, [placed, fit])

  const send = (file: string, msg: Record<string, unknown>): void => { frames.current[file]?.contentWindow?.postMessage({ tyslin: 1, ...msg }, '*') }
  useEffect(() => { for (const a of placed) send(a.file, { type: 'mode', mode: tool }) }, [tool, placed])

  /** The file as it is on disk, for undo and the "changed meanwhile" check. */
  const base = async (file: string): Promise<{ text: string; mtime: number }> => {
    if (!texts.current[file]) { const t = await window.tyslin.drive.readText(projectId, file); texts.current[file] = { text: t.text, mtime: t.mtimeMs } }
    return texts.current[file]
  }
  const write = (file: string, html: string, history: 'undo' | 'redo' | 'edit'): Promise<void> => {
    const run = async (): Promise<void> => {
      try {
        const b = await base(file)
        if (b.text === html) return
        const r = await window.tyslin.drive.writeText(projectId, file, html, b.mtime)
        if (!r.ok) {
          texts.current[file] = { text: r.text, mtime: r.mtimeMs }
          setReload((x) => ({ ...x, [file]: r.mtimeMs }))
          flash(`${designer} changed this artboard meanwhile, so it shows their version now. Make your change again.`)
          return
        }
        if (history === 'edit') { (undo.current[file] ??= []).push(b.text); redo.current[file] = [] }
        else if (history === 'undo') (redo.current[file] ??= []).push(b.text)
        else (undo.current[file] ??= []).push(b.text)
        texts.current[file] = { text: html, mtime: r.mtimeMs }
        ownSaves.current[file] = r.mtimeMs
        shown.current[file] = r.mtimeMs
        lastFile.current = file
      } catch (e) { flash(`Not saved: ${errText(e)}`) }
    }
    const next = (queue.current[file] ?? Promise.resolve()).then(run)
    queue.current[file] = next
    return next
  }
  const step = async (dir: 'undo' | 'redo', file = picked?.file ?? lastFile.current): Promise<void> => {
    if (!file) return
    const stack = (dir === 'undo' ? undo : redo).current[file]
    const html = stack?.pop()
    if (html === undefined) { flash(dir === 'undo' ? 'Nothing to undo on this artboard.' : 'Nothing to redo.'); return }
    await write(file, html, dir)
    setPicked(null)
    setReload((x) => ({ ...x, [file]: Date.now() }))
  }

  // Messages from the editors inside the artboards.
  useEffect(() => {
    const on = (e: MessageEvent): void => {
      const m = e.data as { tyslin?: number; type?: string; html?: string; none?: boolean } & Partial<Picked>
      if (!m || m.tyslin !== 1) return
      const file = Object.keys(frames.current).find((f) => frames.current[f]?.contentWindow === e.source)
      if (!file) return
      if (m.type === 'ready') { send(file, { type: 'mode', mode: tool }); void base(file).catch(() => undefined); return }
      if (m.type === 'select') {
        if (m.none) { setPicked((p) => (p?.file === file ? null : p)); return }
        for (const f of Object.keys(frames.current)) if (f !== file) send(f, { type: 'deselect' })
        setPicked({ file, info: m as unknown as Picked })
        lastFile.current = file
        return
      }
      if (m.type === 'html' && typeof m.html === 'string') { void write(file, m.html, 'edit'); return }
      if (m.type === 'undo' || m.type === 'redo') void step(m.type, file)
    }
    window.addEventListener('message', on)
    return () => window.removeEventListener('message', on)
  })

  const saveBoard = async (next: DesignBoardDoc): Promise<void> => {
    try {
      const r = await window.tyslin.drive.writeText(projectId, DESIGN_BOARD_FILE, JSON.stringify(next, null, 2) + '\n', boardMtime.current)
      if (!r.ok) { setDoc(parseDesignBoard(r.text)); boardMtime.current = r.mtimeMs; flash(`${designer} changed the board meanwhile. Try again.`); return }
      boardMtime.current = r.mtimeMs
      setDoc(next)
    } catch (e) { flash(`Not saved: ${errText(e)}`) }
  }
  const addArtboard = async (presetId: string): Promise<void> => {
    const p = ARTBOARD_PRESETS.find((x) => x.id === presetId)
    if (!p) return
    const current = doc && doc !== 'missing' ? doc : { artboards: [] }
    let n = 1
    while (current.artboards.some((a) => a.file === `design/${p.id}-${n}.html`)) n++
    const file = `design/${p.id}-${n}.html`
    const title = `${p.label} ${n}`
    const right = placed.length ? Math.max(...placed.map((a) => a.x + a.width)) + 80 : 0
    try {
      await window.tyslin.drive.writeText(projectId, file, BLANK(title, p.width, p.height, hasStyles), null)
      // Every artboard gets a fixed place once the boss arranges the board, so the new one lands at the right end.
      await saveBoard({ artboards: [...placed.map((a) => ({ ...a })), { file, title, width: p.width, height: p.height, x: right, y: 0 }] })
      fitted.current = false
    } catch (e) { flash(`Couldn't add it: ${errText(e)}`) }
  }

  // Panning and zooming the canvas; dragging an artboard's name moves it.
  const panning = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const onWheel = (e: React.WheelEvent): void => {
    if (e.ctrlKey || e.metaKey) {
      const r = space.current!.getBoundingClientRect()
      const cx = e.clientX - r.left, cy = e.clientY - r.top
      const z = Math.min(2, Math.max(0.03, zoom * Math.exp(-e.deltaY * 0.0015)))
      setPan({ x: cx - (cx - pan.x) * (z / zoom), y: cy - (cy - pan.y) * (z / zoom) })
      setZoom(z)
    } else setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
  }
  const zoomBy = (f: number): void => {
    const el = space.current
    const cx = (el?.clientWidth ?? 0) / 2, cy = (el?.clientHeight ?? 0) / 2
    const z = Math.min(2, Math.max(0.03, zoom * f))
    setPan({ x: cx - (cx - pan.x) * (z / zoom), y: cy - (cy - pan.y) * (z / zoom) })
    setZoom(z)
  }
  const onDown = (e: React.PointerEvent): void => {
    if (e.button !== 0 && e.button !== 1) return
    if ((e.target as HTMLElement).closest('[data-artboard-name]')) return
    panning.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent): void => {
    if (panning.current) setPan({ x: panning.current.px + e.clientX - panning.current.x, y: panning.current.py + e.clientY - panning.current.y })
    else if (drag) setDrag((d) => (d ? { ...d, dx: d.dx + e.movementX / zoom, dy: d.dy + e.movementY / zoom } : d))
  }
  const onUp = (): void => {
    panning.current = null
    if (drag) {
      const d = drag
      setDrag(null)
      if (Math.abs(d.dx) + Math.abs(d.dy) > 2) void saveBoard({ artboards: placed.map((a) => (a.file === d.file ? { ...a, x: Math.round(a.x + d.dx), y: Math.round(a.y + d.dy) } : { ...a })) })
    }
  }

  const sel = picked?.info
  const style = (prop: string, value: string | null): void => { if (picked) send(picked.file, { type: 'style', prop, value }) }
  const pickedBoard = picked ? placed.find((a) => a.file === picked.file) : undefined

  if (error) return <p className={cn('p-4 text-sm text-destructive', className)} role="alert">{error}</p>
  if (doc === null) return <p className={cn('p-4 text-sm text-muted-foreground', className)}>Loading the board…</p>

  return (
    <div className={cn('flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-background', className)}>
      <div className="flex flex-none flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5">
        <ToggleGroup type="single" spacing={1} value={tool} onValueChange={(v) => { if (v) setTool(v as Tool) }} aria-label="Tool">
          <ToggleGroupItem value="edit" className="h-9 gap-1.5 px-3 text-xs data-[state=on]:bg-accent" aria-label="Edit: pick parts of an artboard"><Icon name="cursor" size={14} /> Edit</ToggleGroupItem>
          <ToggleGroupItem value="move" className="h-9 gap-1.5 px-3 text-xs data-[state=on]:bg-accent" aria-label="Move: drag the canvas and artboards"><Icon name="hand" size={14} /> Move</ToggleGroupItem>
        </ToggleGroup>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-9"><Icon name="plus" size={14} /> Artboard</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {(['Web', 'App', 'Social', 'Print'] as const).map((g, i) => (
              <DropdownMenuGroup key={g}>
                {i > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-xs text-muted-foreground">{g}</DropdownMenuLabel>
                {ARTBOARD_PRESETS.filter((p) => p.group === g).map((p) => (
                  <DropdownMenuItem key={p.id} onSelect={() => void addArtboard(p.id)} className="justify-between">{p.label}<span className="font-mono text-[11px] text-muted-foreground">{p.width} × {p.height}</span></DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="mx-1 h-5 w-px bg-border" />
        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="size-9" aria-label="Undo" onClick={() => void step('undo')}><Icon name="undo" size={14} /></Button></TooltipTrigger><TooltipContent>Undo (Ctrl+Z on the artboard)</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="size-9" aria-label="Redo" onClick={() => void step('redo')}><Icon name="redo" size={14} /></Button></TooltipTrigger><TooltipContent>Redo</TooltipContent></Tooltip>
        <span className="flex-1" />
        {note && <span className="max-w-[360px] truncate text-xs text-muted-foreground" role="status" title={note}>{note}</span>}
        <Button variant="ghost" size="icon" className="size-9" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.25)}><Icon name="minus" size={14} /></Button>
        <span className="w-12 text-center font-mono text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="icon" className="size-9" aria-label="Zoom in" onClick={() => zoomBy(1.25)}><Icon name="plus" size={14} /></Button>
        <Button variant="outline" size="sm" className="h-9" onClick={fit}>Fit</Button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div ref={space} onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          className={cn('relative min-w-0 flex-1 overflow-hidden bg-muted bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-[size:16px_16px] select-none', panning.current ? 'cursor-grabbing' : tool === 'move' ? 'cursor-grab' : '')}
          aria-label="Design board canvas" role="region">
          {doc === 'missing' || !placed.length ? (
            <Empty className="absolute inset-0 m-auto h-fit max-w-md border border-dashed border-border bg-background">
              <EmptyHeader>
                <EmptyMedia><Pose pose={5} height={110} /></EmptyMedia>
                <EmptyTitle>No artboards yet</EmptyTitle>
                <EmptyDescription>Ask {lead} for designs in the chat: {designer} draws them here, live. Or add an empty artboard with + Artboard and change it yourself.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
              {placed.map((a) => {
                const moving = drag?.file === a.file
                const x = a.x + (moving ? drag!.dx : 0), y = a.y + (moving ? drag!.dy : 0)
                const on = picked?.file === a.file
                return (
                  <div key={a.file} className="absolute" style={{ left: x, top: y, width: a.width }}>
                    <div data-artboard-name className="absolute bottom-full left-0 flex w-full items-center gap-2 pb-2" style={{ fontSize: 13 / zoom }}
                      onPointerDown={(e) => { if (e.button === 0) { e.stopPropagation(); setDrag({ file: a.file, dx: 0, dy: 0 }); (space.current as HTMLElement).setPointerCapture(e.pointerId) } }}>
                      <span className={cn('cursor-move truncate font-medium', on ? 'text-foreground' : 'text-muted-foreground')} title={`${a.title} · ${a.file} · drag to move`}>{a.title}</span>
                      <span className="flex-none font-mono text-muted-foreground" style={{ fontSize: 11 / zoom }}>{a.width} × {a.height}</span>
                      <span className="flex-1" />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`${a.title}: export and more`} style={{ width: 28 / zoom, height: 28 / zoom }} onPointerDown={(e) => e.stopPropagation()}><Icon name="more" size={14 / zoom} /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => void window.tyslin.preview.exportPng(projectId, a.file, a.width, a.height).then((p) => { if (p) flash(`Saved ${p}`) }).catch((e) => flash(errText(e)))}><Icon name="download" size={14} /> Export as PNG</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => void window.tyslin.preview.exportPdf(projectId, a.file).then((p) => { if (p) flash(`Saved ${p}`) }).catch((e) => flash(errText(e)))}><Icon name="file" size={14} /> Download as PDF</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => void window.tyslin.drive.open(projectId, a.file)}><Icon name="open" size={14} /> Open in its app</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setReload((r) => ({ ...r, [a.file]: Date.now() }))}><Icon name="reload" size={14} /> Reload</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className={cn('overflow-hidden bg-white shadow-sm', on ? 'outline-2 outline-lime' : 'outline-1 outline-border-strong')} style={{ width: a.width, height: a.height, outlineStyle: 'solid', outlineWidth: (on ? 2 : 1) / zoom }}>
                      <iframe
                        key={`${a.file}#${reload[a.file] ?? 0}`}
                        ref={(el) => { frames.current[a.file] = el }}
                        title={`Artboard: ${a.title}`}
                        src={`${previewUrl(projectId, a.file)}?edit=1`}
                        sandbox="allow-scripts allow-same-origin"
                        referrerPolicy="no-referrer"
                        style={{ width: a.width, height: a.height, pointerEvents: tool === 'edit' && !drag && !panning.current ? 'auto' : 'none' }}
                        className="block border-0 bg-white"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {sel && picked && (
          <aside className="flex w-[264px] flex-none flex-col gap-3 overflow-y-auto border-l border-border p-3" aria-label="Selected part">
            <div className="flex items-start justify-between gap-2">
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-mono text-xs" title={sel.label}>{sel.label}</span>
                <span className="truncate text-xs text-muted-foreground">{pickedBoard?.title} · {sel.width} × {sel.height}</span>
              </span>
              <Button variant="ghost" size="icon" className="size-8 flex-none" aria-label="Clear the selection" onClick={() => { send(picked.file, { type: 'deselect' }); setPicked(null) }}><Icon name="close" size={14} /></Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {sel.canParent && <Button variant="outline" size="sm" className="h-8" onClick={() => send(picked.file, { type: 'parent' })}>Select parent</Button>}
              <Button variant="outline" size="sm" className="h-8" onClick={() => send(picked.file, { type: 'duplicate' })}><Icon name="copy" size={13} /> Duplicate</Button>
              <Button variant="outline" size="sm" className="h-8 text-destructive" onClick={() => send(picked.file, { type: 'delete' })}><Icon name="trash" size={13} /> Delete</Button>
            </div>
            <Separator />
            {sel.text !== null && sel.canEditText && (
              <TextField key={picked.file + sel.label + sel.text} value={sel.text} onSave={(v) => send(picked.file, { type: 'text', value: v })} />
            )}
            {sel.text === null && sel.canEditText && <Button variant="outline" size="sm" className="h-8 self-start" onClick={() => send(picked.file, { type: 'editText' })}><Icon name="type" size={13} /> Edit the text on the artboard</Button>}
            <ColorField id="ds-color" label="Text colour" value={toHex(sel.color)} onChange={(v) => style('color', v)} />
            <ColorField id="ds-fill" label="Fill" value={toHex(sel.background)} onChange={(v) => style('background-color', v)} onClear={() => style('background-color', 'transparent')} />
            <div className="grid grid-cols-2 gap-2">
              <NumberField id="ds-size" label="Text size" value={sel.fontSize} onChange={(v) => style('font-size', `${v}px`)} />
              <div className="flex flex-col gap-1">
                <Label htmlFor="ds-weight" className="text-xs">Weight</Label>
                <Select value={String(Math.round(Number(sel.fontWeight) / 100) * 100 || 400)} onValueChange={(v) => style('font-weight', v)}>
                  <SelectTrigger id="ds-weight" className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{['300', '400', '500', '600', '700', '800'].map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <NumberField id="ds-radius" label="Corners" value={sel.radius} onChange={(v) => style('border-radius', `${v}px`)} />
              <NumberField id="ds-pad" label="Padding" value={sel.padding} onChange={(v) => style('padding', `${v}px`)} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium">Align</span>
              <ToggleGroup type="single" spacing={1} value={['left', 'center', 'right'].includes(sel.align) ? sel.align : (sel.align === 'start' ? 'left' : sel.align === 'end' ? 'right' : '')} onValueChange={(v) => { if (v) style('text-align', v) }} aria-label="Text align">
                {(['left', 'center', 'right'] as const).map((v) => <ToggleGroupItem key={v} value={v} className="h-8 flex-1 text-xs capitalize data-[state=on]:bg-accent">{v}</ToggleGroupItem>)}
              </ToggleGroup>
            </div>
            {onSend && <AskDesigner key={picked.file + sel.label} who={lead} designer={designer} onSend={(req) => onSend(`On the Design board, artboard "${pickedBoard?.title ?? picked.file}" (${picked.file}), the part I selected (${sel.label}${sel.text ? `: "${sel.text.trim().slice(0, 80)}"` : ''}): ${req}`, [])} />}
            <p className="text-xs leading-relaxed text-muted-foreground">Changes save into {picked.file} as you make them. Ctrl+Z on the artboard, or Undo above, puts the last version back.</p>
          </aside>
        )}
      </div>
    </div>
  )
}

function TextField({ value, onSave }: { value: string; onSave: (v: string) => void }): JSX.Element {
  const [v, setV] = useState(value)
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="ds-text" className="text-xs">Text</Label>
      <Textarea id="ds-text" rows={3} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== value) onSave(v) }} className="min-h-0 text-sm" />
    </div>
  )
}

function ColorField({ id, label, value, onChange, onClear }: { id: string; label: string; value: string; onChange: (v: string) => void; onClear?: () => void }): JSX.Element {
  const [hex, setHex] = useState(value)
  useEffect(() => setHex(value), [value])
  const commit = (v: string): void => { if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v) }
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label} picker`} value={hex || '#ffffff'} onChange={(e) => { setHex(e.target.value); commit(e.target.value) }} className="size-9 flex-none cursor-pointer rounded-md border border-border bg-transparent p-0.5" />
        <Input id={id} value={hex} placeholder="none" onChange={(e) => setHex(e.target.value)} onBlur={() => commit(hex)} onKeyDown={(e) => { if (e.key === 'Enter') commit(hex) }} className="h-9 font-mono text-xs" />
        {onClear && <Button variant="ghost" size="sm" className="h-9 px-2 text-xs" onClick={onClear}>None</Button>}
      </div>
    </div>
  )
}

function NumberField({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }): JSX.Element {
  const [v, setV] = useState(String(Math.round(value)))
  useEffect(() => setV(String(Math.round(value))), [value])
  const commit = (): void => { const n = Number(v); if (Number.isFinite(n) && n >= 0 && n !== Math.round(value)) onChange(n) }
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} type="number" min={0} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit() }} className="h-9 font-mono text-xs" />
    </div>
  )
}

function AskDesigner({ who, designer, onSend }: { who: string; designer: string; onSend: (text: string) => Promise<void> }): JSX.Element {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async (): Promise<void> => {
    if (!text.trim()) return
    setBusy(true)
    try { await onSend(text.trim()); setText('') } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Separator />
      <Label htmlFor="ds-ask" className="text-xs">Ask for a change</Label>
      <Textarea id="ds-ask" rows={2} value={text} placeholder={`Tell ${designer} what to change about this part…`} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void go() }} className="min-h-0 text-sm" />
      <Button variant="lime" size="sm" className="h-9 self-start font-semibold" disabled={busy || !text.trim()} onClick={() => void go()}><Icon name="send" size={13} /> Send to {who}</Button>
    </div>
  )
}
