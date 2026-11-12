import { useEffect, useRef, useState } from 'react'
import { renderAsync } from 'docx-preview'
import { cn } from '@/lib/utils'

/** Paper on the panel's own background; docx-preview's grey wrapper would fight the theme. */
const SHADOW_CSS = `
:host { display: block; }
.docx-wrapper { background: transparent !important; padding: 16px 0 32px !important; }
.docx-wrapper > section.docx { box-shadow: 0 1px 4px rgb(0 0 0 / 0.18); margin-bottom: 16px !important; }
`

/**
 * A .docx drawn in the window by docx-preview (Apache-2.0), inside a shadow root so the document's styles
 * can't touch the app's. Images become data URLs (the renderer CSP has no blob:). Links never navigate the
 * app: web links open in the browser through the window-open handler, anything else is dropped.
 */
export function WordView({ projectId, path, nonce, zoom, className }: { projectId: string; path: string; nonce: number; zoom: number; className?: string }): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | string>('loading')

  useEffect(() => {
    const el = host.current
    if (!el) return
    let live = true
    setState('loading')
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' })
    root.replaceChildren()
    const style = document.createElement('style')
    style.textContent = SHADOW_CSS
    const docStyles = document.createElement('div')
    const body = document.createElement('div')
    root.append(style, docStyles, body)
    void window.tyslin.preview.bytes(projectId, path)
      .then((bytes) => renderAsync(bytes, body, docStyles, { inWrapper: true, breakPages: true, useBase64URL: true, renderComments: false, renderChanges: false, experimental: false }))
      .then(() => {
        if (!live) return
        for (const a of Array.from(body.querySelectorAll('a'))) {
          const href = a.getAttribute('href') ?? ''
          if (href.startsWith('#')) continue
          if (/^(https?:|mailto:)/i.test(href)) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noreferrer') } else a.removeAttribute('href')
        }
        setState('ready')
      })
      .catch((e: unknown) => { if (live) setState(e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e)) })
    return () => { live = false }
  }, [projectId, path, nonce])

  return (
    <div className={cn('relative overflow-auto', className)}>
      {state === 'loading' && <p className="absolute inset-x-0 top-4 text-center text-[13px] text-muted-foreground">Opening the document…</p>}
      {state !== 'loading' && state !== 'ready' && <p className="p-4 text-[13px] text-destructive" role="alert">This document could not be shown: {state}</p>}
      <div ref={host} style={{ zoom }} aria-label={`Document ${path}`} />
    </div>
  )
}
