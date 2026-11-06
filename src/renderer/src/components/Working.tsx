/**
 * How a working agent looks (owner's pick, 7 Nov 2026; canvas "Tyslin working-agent animations"):
 * a short lime line travelling round its card (WorkingBorder), and three typing dots wherever space is
 * small (WorkingDots: status pills, lists, the status bar). The hand-off flow on the org chart is the
 * `.nt-line.flow` / `.nt-stem` style in styles.css. Every animation stops under prefers-reduced-motion,
 * where the border becomes a steady lime outline.
 */

/** Draw inside a positioned card (position: relative). Decorative only; the card says "Working" in words. */
export function WorkingBorder(): JSX.Element {
  return (
    <svg className="wb" aria-hidden="true">
      <rect className="wb-r" pathLength={100} />
    </svg>
  )
}

/** Three small dots after a "Working" label. */
export function WorkingDots(): JSX.Element {
  return <span className="wd" aria-hidden="true"><span /><span /><span /></span>
}
