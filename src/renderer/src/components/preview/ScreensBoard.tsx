import { useEffect, useRef, useState } from 'react'
import type { PreviewFile } from '@shared/types'
import { KIND_LABEL, previewUrl, VIEWPORTS, type Viewport } from '@shared/preview'
import { Icon } from '../Icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const MAX_LIVE = 24
const FIT: Record<Viewport, number> = { phone: 0.42, tablet: 0.28, desktop: 0.2 }
const clamp = (z: number): number => Math.min(1, Math.max(0.1, Math.round(z * 100) / 100))

/**
 * The screens board (step 4 of the owner's Preview plan; the "canvas" of the artifact panel, 11 Nov 2026):
 * every page and image the agency made, side by side at one viewport width, live and scaled down. Frames can't
 * be clicked into; a click opens that file on its own. Ctrl/Cmd + wheel zooms. Part of the approved custom
 * preview surface; the controls around it are shadcn.
 */
export function ScreensBoard({ projectId, files, viewport, nonce, onOpen }: { projectId: string; files: PreviewFile[]; viewport: Viewport; nonce: number; onOpen: (path: string) => void }): JSX.Element {
  const [zoom, setZoom] = useState(FIT[viewport])
  const [more, setMore] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => setZoom(FIT[viewport]), [viewport])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const wheel = (e: WheelEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.1 : 0.9)))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])

  const screens = files.filter((f) => f.kind === 'page' || f.kind === 'image')
  const shown = more ? screens : screens.slice(0, MAX_LIVE)
  const vp = VIEWPORTS[viewport]
  const w = vp.width * zoom
  const h = vp.height * zoom

  if (!screens.length) return <p className="p-4 text-[13px] text-muted-foreground">No pages or images yet. Documents, sheets and PDFs open one at a time from the file list.</p>

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center gap-1 border-b border-border px-3 py-1.5">
        <span className="font-mono text-[11px] text-muted-foreground">{screens.length} screen{screens.length === 1 ? '' : 's'} at {vp.label} width</span>
        <Button variant="ghost" size="icon" className="ml-auto size-8" aria-label="Zoom out" onClick={() => setZoom((z) => clamp(z - 0.05))}><Icon name="minus" size={14} /></Button>
        <span className="w-10 text-center font-mono text-xs" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Zoom in" onClick={() => setZoom((z) => clamp(z + 0.05))}><Icon name="plus" size={14} /></Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setZoom(FIT[viewport])}>Fit</Button>
      </div>
      <div ref={box} className="min-h-0 flex-1 overflow-auto bg-muted p-5">
        <ul className="flex flex-wrap items-start gap-6">
          {shown.map((f) => (
            <li key={f.path} className="flex flex-col gap-1.5" style={{ width: w }}>
              <button type="button" onClick={() => onOpen(f.path)} aria-label={`Open ${f.path}`}
                className="relative block overflow-hidden rounded-md border border-border-strong bg-card shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring" style={{ width: w, height: h }}>
                {f.kind === 'image'
                  ? <img src={previewUrl(projectId, f.path)} alt="" loading="lazy" className="size-full object-contain object-top" />
                  : <iframe key={nonce} title={`Screen ${f.path}`} src={previewUrl(projectId, f.path)} loading="lazy" tabIndex={-1} sandbox="allow-scripts allow-same-origin"
                      referrerPolicy="no-referrer" className="pointer-events-none block border-0 bg-white" style={{ width: vp.width, height: vp.height, transform: `scale(${zoom})`, transformOrigin: 'top left' }} />}
              </button>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-mono text-[11px]" title={f.path}>{f.path}</span>
                <Badge variant="soft" className="flex-none font-mono text-[10px]">{KIND_LABEL[f.kind]}</Badge>
              </span>
            </li>
          ))}
        </ul>
        {!more && screens.length > MAX_LIVE && <Button variant="outline" size="sm" className="mt-5" onClick={() => setMore(true)}>Show all {screens.length}</Button>}
      </div>
    </div>
  )
}
