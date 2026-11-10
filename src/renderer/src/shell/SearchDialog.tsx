import type { Agent, Session } from '@shared/types'
import type { AgencyView } from '../agencies'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'

const cmdItem = 'min-h-9 cursor-pointer gap-2.5 rounded-md px-2 text-sm'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  agencies: AgencyView[]
  agents: Agent[]
  sessions: Session[]
  runningIds: Set<string>
  needsYouBySession: Record<string, number>
  onOpenTask: (sessionId: string, agentId: string) => void
  onOpenAgency: (agencyId: string) => void
  onOpenAgent: (agencyId: string, agentId: string) => void
  onNewTask: () => void
  onNewAgency: () => void
  onScheduled: () => void
  onSettings: () => void
}

/** Ctrl/Cmd+K: tasks, agents, agencies and a few actions. Typing filters everything at once. */
export function SearchDialog({ open, onOpenChange, agencies, agents, sessions, runningIds, needsYouBySession, onOpenTask, onOpenAgency, onOpenAgent, onNewTask, onNewAgency, onScheduled, onSettings }: Props): JSX.Element {
  const go = (fn: () => void): void => { onOpenChange(false); fn() }
  const agencyOfAgent = (a: Agent): AgencyView | undefined => agencies.find((v) => v.agency.id === a.agency || v.project.id === a.projectId)
  const people = agencies.flatMap((v) => [v.lead, ...v.workers].filter((a): a is Agent => !!a).map((a) => ({ a, v })))
  const tasks = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 40).map((s) => {
    const a = agents.find((x) => x.id === s.agentId)
    return { s, a, v: a ? agencyOfAgent(a) : undefined }
  })
  const state = (s: Session): string => runningIds.has(s.id) ? 'running' : needsYouBySession[s.id] ? `needs you · ${needsYouBySession[s.id]}` : ''

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Find a task, an agent, an agency or an action">
      <CommandInput placeholder="Search tasks, agents, agencies…" />
      <CommandList className="max-h-[440px]">
        <CommandEmpty>Nothing matches.</CommandEmpty>
        {tasks.length > 0 && (
          <CommandGroup heading="Tasks">
            {tasks.map(({ s, a, v }) => (
              <CommandItem key={s.id} className={cmdItem} value={`task ${s.title} ${v?.agency.name ?? ''} ${s.id}`} onSelect={() => go(() => onOpenTask(s.id, s.agentId))}>
                {a ? <Avatar shape={a.shape} tone={a.tone} head={a.head} size={20} /> : <Icon name="chat" size={14} />}
                <span className="min-w-0 flex-1 truncate">{s.title || 'New task'}</span>
                <span className="text-xs text-muted-foreground">{[v?.agency.name, state(s)].filter(Boolean).join(' · ')}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {people.length > 0 && (
          <CommandGroup heading="Agents">
            {people.map(({ a, v }) => (
              <CommandItem key={a.id} className={cmdItem} value={`agent ${a.name} ${v.agency.name} ${a.id}`} onSelect={() => go(() => onOpenAgent(v.agency.id, a.id))}>
                <Avatar shape={a.shape} tone={a.tone} head={a.head} size={20} />
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <span className="text-xs text-muted-foreground">{v.agency.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {agencies.length > 0 && (
          <CommandGroup heading="Agencies">
            {agencies.map((v) => (
              <CommandItem key={v.agency.id} className={cmdItem} value={`agency ${v.agency.name} ${v.agency.id}`} onSelect={() => go(() => onOpenAgency(v.agency.id))}>
                {v.lead ? <Avatar shape={v.lead.shape} tone={v.lead.tone} head={v.lead.head} size={20} /> : <Icon name="agency" size={14} />}
                {v.agency.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem className={cmdItem} value="new task" onSelect={() => go(onNewTask)}><Icon name="plus" size={14} /> New task</CommandItem>
          <CommandItem className={cmdItem} value="new agency" onSelect={() => go(onNewAgency)}><Icon name="agency" size={14} /> New agency</CommandItem>
          <CommandItem className={cmdItem} value="schedule a task scheduled" onSelect={() => go(onScheduled)}><Icon name="clock" size={14} /> Scheduled tasks</CommandItem>
          <CommandItem className={cmdItem} value="settings models keys" onSelect={() => go(onSettings)}><Icon name="settings" size={14} /> Settings</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
