import { useEffect, useState } from 'react'
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
    <a className={'gh-stars' + (compact ? ' compact' : '')} href={s.url} target="_blank" rel="noreferrer" aria-label={label} title={label}>
      <Icon name="github" size={compact ? 13 : 15} />
      {!compact && <span>Star on GitHub</span>}
      <span className="gh-count mono"><Icon name="star" size={compact ? 11 : 12} />{s.count === null ? '–' : fmt(s.count)}</span>
    </a>
  )
}
