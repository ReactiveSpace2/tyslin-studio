import { useState } from 'react'
import type { Agent } from '@shared/types'
import type { AgencyView } from '../agencies'
import { firstName } from '../boardStats'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Markdown } from '../components/Markdown'
import { RunsOnBadge, runsOnLabel } from '../components/RunsOnBadge'
import { ScheduleList } from '../agency/ScheduleTab'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'

type Tab = 'about' | 'routines' | 'instructions'

interface Props {
  agent: Agent
  view: AgencyView | null
  onEdit: (a: Agent) => void
  onOpenTask: (sessionId: string, agentId: string) => void
}

/**
 * The agent's panel in a task (blueprint "Agent panel", opened from the name pill): the head, name and job, then
 * About (runs on, goal, reports to, tools, skills), Routines (its scheduled tasks) and Instructions. Changes go
 * through the agent editor (Edit agent).
 */
export function AgentPanel({ agent, view, onEdit, onOpenTask }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('about')
  const isLead = view?.lead?.id === agent.id
  const boss = agent.leadId ? [view?.lead, ...(view?.workers ?? [])].find((a) => a?.id === agent.leadId) ?? null : null
  const reports = view ? view.workers.filter((w) => w.leadId === agent.id) : []
  const row = 'flex items-start justify-between gap-3 border-b border-border py-2.5 text-[13px] last:border-b-0'

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <Avatar shape={agent.shape} tone={agent.tone} head={agent.head} size={72} />
        <div className="flex flex-col gap-0.5">
          <h2 className="text-lg font-semibold">{agent.name}</h2>
          {agent.description && <p className="text-[13px] text-muted-foreground">{agent.description}</p>}
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {isLead && <Badge variant="lime">Lead</Badge>}
          {view && <Badge variant="soft">{view.agency.name}</Badge>}
          {agent.paused && <Badge variant="outline">Paused</Badge>}
        </div>
      </div>

      <TabsList className="w-full" aria-label="Agent">
        <TabsTrigger active={tab === 'about'} onClick={() => setTab('about')}>About</TabsTrigger>
        <TabsTrigger active={tab === 'routines'} onClick={() => setTab('routines')}>Routines</TabsTrigger>
        <TabsTrigger active={tab === 'instructions'} onClick={() => setTab('instructions')}>Instructions</TabsTrigger>
      </TabsList>

      {tab === 'about' && (
        <Card className="gap-0 px-4 py-1">
          <div className={row}>
            <span className="text-muted-foreground">Runs on</span>
            <span className="flex items-center gap-2 text-right"><RunsOnBadge agent={agent} size={18} /><span className="font-mono text-xs">{runsOnLabel(agent)}{agent.model ? ` · ${agent.model}` : ''}</span></span>
          </div>
          {agent.goal && <div className={row}><span className="text-muted-foreground">Goal</span><span className="max-w-[62%] text-right">{agent.goal}</span></div>}
          <div className={row}><span className="text-muted-foreground">Reports to</span><span>{boss ? firstName(boss.name) : 'You'}</span></div>
          {reports.length > 0 && <div className={row}><span className="text-muted-foreground">Team</span><span className="max-w-[62%] text-right">{reports.map((a) => firstName(a.name)).join(', ')}</span></div>}
          <div className={row}>
            <span className="text-muted-foreground">File tools</span>
            <span>{agent.tools.read ? (agent.tools.write ? (agent.writeMode === 'direct' ? 'Read and write' : 'Read, writes reviewed') : 'Read only') : 'Off'}</span>
          </div>
          <div className={row}><span className="text-muted-foreground">Skills</span><span className="font-mono text-xs">{agent.skills.length}</span></div>
        </Card>
      )}

      {tab === 'routines' && (view
        ? <ScheduleList agencies={[view]} only={view} agentId={agent.id} onOpenTask={onOpenTask} />
        : <p className="text-[13px] text-muted-foreground">This agent isn't in an agency, so it has no routines.</p>)}

      {tab === 'instructions' && (
        <Card className="gap-0 px-4 py-3 text-[13px]">
          {agent.instructions.trim() ? <Markdown text={agent.instructions} /> : <p className="text-muted-foreground">No instructions yet.</p>}
        </Card>
      )}

      {view && (
        <Button variant="outline" className="self-start" onClick={() => onEdit(agent)}>
          <Icon name="settings" size={14} /> Edit agent
        </Button>
      )}
    </div>
  )
}
