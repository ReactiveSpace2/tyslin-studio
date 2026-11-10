import { useEffect, useMemo, useRef, useState } from 'react'
import type { Agent, Attachment, PreviewFile } from '@shared/types'
import { previewKind, VIEWPORTS, type Viewport } from '@shared/preview'
import type { AgencyView } from '../agencies'
import { firstName } from '../boardStats'
import { FilePreview } from '../components/FilePreview'
import { Icon } from '../components/Icon'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

interface Props {
  view: AgencyView
  agent: Agent
  /** The file to show; null = the newest previewable file. */
  path: string | null
  onPath: (p: string) => void
  onSend: (text: string, attachments: Attachment[]) => Promise<void>
}

const VIEW_KEY = 'preview:viewport'
const savedViewport = (): Viewport => { try { const v = localStorage.getItem(VIEW_KEY); return v === 'desktop' || v === 'tablet' || v === 'phone' ? v : 'phone' } catch { return 'phone' } }

/**
 * The task's Preview panel: a picker of the files the agency made (newest first), Desktop / Tablet / Phone,
 * Reload, Open in your browser, the surface, and a note that goes to the agent with a screenshot of the
 * preview so the Lead or a worker can see what you see.
 */
export function PreviewPanel({ view, agent, path, onPath, onSend }: Props): JSX.Element {
  const [files, setFiles] = useState<PreviewFile[]>([])
  const [viewport, setViewportState] = useState<Viewport>(savedViewport)
  const setViewport = (v: Viewport): void => { setViewportState(v); try { localStorage.setItem(VIEW_KEY, v) } catch { /* per-window only */ } }
  const [nonce, setNonce] = useState(0)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const surface = useRef<HTMLDivElement>(null)
  const projectId = view.project.id

  const load = (): void => { void window.tyslin.preview.list(projectId).then(setFiles).catch(() => setFiles([])) }
  useEffect(load, [projectId])
  // A link to the web inside a page: main opened it in the browser; put the file back and say so.
  useEffect(() => window.tyslin.preview.onBlocked((url) => { setNonce((n) => n + 1); setStatus(`Links to the web open in your browser (${url.slice(0, 60)}).`) }), [])
  // A file opened from Changes or Details may not be listed yet (just written); keep it selectable.
  const options = useMemo(() => (path && !files.some((f) => f.path === path) && previewKind(path) ? [{ path, kind: previewKind(path)!, size: 0, updatedAt: Date.now() }, ...files] : files), [files, path])
  const current = path ?? options[0]?.path ?? null

  const send = async (): Promise<void> => {
    if (!current || sending) return
    setSending(true); setStatus(null)
    try {
      const el = surface.current
      const r = el?.getBoundingClientRect()
      const shot = r ? await window.tyslin.preview.capture({ x: r.left, y: r.top, width: r.width, height: r.height }, `${current.split('/').pop()}-${VIEWPORTS[viewport].label.toLowerCase()}.png`) : null
      const text = note.trim() || `Look at ${current} (screenshot attached).`
      await onSend(shot ? `${text}\n\n(Preview of ${current} at ${VIEWPORTS[viewport].label} width, screenshot attached.)` : text, shot ? [shot] : [])
      setNote('')
      setStatus(`Sent to ${firstName(agent.name)} with a screenshot.`)
    } catch (e) {
      setStatus(e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
    } finally { setSending(false) }
  }

  if (!current) {
    return (
      <Empty className="m-4 border border-dashed border-border">
        <EmptyHeader><EmptyTitle>Nothing to preview yet</EmptyTitle><EmptyDescription>Pages, images, PDFs and Markdown the agents make in {view.agency.name}'s folder show here.</EmptyDescription></EmptyHeader>
        <Button variant="outline" size="sm" onClick={load}>Look again</Button>
      </Empty>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
        <Select value={current} onValueChange={(v) => { onPath(v); setStatus(null) }}>
          <SelectTrigger className="h-8 min-w-0 max-w-[260px] flex-1 font-mono text-xs" aria-label="File to preview"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-[360px]">
            {options.map((f) => <SelectItem key={f.path} value={f.path} className="font-mono text-xs">{f.path}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Reload" title="Reload" onClick={() => { setNonce((n) => n + 1); load() }}><Icon name="reload" size={14} /></Button>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Open in your browser" title="Open in your browser" onClick={() => void window.tyslin.drive.open(projectId, current)}><Icon name="open" size={14} /></Button>
        <ToggleGroup type="single" spacing={1} value={viewport} onValueChange={(v) => { if (v) setViewport(v as Viewport) }} aria-label="Viewport" className="ml-auto">
          {(Object.keys(VIEWPORTS) as Viewport[]).map((v) => <ToggleGroupItem key={v} value={v} className="h-8 px-2.5 text-xs data-[state=on]:bg-accent" aria-label={`${VIEWPORTS[v].label}, ${VIEWPORTS[v].width} px`}>{VIEWPORTS[v].label}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>
      <div ref={surface} className="flex min-h-0 flex-1 flex-col bg-muted">
        <FilePreview projectId={projectId} path={current} viewport={viewport} nonce={nonce} className="min-h-0 flex-1" />
      </div>
      <form className="flex flex-none flex-col gap-2 border-t border-border px-3 py-2.5" onSubmit={(e) => { e.preventDefault(); void send() }}>
        {status && <p className="text-xs text-green" role="status">{status}</p>}
        <Label htmlFor="preview-note" className="text-xs">Tell {firstName(agent.name)} what to change</Label>
        <div className="flex items-center gap-2">
          <Input id="preview-note" className="h-9 text-[13px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="The button is too far from the field on phone" disabled={sending} />
          <Button type="submit" size="sm" className="h-9 flex-none" disabled={sending}>{sending ? 'Sending…' : 'Send with screenshot'}</Button>
        </div>
        <span className="text-[11px] leading-snug text-muted-foreground">Shown from the agency folder in a locked-down view: no network, only files inside {view.agency.name}'s folder. The screenshot goes into this task as an image.</span>
      </form>
    </div>
  )
}
