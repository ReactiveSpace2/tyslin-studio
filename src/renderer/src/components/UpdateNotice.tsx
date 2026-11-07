import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

const BOX = 'flex flex-col gap-1.5 rounded-lg border border-green bg-lime-soft p-3'
const LABEL = 'font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground'
const TITLE = 'text-sm font-semibold'

/** Sidebar card shown only when there is something to act on: a download in progress or a new version. */
export function UpdateNotice(): JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    void window.tyslin.updates.status().then(setStatus)
    return window.tyslin.updates.onStatus(setStatus)
  }, [])

  if (!status) return null
  const v = status.version ? `v${status.version}` : 'A new version'

  if (status.state === 'downloading') {
    return (
      <div className={BOX} role="status">
        <span className={LABEL}>Update</span>
        <strong className={TITLE}>Downloading {v}…</strong>
        <Progress value={status.percent ?? 0} aria-hidden="true"
          className="h-1.5 bg-card [&>[data-slot=progress-indicator]]:bg-lime [&>[data-slot=progress-indicator]]:duration-300" />
      </div>
    )
  }
  if (status.state === 'ready') {
    return (
      <div className={BOX} role="status">
        <span className={LABEL}>Update ready</span>
        <strong className={TITLE}>{v} is ready to install</strong>
        <Button variant="lime" size="sm" className="mt-0.5 self-start" onClick={() => void window.tyslin.updates.install()}>
          Restart to update
        </Button>
      </div>
    )
  }
  if (status.state === 'available') {
    return (
      <div className={BOX} role="status">
        <span className={LABEL}>Update available</span>
        <strong className={TITLE}>{v} is out</strong>
        <span className="text-xs text-muted-foreground">You have v{status.currentVersion}.</span>
        <Button variant="lime" size="sm" className="mt-0.5 self-start" onClick={() => void window.tyslin.updates.openDownload()}>
          Download
        </Button>
      </div>
    )
  }
  return null
}
