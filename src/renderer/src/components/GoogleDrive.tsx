import { useEffect, useState } from 'react'
import type { GDriveStatus } from '@shared/types'
import { Icon } from './Icon'

const ago = (t: number | null): string => {
  if (!t) return 'not yet'
  const m = Math.round((Date.now() - t) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}
const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))

/** Live Google Drive sync status, shared by Drive and the status bar. */
export function useGDrive(): GDriveStatus | null {
  const [s, setS] = useState<GDriveStatus | null>(null)
  useEffect(() => {
    void window.tyslin.gdrive.status().then(setS)
    return window.tyslin.gdrive.onStatus(setS)
  }, [])
  return s
}

/** Drive's Google Drive card: connect, sync now, automatic sync, open in Drive, disconnect. */
export function GoogleDriveCard(): JSX.Element | null {
  const s = useGDrive()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t) }, [])
  if (!s) return null
  const act = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true); setError(null)
    try { await fn() } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }

  return (
    <section className="gd-card" aria-label="Google Drive">
      <div className="gd-head">
        <span className="gd-ic"><Icon name="cloud" size={16} /></span>
        <strong>Google Drive</strong>
        {s.connected && <span className={'gd-dot' + (s.syncing ? ' busy' : s.lastError ? ' bad' : '')} aria-hidden="true" />}
      </div>
      {!s.connected ? (
        <>
          <p className="hint">Sync every project folder to your Google Drive, both ways. Tyslin only sees the files it puts there.</p>
          {s.configured
            ? <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void act(() => window.tyslin.gdrive.connect())}>{busy ? 'Waiting for Google…' : 'Connect Google Drive'}</button>
            : <p className="hint">This build has no Google sign-in, so Drive sync isn't available.</p>}
          {busy && <button type="button" className="link-btn" onClick={() => void window.tyslin.auth.cancelSignIn()}>Cancel</button>}
        </>
      ) : (
        <>
          <p className="hint gd-line" title={s.email}>{s.email || 'Connected'}</p>
          <p className="hint gd-line" role="status">
            {s.syncing ? `Syncing ${s.current ?? ''}…` : s.lastError ? <span className="account-error">{s.lastError}</span> : `Synced ${ago(s.lastSync)}`}
          </p>
          <div className="gd-actions">
            <button type="button" className="btn btn-sm" disabled={s.syncing || busy} onClick={() => void act(() => window.tyslin.gdrive.sync())}><Icon name="sync" size={12} /> Sync now</button>
            {s.folderUrl && <button type="button" className="btn btn-sm" onClick={() => void window.tyslin.gdrive.openFolder()}>Open in Drive</button>}
          </div>
          <label className="gd-auto"><input type="checkbox" checked={s.auto} onChange={(e) => void window.tyslin.gdrive.setAuto(e.target.checked)} /> Sync every {s.autoMinutes} minutes</label>
          <button type="button" className="link-btn gd-off" onClick={() => {
            if (window.confirm('Disconnect Google Drive? Files stay in both places; syncing stops.')) void act(() => window.tyslin.gdrive.disconnect())
          }}>Disconnect</button>
        </>
      )}
      {error && <p className="hint account-error" role="alert">{error}</p>}
    </section>
  )
}

/** A project's sync state, for its row in Drive. */
export function syncNote(s: GDriveStatus | null, projectId: string | null, defaultId: string | null): string {
  if (!s?.connected) return ''
  const p = s.projects.find((x) => x.id === (projectId ?? defaultId))
  if (!p) return ''
  if (s.syncing && s.current === p.name) return 'Syncing…'
  if (p.error) return 'Sync failed'
  return p.lastSync ? `Synced ${ago(p.lastSync)}` : 'Not synced yet'
}
