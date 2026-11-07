import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Icon } from './Icon'

let cached: { count: number | null; url: string } | null = null

const fmt = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))

/**
 * Link to Tyslin on GitHub with its star count (fetched by main, at most hourly). Without a count
 * (offline, rate limited) it still links. `compact` is the title-bar size.
 */
export function GitHubStars({ compact = false }: { compact?: boolean }): JSX.Element | null {
  const [s, setS] = useState(cached)
  useEffect(() => { void window.tyslin.app.stars().then((r) => { cached = r; setS(r) }) }, [])
  if (!s) return null
  const label = s.count === null ? 'Star Tyslin on GitHub' : `Star Tyslin on GitHub. ${s.count} ${s.count === 1 ? 'star' : 'stars'}`
  return (
    <a className={cn('no-drag inline-flex items-center no-underline outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
      compact
        ? 'h-6 gap-1 self-center rounded-[7px] border border-border bg-card pr-0.5 pl-[7px] ml-1.5 text-[11px] font-semibold text-muted-foreground hover:border-border-strong hover:text-foreground'
        : 'h-9 gap-2 self-start rounded-lg border border-border bg-card pr-1 pl-3 text-[13px] font-semibold text-foreground hover:border-border-strong')} href={s.url} target="_blank" rel="noreferrer" aria-label={label} title={label}>
      <Icon name="github" size={compact ? 13 : 15} />
      {!compact && <span>Star on GitHub</span>}
      <span className={cn('inline-flex items-center gap-1 border-l border-border font-mono font-medium text-muted-foreground', compact ? 'h-[18px] px-[5px] text-[11px]' : 'h-7 px-2 text-xs')}><Icon name="star" size={compact ? 11 : 12} />{s.count === null ? '–' : fmt(s.count)}</span>
    </a>
  )
}
