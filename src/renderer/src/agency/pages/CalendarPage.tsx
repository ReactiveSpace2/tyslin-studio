import { useMemo, useState } from 'react'
import type { DayButton } from 'react-day-picker'
import { CALENDAR_STATES, pageFile, type AgencyPageSpec, type CalendarItem, type CalendarState } from '@shared/pages'
import type { AgencyView } from '../../agencies'
import { Icon } from '../../components/Icon'
import { Pose } from '../../components/Pose'
import { usePageData } from './usePageData'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Calendar, CalendarDayButton } from '@/components/ui/calendar'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { cn } from '@/lib/utils'

/** Local YYYY-MM-DD, the calendar file's date format. */
const ymd = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fromYmd = (s: string): Date => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }

/** State badges: tokens only. Posted is the done state (lime fill, ink text). */
const STATE: Record<CalendarState, { variant: 'outline' | 'soft' | 'secondary' | 'lime'; label: string }> = {
  draft: { variant: 'outline', label: 'Draft' },
  approved: { variant: 'soft', label: 'Approved' },
  scheduled: { variant: 'secondary', label: 'Scheduled' },
  posted: { variant: 'lime', label: 'Posted' }
}

/**
 * The calendar page (Social Media Marketing): shadcn's Calendar (react-day-picker) in month view with a custom day
 * button, as in shadcn's calendar-21 block, that shows how many posts fall on the day. Picking a day lists its
 * posts with channel and state. Reads `{ "items": [{ date, channel, title, state }] }` from the page's data file.
 */
export function CalendarPage({ view, page }: { view: AgencyView; page: AgencyPageSpec }): JSX.Element {
  const file = pageFile(page)
  const res = usePageData(view.agency.id, page.id, file)
  const items = res?.kind === 'calendar' ? res.data.items : []
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarItem[]>()
    for (const it of items) m.set(it.date, [...(m.get(it.date) ?? []), it])
    return m
  }, [items])
  // Open on today's month, or on the first post's month when none falls this month.
  const [month, setMonth] = useState<Date | null>(null)
  const [picked, setPicked] = useState<Date | undefined>(undefined)

  if (res === null) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (res.missing) {
    return (
      <Empty className="border border-dashed border-border">
        <EmptyHeader>
          <EmptyMedia><Pose pose={3} height={120} /></EmptyMedia>
          <EmptyTitle>No calendar yet</EmptyTitle>
          <EmptyDescription>{view.agency.name}'s agents keep {page.about} in <span className="font-mono">{file}</span>. It shows here once they write it.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  if (res.error !== undefined) return <Alert variant="destructive"><Icon name="warning" size={16} /><AlertDescription>{res.error}</AlertDescription></Alert>

  const today = new Date()
  const thisMonth = ymd(today).slice(0, 7)
  const shown = month ?? (items.some((i) => i.date.startsWith(thisMonth)) || !items.length ? today : fromYmd(items[0].date))
  const dayKey = picked ? ymd(picked) : null
  const dayItems = dayKey ? byDay.get(dayKey) ?? [] : []
  const monthKey = ymd(shown).slice(0, 7)
  const inMonth = items.filter((i) => i.date.startsWith(monthKey))
  const counts = CALENDAR_STATES.map((s) => [s, inMonth.filter((i) => i.state === s).length] as const).filter(([, n]) => n)

  // Each day cell carries its post count (a small pill) under the number (shadcn calendar-21 pattern: content in CalendarDayButton).
  const Day = (props: React.ComponentProps<typeof DayButton>): JSX.Element => {
    const n = byDay.get(ymd(props.day.date))?.length ?? 0
    return (
      // shadcn's day button sets dark:hover:text-accent-foreground, which hides a selected day's number in dark mode.
      <CalendarDayButton {...props} className={cn(props.className, 'data-[selected-single=true]:hover:bg-primary data-[selected-single=true]:hover:text-primary-foreground dark:data-[selected-single=true]:hover:text-primary-foreground')} aria-label={`${props.day.date.toDateString()}${n ? `, ${n} post${n === 1 ? '' : 's'}` : ''}`}>
        {props.children}
        {n > 0 && <span aria-hidden="true" className={cn('rounded-full px-1.5 py-px font-mono text-[10.5px] leading-none !opacity-100', props.modifiers.selected ? 'bg-primary-foreground text-primary' : 'bg-lime-soft text-green')}>{n}</span>}
      </CalendarDayButton>
    )
  }

  return (
    <div className="@container"><div className="flex flex-col gap-4 @3xl:flex-row @3xl:items-start">
      <Card className="w-fit gap-3 p-3">
        <Calendar
          mode="single"
          month={shown}
          onMonthChange={setMonth}
          selected={picked}
          onSelect={setPicked}
          components={{ DayButton: Day }}
          className="bg-transparent p-0 [--cell-size:--spacing(14)]"
          aria-label={`${page.title}: pick a day`}
        />
        <p className="px-1 font-mono text-xs text-muted-foreground">
          {inMonth.length ? `${inMonth.length} post${inMonth.length === 1 ? '' : 's'} this month · ${counts.map(([s, n]) => `${n} ${STATE[s].label.toLowerCase()}`).join(' · ')}` : 'No posts this month'}
        </p>
      </Card>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 className="text-sm font-semibold">{picked ? picked.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Pick a day'}</h3>
        {!picked && <p className="text-[13px] text-muted-foreground">Days with posts show how many under the date. Pick one to see its posts, channel and state.</p>}
        {picked && !dayItems.length && <p className="text-[13px] text-muted-foreground">Nothing planned for this day.</p>}
        <ul className="flex flex-col gap-2">
          {dayItems.map((it, i) => (
            <li key={`${it.channel}-${i}`}>
              <Item variant="outline" className="bg-card">
                <ItemContent className="min-w-0">
                  <ItemTitle className="w-full justify-between gap-3">
                    <span className="min-w-0 break-words">{it.title || 'Untitled post'}</span>
                    <Badge variant={STATE[it.state].variant} className={cn('flex-none font-mono text-[11px]')}>{STATE[it.state].label}</Badge>
                  </ItemTitle>
                  <ItemDescription className="font-mono text-xs">{it.channel || 'No channel'}</ItemDescription>
                </ItemContent>
              </Item>
            </li>
          ))}
        </ul>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">{file}</p>
      </div>
    </div></div>
  )
}
