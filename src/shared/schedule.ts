import type { TaskSchedule } from './types'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** "08:00" → [8, 0]; anything malformed falls back to 09:00. */
function parseTime(time: string): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!m) return [9, 0]
  return [Math.min(23, Number(m[1])), Math.min(59, Number(m[2]))]
}

/** The next time after `from` that the schedule fires, in local time. */
export function nextRunAfter(s: TaskSchedule, from: number): number {
  const [h, min] = parseTime(s.time)
  const start = new Date(from)
  for (let i = 0; i < 8; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, h, min, 0, 0)
    if (d.getTime() <= from) continue
    const wd = d.getDay()
    if (s.repeat === 'weekdays' && (wd === 0 || wd === 6)) continue
    if (s.repeat === 'weekly' && wd !== (s.day ?? 1)) continue
    return d.getTime()
  }
  return from + 7 * 24 * 60 * 60 * 1000
}

/** "Weekdays at 8:00 AM", "Every Friday at 4:00 PM", "Daily at 9:00 AM". */
export function describeSchedule(s: TaskSchedule): string {
  const [h, min] = parseTime(s.time)
  const at = new Date(2000, 0, 1, h, min).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (s.repeat === 'daily') return `Daily at ${at}`
  if (s.repeat === 'weekdays') return `Weekdays at ${at}`
  return `Every ${DAYS[s.day ?? 1]} at ${at}`
}

export const WEEKDAY_NAMES = DAYS
