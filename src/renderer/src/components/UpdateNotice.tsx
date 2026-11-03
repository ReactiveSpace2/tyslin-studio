import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/types'

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
      <div className="update" role="status">
        <span className="section-label" style={{ padding: 0 }}>Update</span>
        <strong>Downloading {v}…</strong>
        <div className="update-bar" aria-hidden="true">
          <span style={{ width: `${status.percent ?? 0}%` }} />
        </div>
      </div>
    )
  }
  if (status.state === 'ready') {
    return (
      <div className="update" role="status">
        <span className="section-label" style={{ padding: 0 }}>Update ready</span>
        <strong>{v} is ready to install</strong>
        <button type="button" className="btn btn-lime btn-sm" onClick={() => void window.tyslin.updates.install()}>
          Restart to update
        </button>
      </div>
    )
  }
  if (status.state === 'available') {
    return (
      <div className="update" role="status">
        <span className="section-label" style={{ padding: 0 }}>Update available</span>
        <strong>{v} is out</strong>
        <span>You have v{status.currentVersion}.</span>
        <button type="button" className="btn btn-lime btn-sm" onClick={() => void window.tyslin.updates.openDownload()}>
          Download
        </button>
      </div>
    )
  }
  return null
}
