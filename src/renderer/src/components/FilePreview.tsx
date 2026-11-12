import { useEffect, useRef, useState } from 'react'
import { needsLibreOffice, previewKind, previewUrl, VIEWPORTS, type Viewport } from '@shared/preview'
import { Markdown } from './Markdown'
import { SheetView } from './preview/SheetView'
import { useOffice } from './preview/useOffice'
import { WordView } from './preview/WordView'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { cn } from '@/lib/utils'

interface Props {
  projectId: string
  path: string
  viewport: Viewport
  /** Bumped to reload the page. */
  nonce?: number
  /** Word, spreadsheets, Markdown and images (ArtifactToolbar's zoom menu). */
  zoom?: number
  className?: string
}

/**
 * The preview surface (the approved custom piece of the Preview tab, 10 Nov 2026; Office files 11 Nov 2026):
 * a file from the agency folder. Pages load in a sandboxed frame on the `tyslin-preview://` scheme, which main
 * confines to the project folder, laid out at the viewport's width and scaled to fit. PDFs fill the panel in
 * Chromium's viewer. Word and spreadsheets are drawn here (WordView, SheetView); slides and old Office formats
 * come back from main as a PDF converted by the user's LibreOffice (`?as=pdf`).
 */
export function FilePreview({ projectId, path, viewport, nonce = 0, zoom = 1, className }: Props): JSX.Element {
  const kind = previewKind(path)
  const url = previewUrl(projectId, path)
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  // How tall the surface is, so a page at Desktop width can fill it instead of stopping at 800 px (owner, 12 Nov 2026).
  const [boxH, setBoxH] = useState(0)
  const vp = VIEWPORTS[viewport]
  const [md, setMd] = useState<string | null>(null)
  const [frameReady, setFrameReady] = useState(false)
  const office = useOffice()

  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = (): void => { setScale(Math.min(1, (el.clientWidth - 2) / vp.width)); setBoxH(el.clientHeight) }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [vp.width, kind])

  useEffect(() => setFrameReady(false), [url, nonce])

  useEffect(() => {
    if (kind !== 'markdown') { setMd(null); return }
    let live = true
    void window.tyslin.studio.read(projectId, path).then((t) => { if (live) setMd(t) }).catch(() => { if (live) setMd('Could not read this file.') })
    return () => { live = false }
  }, [kind, projectId, path, nonce])

  if (!kind) return <p className={cn('p-4 text-[13px] text-muted-foreground', className)}>This kind of file can't be shown here. Open it from Files instead.</p>

  if (kind === 'markdown') {
    return <div className={cn('overflow-y-auto px-5 py-4 text-sm leading-relaxed', className)}><div style={{ zoom }}>{md === null ? <span className="text-muted-foreground">Loading…</span> : <Markdown text={md} />}</div></div>
  }

  if (kind === 'word') return <WordView projectId={projectId} path={path} nonce={nonce} zoom={zoom} className={className} />
  if (kind === 'sheet') return <SheetView projectId={projectId} path={path} nonce={nonce} zoom={zoom} className={className} />

  if (kind === 'image') {
    return (
      <div ref={box} className={cn('flex items-start justify-center overflow-auto p-4', className)}>
        <img key={nonce} src={url} alt={path} style={{ width: zoom === 1 ? undefined : `${zoom * 100}%`, maxWidth: zoom === 1 ? Math.min(vp.width, Math.max(0, (box.current?.clientWidth ?? vp.width) - 32)) : undefined }} className="h-auto rounded-md border border-border bg-card" />
      </div>
    )
  }

  // PDFs, and slides / old Office files as LibreOffice PDFs: the whole panel, Chromium's viewer brings its own zoom and pages.
  if (kind === 'pdf' || needsLibreOffice(kind)) {
    if (kind !== 'pdf' && office.available === false) {
      return (
        <Empty className={cn('m-4 border border-dashed border-border', className)}>
          <EmptyHeader>
            <EmptyTitle>LibreOffice shows this file</EmptyTitle>
            <EmptyDescription>
              Tyslin uses your own LibreOffice to show slides and older Office files, and to save Office files as PDF. Install it from{' '}
              <a href="https://www.libreoffice.org/download/" target="_blank" rel="noreferrer" className="text-green underline">libreoffice.org</a>, then look again.
            </EmptyDescription>
          </EmptyHeader>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={office.recheck}>Look again</Button>
            <Button variant="ghost" size="sm" onClick={() => void window.tyslin.drive.open(projectId, path)}>Open in its app</Button>
          </div>
        </Empty>
      )
    }
    return (
      <div className={cn('relative flex min-h-0 flex-col', className)}>
        {kind !== 'pdf' && !frameReady && <p className="absolute inset-x-0 top-6 text-center text-[13px] text-muted-foreground" role="status">Converting with LibreOffice…</p>}
        {office.available !== null || kind === 'pdf'
          ? <iframe key={`${url}#${nonce}`} title={`Preview of ${path}`} src={kind === 'pdf' ? url : previewUrl(projectId, path, true)}
              referrerPolicy="no-referrer" onLoad={() => setFrameReady(true)} className="block min-h-0 w-full flex-1 border-0" />
          : null}
      </div>
    )
  }

  // Page: a fixed-size frame scaled to the panel. No popups, no top navigation; main blocks navigation off the scheme.
  const device = viewport !== 'desktop'
  // Desktop: the frame is as tall as the panel (24 px for its margins), so the page shows at full length and scrolls
  // inside itself. Tablet and Phone keep the device's own height.
  const frameH = device ? vp.height : Math.max(vp.height, Math.floor((boxH - 24) / scale))
  return (
    <div ref={box} className={cn('overflow-x-hidden overflow-y-auto', className)}>
      <div style={{ width: vp.width * scale, height: frameH * scale }} className={cn('relative mx-auto my-3 origin-top-left overflow-hidden bg-card shadow-md', device ? 'rounded-[22px] border-[6px] border-primary' : 'rounded-md border border-border-strong')}>
        <iframe
          key={`${url}#${nonce}`}
          title={`Preview of ${path}`}
          src={url}
          sandbox="allow-scripts allow-same-origin allow-forms"
          referrerPolicy="no-referrer"
          style={{ width: vp.width, height: frameH, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          className="block border-0 bg-white"
        />
      </div>
    </div>
  )
}
