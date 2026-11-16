import { templatePages } from '@shared/agencies'
import type { AgencyPageKind, AgencyPageSpec } from '@shared/pages'
import type { AgencyView } from '../../agencies'
import type { IconName } from '../../components/Icon'
import type { Attachment } from '@shared/types'
import { CalendarPage } from './CalendarPage'
import { DesignBoard } from './DesignBoard'
import { ScreensPage } from './ScreensPage'
import { TablePage } from './TablePage'

/** Page types with a screen so far; a template may declare others (campaigns) that get their tab when built. */
const BUILT: AgencyPageKind[] = ['screens', 'table', 'calendar', 'design']

/** Icons for the task header's page buttons. */
export const PAGE_ICON: Record<AgencyPageKind, IconName> = { screens: 'grid', table: 'table', calendar: 'calendar', campaigns: 'list', design: 'canvas' }

/** The agency's pages that can be shown: the Agency screen's extra tabs and the task header's extra panel buttons. */
export const shownPages = (view: AgencyView | null): AgencyPageSpec[] => (view ? templatePages(view.agency.templateId).filter((p) => BUILT.includes(p.kind)) : [])

/** One page, on the Agency screen or in a task's right panel. */
export function AgencyPageView({ view, page, onSend, className }: { view: AgencyView; page: AgencyPageSpec; onSend?: (text: string, attachments: Attachment[]) => Promise<void>; className?: string }): JSX.Element | null {
  // The Design board fills its place: the whole task panel, or most of the team screen's height.
  if (page.kind === 'design') return <DesignBoard key={view.agency.id} view={view} onSend={onSend} className={className ?? 'h-[calc(100vh-330px)] min-h-[480px]'} />
  if (page.kind === 'screens') return <ScreensPage key={view.agency.id} view={view} />
  if (page.kind === 'table') return <TablePage key={view.agency.id + page.id} view={view} page={page} />
  if (page.kind === 'calendar') return <CalendarPage key={view.agency.id + page.id} view={view} page={page} />
  return null
}
