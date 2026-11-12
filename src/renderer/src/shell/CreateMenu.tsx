import { useState } from 'react'
import type { Agent } from '@shared/types'
import type { AgencyView } from '../agencies'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface Props {
  agencies: AgencyView[]
  /** The agency a new agent joins (the active one). */
  activeAgency: string | null
  onNewTask: () => void
  onNewAgent: (agencyId: string) => void
  onNewAgency: () => void
  onOpenAgent: (agent: Agent) => void
  className?: string
}

/**
 * The + in the sidebar header (blueprint "Create menu"): a "To:" box that finds an agent to message, then New task,
 * New agent (joins the active agency) and New agency.
 */
export function CreateMenu({ agencies, activeAgency, onNewTask, onNewAgent, onNewAgency, onOpenAgent, className }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const target = agencies.find((v) => v.agency.id === activeAgency) ?? agencies[0] ?? null
  const pick = (fn: () => void): void => { setOpen(false); fn() }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button type="button" aria-label="Create" className={className}>
              <Icon name="plus" size={16} />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Create</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" sideOffset={6} className="w-[300px] rounded-xl p-0 shadow-lg">
        <Command>
          <CommandInput placeholder="To: an agent…" aria-label="Find an agent to message" />
          <CommandList className="max-h-[360px]">
            <CommandEmpty>No agent by that name.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="new task" onSelect={() => pick(onNewTask)} className="min-h-10 gap-2.5"><Icon name="chat" size={15} /> New task</CommandItem>
              {target && (
                <CommandItem value={`new agent ${target.agency.name}`} onSelect={() => pick(() => onNewAgent(target.agency.id))} className="min-h-10 gap-2.5">
                  <Icon name="agents" size={15} /> <span className="min-w-0 flex-1 truncate">New agent</span>
                  <span className="truncate text-xs text-muted-foreground">in {target.agency.name}</span>
                </CommandItem>
              )}
              <CommandItem value="new agency" onSelect={() => pick(onNewAgency)} className="min-h-10 gap-2.5"><Icon name="agency" size={15} /> New agency</CommandItem>
            </CommandGroup>
            {agencies.map((v) => {
              const team = [v.lead, ...v.workers].filter((a): a is Agent => !!a)
              if (!team.length) return null
              return (
                <div key={v.agency.id}>
                  <CommandSeparator />
                  <CommandGroup heading={v.agency.name}>
                    {team.map((a) => (
                      <CommandItem key={a.id} value={`${a.name} ${a.description} ${v.agency.name}`} onSelect={() => pick(() => onOpenAgent(a))} className="min-h-10 gap-2.5">
                        <Avatar shape={a.shape} tone={a.tone} head={a.head} size={22} />
                        <span className="min-w-0 flex-1 truncate">{a.name}</span>
                        {a.id === v.lead?.id && <span className="text-xs text-muted-foreground">Lead</span>}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </div>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
