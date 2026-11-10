import { useEffect, useState } from 'react'
import type { PageData } from '@shared/pages'

/**
 * Watches the agency's folder while a page tab is open (main keeps one watcher per agency) and returns a counter
 * that goes up whenever a path `match` accepts changes, so a page reloads when the agents update its file.
 */
export function usePageWatch(agencyId: string, match: (path: string) => boolean): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    void window.tyslin.pages.watch(agencyId)
    const off = window.tyslin.pages.onChanged((e) => { if (e.agencyId === agencyId && (!e.path || match(e.path))) setTick((t) => t + 1) })
    return () => { off(); void window.tyslin.pages.unwatch(agencyId) }
    // `match` is a fixed rule per page; re-subscribing on every render isn't wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencyId])
  return tick
}

/** A table or calendar page's data file, read in main, reloaded when the file changes. */
export function usePageData(agencyId: string, pageId: string, file: string): PageData | null {
  const tick = usePageWatch(agencyId, (p) => p === file)
  const [data, setData] = useState<PageData | null>(null)
  useEffect(() => {
    let live = true
    window.tyslin.pages.read(agencyId, pageId).then((d) => { if (live) setData(d) }).catch((e: unknown) => { if (live) setData({ error: e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e) }) })
    return () => { live = false }
  }, [agencyId, pageId, tick])
  return data
}
