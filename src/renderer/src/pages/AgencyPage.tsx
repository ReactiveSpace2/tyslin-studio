import type { Agent } from '@shared/types'
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
import { TabsList, TabsTrigger } from '@/components/ui/tabs'

const TABS: [AgencyTab, string][] = [['goals', 'Goals'], ['team', 'Team'], ['skills', 'Skills'], ['connectors', 'Connectors'], ['channel', 'Channel'], ['memory', 'Memory'], ['schedule', 'Schedule']]

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

/** One agency on one page: its header and seven tabs. */
export function AgencyPage({ view, agencies, agents, tab, you, focus, onTab, onPick, onNewAgency, onNewTask, onOpenAgent, onAddWorker, onOpenTask, onChanged, onDeleted }: Props): JSX.Element {
  return (
    <div className="flex w-full max-w-[1180px] flex-col gap-5 px-10 pt-6 pb-12">
      <AgencyHeader view={view} agencies={agencies} onPick={onPick} onNewAgency={onNewAgency} onNewTask={onNewTask} onChanged={onChanged} onDeleted={onDeleted} />
      <TabsList aria-label="Agency" className="h-auto flex-wrap self-start">
        {TABS.map(([id, label]) => <TabsTrigger key={id} active={tab === id} onClick={() => onTab(id)} className="h-9 px-3">{label}</TabsTrigger>)}
      </TabsList>
      {tab === 'goals' && <GoalsTab key={view.agency.updatedAt} view={view} onChanged={onChanged} onChannel={() => onTab('channel')} />}
      {tab === 'team' && <TeamTab view={view} you={you} onOpenAgent={onOpenAgent} onAddWorker={onAddWorker} />}
      {tab === 'skills' && <SkillsTab view={view} agents={agents} onAgentsChanged={onChanged} />}
      {tab === 'connectors' && <ConnectorsTab view={view} />}
      {tab === 'channel' && <ChannelTab view={view} onChanged={onChanged} />}
      {tab === 'memory' && <MemoryTab key={view.agency.id} view={view} agents={agents} initial={focus} />}
      {tab === 'schedule' && <ScheduleTab view={view} agencies={agencies} onOpenTask={onOpenTask} />}
    </div>
  )
}
