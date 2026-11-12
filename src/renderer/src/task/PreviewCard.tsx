import { useEffect, useState } from 'react'
import type { PreviewFile } from '@shared/types'
import { KIND_LABEL } from '@shared/preview'
import { FilePreview } from '../components/FilePreview'
import { Icon } from '../components/Icon'
import { Card } from '@/components/ui/card'

/** Inline cards per task: the newest few, so a long task doesn't fill with live frames. */
const MAX_CARDS = 4
const clock = (ms: number): string => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/**
 * Files the agency made or changed while this task was the current one (`since` = the task's start, `until` = the
 * agency's next task, if any): pages, images, PDFs and Office files, newest first. Markdown is left to the Preview
 * panel (notes and logs would crowd the thread). Reloaded whenever `refreshKey` changes (a run ended, a change was
 * accepted, a card moved).
 */
export function useMadeFiles(projectId: string | null, since: number | null, until: number | null, refreshKey: string): { shown: PreviewFile[]; more: number } {
  const [files, setFiles] = useState<PreviewFile[]>([])
  useEffect(() => {
    if (!projectId || since === null) { setFiles([]); return }
    let live = true
    void window.tyslin.preview.list(projectId).then((l) => { if (live) setFiles(l) }).catch(() => undefined)
    return () => { live = false }
  }, [projectId, since, refreshKey])
  if (since === null) return { shown: [], more: 0 }
  const mine = files.filter((f) => f.kind !== 'markdown' && f.updatedAt >= since && (until === null || f.updatedAt < until))
  return { shown: mine.slice(0, MAX_CARDS), more: Math.max(0, mine.length - MAX_CARDS) }
}

/**
 * A made file in the conversation (owner, 12 Nov 2026, after Claude's artifact card): the top of a page or image
 * shown live but not clickable inside, a foot with its name and kind, and the whole card opens it full screen in
 * Preview, where the close button brings the conversation back.
 */
export function PreviewCard({ projectId, file, onOpen }: { projectId: string; file: PreviewFile; onOpen: (path: string) => void }): JSX.Element {
  const name = file.path.split('/').pop() ?? file.path
  const visual = file.kind === 'page' || file.kind === 'image'
  return (
    <div className="pl-11">
      <Card className="group relative max-w-[560px] gap-0 overflow-hidden py-0 transition-colors hover:border-border-strong has-[button:focus-visible]:ring-[3px] has-[button:focus-visible]:ring-ring/40">
        {visual && (
          <div className="pointer-events-none relative h-[260px] overflow-hidden border-b border-border bg-muted" aria-hidden="true" {...{ inert: '' }}>
            <FilePreview projectId={projectId} path={file.path} viewport="desktop" nonce={Math.round(file.updatedAt)} className="h-full !overflow-hidden" />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-card/70 [mask-image:linear-gradient(to_top,black,transparent)]" />
          </div>
        )}
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="grid size-9 flex-none place-items-center rounded-lg border border-border bg-muted"><Icon name="file" size={15} /></span>
          <span className="flex min-w-0 flex-1 flex-col">
            <strong className="truncate text-sm font-semibold">{name}</strong>
            <span className="truncate text-xs text-muted-foreground">{KIND_LABEL[file.kind]} · updated <span className="font-mono">{clock(file.updatedAt)}</span>{file.path.includes('/') ? ` · ${file.path.slice(0, file.path.lastIndexOf('/'))}` : ''}</span>
          </span>
          <span className="grid size-9 flex-none place-items-center rounded-full border border-border bg-card text-muted-foreground group-hover:text-foreground"><Icon name="expand" size={14} /></span>
        </div>
        {/* One real button over the whole card: the frame inside never takes the click or the Tab key. */}
        <button type="button" className="absolute inset-0 cursor-pointer outline-none" aria-label={`Open ${name} full screen`} onClick={() => onOpen(file.path)} />
      </Card>
    </div>
  )
}
