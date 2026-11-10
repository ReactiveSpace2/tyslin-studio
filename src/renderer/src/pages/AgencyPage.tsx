import type { Agent } from '@shared/types'
import { templatePages } from '@shared/agencies'
import type { AgencyPageKind } from '@shared/pages'
import type { AgencyTab } from '../App'
import type { AgencyView } from '../agencies'
import { AgencyHeader } from '../agency/AgencyHeader'
import { ChannelTab } from '../agency/ChannelTab'
import { ConnectorsTab } from '../agency/ConnectorsTab'
import { GoalsTab } from '../agency/GoalsTab'
import { MemoryTab } from '../agency/MemoryTab'
import { ScheduleTab } from '../agency/ScheduleTab'
import { SkillsTab } from '../agency/SkillsTab'
import { TeamTab } from '../agency/TeamTab'
import { ScreensPage } from '../agency/pages/ScreensPage'
import { TablePage } from '../agency/pages/TablePage'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'

const TABS: [AgencyTab, string][] = [['goals', 'Goals'], ['team', 'Team'], ['skills', 'Skills'], ['connectors', 'Connectors'], ['channel', 'Channel'], ['memory', 'Memory'], ['schedule', 'Schedule']]
/** Page types with a screen so far; a template may declare others (campaigns) that get their tab when built. */
const BUILT: AgencyPageKind[] = ['screens', 'table']

interface Props {
  view: AgencyView
  agencies: AgencyView[]
  agents: Agent[]
  tab: AgencyTab
  you: string
  /** Memory tab: the file to open ('agency' or an agent id). */
  focus?: string
  onTab: (tab: AgencyTab) => void
  onPick: (agencyId: string) => void
  onNewAgency: () => void
  onNewTask: () => void
  onOpenAgent: (a: Agent) => void
  onAddWorker: () => void
  onOpenTask: (sessionId: string, agentId: string) => void
  onChanged: () => void
  onDeleted: () => void
}

/** One agency on one page: its header, seven tabs, and the extra pages its template declares (shared/pages.ts). */
export function AgencyPage({ view, agencies, agents, tab, you, focus, onTab, onPick, onNewAgency, onNewTask, onOpenAgent, onAddWorker, onOpenTask, onChanged, onDeleted }: Props): JSX.Element {
  const pages = templatePages(view.agency.templateId).filter((p) => BUILT.includes(p.kind))
  const tabs: [AgencyTab, string][] = [...TABS, ...pages.map((p): [AgencyTab, string] => [`page:${p.id}`, p.title])]
  const page = tab.startsWith('page:') ? pages.find((p) => `page:${p.id}` === tab) : undefined
  return (
    <div className="flex w-full max-w-[1180px] flex-col gap-5 px-10 pt-6 pb-12">
      <AgencyHeader view={view} agencies={agencies} onPick={onPick} onNewAgency={onNewAgency} onNewTask={onNewTask} onChanged={onChanged} onDeleted={onDeleted} />
      <TabsList aria-label="Agency" className="h-auto flex-wrap self-start">
        {tabs.map(([id, label]) => <TabsTrigger key={id} active={tab === id} onClick={() => onTab(id)} className="h-9 px-3">{label}</TabsTrigger>)}
      </TabsList>
      {tab === 'goals' && <GoalsTab key={view.agency.updatedAt} view={view} onChanged={onChanged} onChannel={() => onTab('channel')} />}
      {tab === 'team' && <TeamTab view={view} you={you} onOpenAgent={onOpenAgent} onAddWorker={onAddWorker} />}
      {tab === 'skills' && <SkillsTab view={view} agents={agents} onAgentsChanged={onChanged} />}
      {tab === 'connectors' && <ConnectorsTab view={view} />}
      {tab === 'channel' && <ChannelTab view={view} onChanged={onChanged} />}
      {tab === 'memory' && <MemoryTab key={view.agency.id} view={view} agents={agents} initial={focus} />}
      {tab === 'schedule' && <ScheduleTab view={view} agencies={agencies} onOpenTask={onOpenTask} />}
      {page?.kind === 'screens' && <ScreensPage key={view.agency.id} view={view} />}
      {page?.kind === 'table' && <TablePage key={view.agency.id + page.id} view={view} page={page} />}
      {tab.startsWith('page:') && !page && <p className="text-sm text-muted-foreground">{view.agency.name} has no such page.</p>}
    </div>
  )
}
