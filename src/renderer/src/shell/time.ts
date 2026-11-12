/** A short time for list rows: "now", "5m", "3h", a weekday this week, else a date. */
export function shortTime(ms: number, now = Date.now()): string {
  const d = now - ms
  if (d < 60_000) return 'now'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h`
  if (d < 6 * 86_400_000) return new Date(ms).toLocaleDateString(undefined, { weekday: 'short' })
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
