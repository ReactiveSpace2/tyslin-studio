import { templatePages } from '@shared/agencies'
import type { AgencyPageKind, AgencyPageSpec } from '@shared/pages'
import type { AgencyView } from '../../agencies'
import type { IconName } from '../../components/Icon'
import { CalendarPage } from './CalendarPage'
import { ScreensPage } from './ScreensPage'
import { TablePage } from './TablePage'

/** Page types with a screen so far; a template may declare others (campaigns) that get their tab when built. */
const BUILT: AgencyPageKind[] = ['screens', 'table', 'calendar']

/** Icons for the task header's page buttons. */
export const PAGE_ICON: Record<AgencyPageKind, IconName> = { screens: 'grid', table: 'table', calendar: 'calendar', campaigns: 'list' }

/** The agency's pages that can be shown: the Agency screen's extra tabs and the task header's extra panel buttons. */
export const shownPages = (view: AgencyView | null): AgencyPageSpec[] => (view ? templatePages(view.agency.templateId).filter((p) => BUILT.includes(p.kind)) : [])

/** One page, on the Agency screen or in a task's right panel. */
export function AgencyPageView({ view, page }: { view: AgencyView; page: AgencyPageSpec }): JSX.Element | null {
  if (page.kind === 'screens') return <ScreensPage key={view.agency.id} view={view} />
  if (page.kind === 'table') return <TablePage key={view.agency.id + page.id} view={view} page={page} />
  if (page.kind === 'calendar') return <CalendarPage key={view.agency.id + page.id} view={view} page={page} />
  return null
}
