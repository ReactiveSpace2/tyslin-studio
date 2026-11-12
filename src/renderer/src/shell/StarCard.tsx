import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Icon } from '../components/Icon'

/**
 * A small card at the foot of the sidebar asking for a GitHub star (owner, 12 Nov 2026). It appears from the third
 * launch on, never on the first run, and goes away for good after Star is clicked; "Not now" hides it for two weeks,
 * three times, then for good. Everything is remembered per computer in localStorage (`tyslin:star:*`), nothing is sent.
 */
const REPO = 'https://github.com/ReactiveSpace2/tyslin-studio'
const SHOW_AFTER_LAUNCHES = 3
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000
const MAX_SNOOZES = 3
const KEY = { launches: 'tyslin:launches', done: 'tyslin:star:done', snoozed: 'tyslin:star:snoozed', until: 'tyslin:star:until' }

const read = (k: string): string => { try { return localStorage.getItem(k) ?? '' } catch { return '' } }
const write = (k: string, v: string): void => { try { localStorage.setItem(k, v) } catch { /* private window or storage off: the card just shows again */ } }

let counted = false
/** Counts this app start once (a reload of the window counts too; that's fine). */
function countLaunch(): number {
  const n = Number(read(KEY.launches)) || 0
  if (counted) return n
  counted = true
  write(KEY.launches, String(n + 1))
  return n + 1
}

function shouldShow(): boolean {
  const launches = countLaunch()
  if (launches < SHOW_AFTER_LAUNCHES || read(KEY.done)) return false
  const until = Number(read(KEY.until)) || 0
  return Date.now() >= until
}

export function StarCard(): JSX.Element | null {
  const [show, setShow] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    if (!shouldShow()) return
    setShow(true)
    void window.tyslin.app.stars().then((r) => setCount(r.count)).catch(() => undefined)
  }, [])
  if (!show) return null
  const star = (): void => { write(KEY.done, '1'); setShow(false) }
  const later = (): void => {
    const n = (Number(read(KEY.snoozed)) || 0) + 1
    write(KEY.snoozed, String(n))
    if (n >= MAX_SNOOZES) write(KEY.done, '1')
    else write(KEY.until, String(Date.now() + SNOOZE_MS))
    setShow(false)
  }
  return (
    <Card role="region" aria-label="Star Tyslin on GitHub" className="mb-1 gap-2 px-3 py-3 shadow-none group-data-[collapsible=icon]:hidden">
      <span className="flex items-center gap-1.5 text-[13px] font-semibold"><Icon name="star" size={13} /> Enjoying Tyslin?</span>
      <span className="text-xs text-muted-foreground">A star on GitHub helps more people find it{count !== null && count > 0 ? `. ${count.toLocaleString()} so far` : ''}.</span>
      <span className="flex items-center gap-1.5">
        <Button asChild variant="lime" size="sm" className="h-8"><a href={REPO} target="_blank" rel="noreferrer" onClick={star}><Icon name="github" size={13} /> Star on GitHub</a></Button>
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={later}>Not now</Button>
      </span>
    </Card>
  )
}
