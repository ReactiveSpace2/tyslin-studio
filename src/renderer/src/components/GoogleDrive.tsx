import { useEffect, useState } from 'react'
import type { GDriveStatus } from '@shared/types'
import { Icon } from './Icon'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
    <section className="tw flex flex-none flex-col gap-2 rounded-xl border border-border bg-card p-3 font-sans text-foreground shadow-xs" aria-label="Google Drive">
      <div className="flex items-center gap-2 text-sm">
        <span className="grid size-7 place-items-center rounded-md bg-muted"><Icon name="cloud" size={16} /></span>
        <strong className="font-semibold">Google Drive</strong>
        {s.connected && <span className={cn('ml-auto size-2 rounded-full', s.syncing ? 'animate-[au-pulse_1.2s_ease-in-out_infinite] bg-lime motion-reduce:animate-none' : s.lastError ? 'bg-destructive' : 'bg-green')} aria-hidden="true" />}
      </div>
      {!s.connected ? (
        <>
          <p className={HINT}>Sync every project folder to your Google Drive, both ways. Tyslin only sees the files it puts there.</p>
          {s.configured
            ? <Button size="sm" className="self-start" disabled={busy} onClick={() => void act(() => window.tyslin.gdrive.connect())}>{busy ? 'Waiting for Google…' : 'Connect Google Drive'}</Button>
            : <p className={HINT}>This build has no Google sign-in, so Drive sync isn't available.</p>}
          {busy && <button type="button" className={LINK} onClick={() => void window.tyslin.auth.cancelSignIn()}>Cancel</button>}
        </>
      ) : (
        <>
          <p className={cn(HINT, 'truncate')} title={s.email}>{s.email || 'Connected'}</p>
          <p className={cn(HINT, 'truncate')} role="status">
            {s.syncing ? `Syncing ${s.current ?? ''}…` : s.lastError ? <span className="text-destructive">{s.lastError}</span> : `Synced ${ago(s.lastSync)}`}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" disabled={s.syncing || busy} onClick={() => void act(() => window.tyslin.gdrive.sync())}><Icon name="sync" size={12} /> Sync now</Button>
            {s.folderUrl && <Button variant="outline" size="sm" onClick={() => void window.tyslin.gdrive.openFolder()}>Open in Drive</Button>}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" className="size-4 accent-green" checked={s.auto} onChange={(e) => void window.tyslin.gdrive.setAuto(e.target.checked)} /> Sync every {s.autoMinutes} minutes</label>
          <button type="button" className={LINK} onClick={() => {
            if (window.confirm('Disconnect Google Drive? Files stay in both places; syncing stops.')) void act(() => window.tyslin.gdrive.disconnect())
          }}>Disconnect</button>
        </>
      )}
      {error && <p className={cn(HINT, 'text-destructive')} role="alert">{error}</p>}
    </section>
  )
}

const HINT = 'text-[13px] leading-[1.45] text-muted-foreground'
const LINK = 'self-start text-[13px] text-green underline underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 rounded-sm'

/** A project's sync state, for its row in Drive. */
export function syncNote(s: GDriveStatus | null, projectId: string | null, defaultId: string | null): string {
  if (!s?.connected) return ''
  const p = s.projects.find((x) => x.id === (projectId ?? defaultId))
  if (!p) return ''
  if (s.syncing && s.current === p.name) return 'Syncing…'
  if (p.error) return 'Sync failed'
  return p.lastSync ? `Synced ${ago(p.lastSync)}` : 'Not synced yet'
}
