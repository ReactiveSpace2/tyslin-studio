import { useEffect, useState } from 'react'
import type { AdapterState } from '@shared/types'
import { Mark } from './RunsOnBadge'

/** Tyslin's own copies of Claude Code, Codex and Gemini CLI (main/adapterManager.ts), live. */
export function useAdapterStates(): AdapterState[] {
  const [list, setList] = useState<AdapterState[]>([])
  useEffect(() => {
    void window.tyslin.engines.adapters().then(setList).catch(() => undefined)
    return window.tyslin.engines.onAdapters(setList)
  }, [])
  return list
}

export const isBusy = (a: AdapterState): boolean => a.phase === 'installing' || a.phase === 'updating'

/** What one adapter is doing, in a few words. */
export function adapterLine(a: AdapterState): string {
  if (a.phase === 'installing') return a.detail ? `${a.detail} for ${a.name}…` : `Installing ${a.name}${a.to ? ` v${a.to}` : ''}…`
  if (a.phase === 'updating') return `Updating ${a.name} v${a.from} → v${a.to}…`
  if (a.phase === 'done') return a.from ? `${a.name} updated to v${a.to}` : `${a.name} v${a.to} installed`
  if (a.phase === 'checking') return 'Checking for updates…'
  if (a.phase === 'queued') return a.version ? 'Waiting to update…' : 'Waiting to install…'
  if (a.phase === 'error') return a.version ? `Couldn't update ${a.name}` : `Couldn't install ${a.name}`
  return a.version ? `Up to date · v${a.version}` : 'Not installed yet'
}

/** A lime bar sliding along while something downloads (a steady bar under reduced motion). */
export function BusyBar({ track = 'bg-card' }: { track?: string }): JSX.Element {
  return (
    <span className={`relative block h-1.5 w-full overflow-hidden rounded-full ${track}`} aria-hidden="true">
      <span className="absolute inset-y-0 w-[35%] animate-slide rounded-full bg-lime motion-reduce:left-0 motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-60" />
    </span>
  )
}

const SHOW_DONE_MS = 8000

/**
 * Floating card above the status bar while Tyslin installs or updates an adapter, then "updated to vX" for a few
 * seconds. Nothing to click: it only tells the user what is happening.
 */
export function AdapterNotice(): JSX.Element | null {
  const list = useAdapterStates()
  const [now, setNow] = useState(Date.now())
  const recent = list.filter((a) => a.phase === 'done' && a.at && now - a.at < SHOW_DONE_MS)
  useEffect(() => {
    if (!recent.length) return
    const t = setTimeout(() => setNow(Date.now()), 1000)
    return () => clearTimeout(t)
  }, [recent.length, now])
  const busy = list.filter(isBusy)
  const shown = busy.length ? busy : recent
  if (!shown.length) return null
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-green bg-lime-soft p-3" role="status" aria-live="polite">
      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{busy.length ? 'Agent tools' : 'Up to date'}</span>
      {shown.map((a) => (
        <div key={a.id} className="flex flex-col gap-1.5">
          <span className="flex items-center gap-2 text-sm font-semibold"><Mark id={a.id} size={20} />{adapterLine(a)}</span>
          {isBusy(a) && <BusyBar />}
        </div>
      ))}
    </div>
  )
}
