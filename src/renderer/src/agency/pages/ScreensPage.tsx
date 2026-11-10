import { useEffect, useState } from 'react'
import type { PreviewFile } from '@shared/types'
import { previewKind, previewUrl, VIEWPORTS, type Viewport } from '@shared/preview'
import type { AgencyView } from '../../agencies'
import { FilePreview } from '../../components/FilePreview'
import { Icon, type IconName } from '../../components/Icon'
import { Pose } from '../../components/Pose'
import { usePageWatch } from './usePageData'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const KIND: Record<PreviewFile['kind'], { label: string; icon: IconName }> = {
  page: { label: 'Page', icon: 'frame' },
  image: { label: 'Image', icon: 'art' },
  pdf: { label: 'PDF', icon: 'file' },
  markdown: { label: 'Markdown', icon: 'knowledge' }
}
const ago = (ms: number): string => {
  const m = Math.round((Date.now() - ms) / 60_000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`
}

/**
 * The Screens page (App Development, Mobile Apps, Web Design): every page, image, PDF and Markdown file the agency
 * made, newest first, from `preview:list`. A file opens in the task Preview's own surface (`FilePreview`) at
 * Desktop, Tablet or Phone width. No preview code of its own.
 */
export function ScreensPage({ view }: { view: AgencyView }): JSX.Element {
  const projectId = view.project.id
  const tick = usePageWatch(view.agency.id, (p) => !!previewKind(p))
  const [files, setFiles] = useState<PreviewFile[] | null>(null)
  const [open, setOpen] = useState<PreviewFile | null>(null)
  const [viewport, setViewport] = useState<Viewport>('desktop')

  useEffect(() => {
    let live = true
    window.tyslin.preview.list(projectId).then((f) => { if (live) setFiles(f) }).catch(() => { if (live) setFiles([]) })
    return () => { live = false }
  }, [projectId, tick])

  if (files === null) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (!files.length) {
    return (
      <Empty className="border border-dashed border-border">
        <EmptyHeader>
          <EmptyMedia><Pose pose={6} height={120} /></EmptyMedia>
          <EmptyTitle>No screens yet</EmptyTitle>
          <EmptyDescription>Pages, images, PDFs and Markdown files {view.agency.name}'s agents make in its folder show here, newest first.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <>
      <p className="font-mono text-xs text-muted-foreground">{files.length} file{files.length === 1 ? '' : 's'} · newest first</p>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {files.map((f) => (
          <li key={f.path} className="min-w-0">
            <Card className="h-full gap-0 overflow-hidden p-0 transition-colors hover:border-border-strong">
              <button type="button" onClick={() => setOpen(f)} className="flex h-full min-h-11 w-full flex-col text-left focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Open ${f.path}`}>
                <span className="flex aspect-[16/10] w-full items-center justify-center overflow-hidden border-b border-border bg-muted text-muted-foreground">
                  {f.kind === 'image'
                    ? <img src={previewUrl(projectId, f.path)} alt="" loading="lazy" className="size-full object-cover object-top" />
                    : <Icon name={KIND[f.kind].icon} size={28} />}
                </span>
                <span className="flex min-w-0 flex-col gap-1 px-3 py-2.5">
                  <span className="truncate font-mono text-[12.5px]" title={f.path}>{f.path}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="soft" className="font-mono text-[10.5px]">{KIND[f.kind].label}</Badge>
                    <span className="font-mono">{ago(f.updatedAt)}</span>
                  </span>
                </span>
              </button>
            </Card>
          </li>
        ))}
      </ul>
      <Dialog open={!!open} onOpenChange={(o) => { if (!o) setOpen(null) }}>
        <DialogContent className="flex h-[88vh] w-[min(1200px,94vw)] max-w-none flex-col gap-3 p-4 sm:max-w-none">
          {open && (
            <>
              <DialogHeader className="flex-row flex-wrap items-center justify-between gap-2 pr-8">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <DialogTitle className="truncate font-mono text-sm">{open.path}</DialogTitle>
                  <DialogDescription className="text-xs">{KIND[open.kind].label} · changed {ago(open.updatedAt)}</DialogDescription>
                </div>
                <div className="flex items-center gap-1.5">
                  <ToggleGroup type="single" spacing={1} value={viewport} onValueChange={(v) => { if (v) setViewport(v as Viewport) }} aria-label="Viewport">
                    {(Object.keys(VIEWPORTS) as Viewport[]).map((v) => <ToggleGroupItem key={v} value={v} className="h-9 px-3 text-xs data-[state=on]:bg-accent" aria-label={`${VIEWPORTS[v].label}, ${VIEWPORTS[v].width} px`}>{VIEWPORTS[v].label}</ToggleGroupItem>)}
                  </ToggleGroup>
                  <Button variant="outline" size="sm" className="h-9" onClick={() => void window.tyslin.drive.open(projectId, open.path)}><Icon name="open" size={14} /> Open</Button>
                </div>
              </DialogHeader>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md bg-muted">
                <FilePreview projectId={projectId} path={open.path} viewport={viewport} nonce={tick} className="min-h-0 flex-1" />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
