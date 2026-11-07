import type { Agent } from '@shared/types'
import { DEFAULT_MODEL_AGENT } from '@shared/models'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { modelLabel, useDefaultModel } from '../defaultModel'
import { useListed } from '../currentProject'

/** Picks who does the work: the default model (first), an agent or an assistant. */
export function AgentSelect({ agents, value, onChange, label, id }: { agents: Agent[]; value: string; onChange: (id: string) => void; label?: string; id?: string }): JSX.Element {
  const d = useDefaultModel()
  // The Studio assistant is what "Default model" runs on, so it isn't listed twice.
  // Only the selected project's agents and assistants (plus Builder); Studio runs "Default model".
  const listed = useListed()
  const shown = agents.filter(listed)
  const group = (kind: Agent['kind'], title: string): JSX.Element | null => {
    const list = shown.filter((a) => a.kind === kind)
    if (!list.length) return null
    return (
      <SelectGroup>
        <SelectLabel>{title}</SelectLabel>
        {list.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}{a.paused ? ' (paused)' : ''}</SelectItem>)}
      </SelectGroup>
    )
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label={label ?? 'Agent or assistant'} className="w-full rounded-lg data-[size=default]:h-[42px] bg-card px-3 text-[15px] dark:bg-card dark:hover:bg-card">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={DEFAULT_MODEL_AGENT}>Default model{d ? ` (${modelLabel(d)})` : ''}</SelectItem>
        {group('agent', 'Agents')}
        {group('assistant', 'Assistants')}
      </SelectContent>
    </Select>
  )
}
