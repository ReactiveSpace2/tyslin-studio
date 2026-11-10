import { useEffect, useRef, useState } from 'react'
import { previewKind, previewUrl, VIEWPORTS, type Viewport } from '@shared/preview'
import { Markdown } from './Markdown'
import { cn } from '@/lib/utils'

interface Props {
  projectId: string
  path: string
  viewport: Viewport
  /** Bumped to reload the page. */
  nonce?: number
  className?: string
}

/**
 * The preview surface (the one approved custom piece of the Preview tab, 10 Nov 2026): a page, image, PDF or
 * Markdown file from the agency folder. Pages load in a sandboxed frame on the `tyslin-preview://` scheme,
 * which main confines to the project folder; the frame is laid out at the viewport's width and scaled down
 * to fit, so a 390 px phone mockup and a 1280 px page both fit the panel.
 */
export function FilePreview({ projectId, path, viewport, nonce = 0, className }: Props): JSX.Element {
  const kind = previewKind(path)
  const url = previewUrl(projectId, path)
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const vp = VIEWPORTS[viewport]
  const [md, setMd] = useState<string | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = (): void => setScale(Math.min(1, (el.clientWidth - 2) / vp.width))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [vp.width])

  useEffect(() => {
    if (kind !== 'markdown') { setMd(null); return }
    let live = true
    void window.tyslin.studio.read(projectId, path).then((t) => { if (live) setMd(t) }).catch(() => { if (live) setMd('Could not read this file.') })
    return () => { live = false }
  }, [kind, projectId, path, nonce])

  if (!kind) return <p className={cn('p-4 text-[13px] text-muted-foreground', className)}>This kind of file can't be shown here. Open it from Files instead.</p>

  if (kind === 'markdown') {
    return <div className={cn('overflow-y-auto px-5 py-4 text-sm leading-relaxed', className)}>{md === null ? <span className="text-muted-foreground">Loading…</span> : <Markdown text={md} />}</div>
  }

  if (kind === 'image') {
    return (
      <div ref={box} className={cn('flex items-start justify-center overflow-auto p-4', className)}>
        <img key={nonce} src={url} alt={path} style={{ maxWidth: Math.min(vp.width, Math.max(0, (box.current?.clientWidth ?? vp.width) - 32)) }} className="h-auto rounded-md border border-border bg-card" />
      </div>
    )
  }

  // Page or PDF: a fixed-size frame scaled to the panel. No popups, no top navigation; main blocks navigation off the scheme.
  const device = viewport !== 'desktop'
  return (
    <div ref={box} className={cn('overflow-x-hidden overflow-y-auto', className)}>
      <div style={{ width: vp.width * scale, height: vp.height * scale }} className={cn('relative mx-auto my-3 origin-top-left overflow-hidden bg-card shadow-md', device ? 'rounded-[22px] border-[6px] border-primary' : 'rounded-md border border-border-strong')}>
        <iframe
          key={`${url}#${nonce}`}
          title={`Preview of ${path}`}
          src={url}
          sandbox="allow-scripts allow-same-origin allow-forms"
          referrerPolicy="no-referrer"
          style={{ width: vp.width, height: vp.height, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          className="block border-0 bg-white"
        />
      </div>
    </div>
  )
}
