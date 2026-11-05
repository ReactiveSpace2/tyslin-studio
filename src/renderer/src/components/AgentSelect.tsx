import type { Agent } from '@shared/types'
import { DEFAULT_MODEL_AGENT } from '@shared/models'
import { modelLabel, useDefaultModel } from '../defaultModel'
import { useListed } from '../currentProject'

/** Picks who does the work: the default model (first), an agent or an assistant. */
export function AgentSelect({ agents, value, onChange, label, id }: { agents: Agent[]; value: string; onChange: (id: string) => void; label?: string; id?: string }): JSX.Element {
  const d = useDefaultModel()
  // The Studio assistant is what "Default model" runs on, so it isn't listed twice.
  // Only the selected project's agents and assistants (plus Builder); Studio runs "Default model".
  const listed = useListed()
  const shown = agents.filter(listed)
  return (
    <select id={id} className="select" value={value} aria-label={label ?? 'Agent or assistant'} onChange={(e) => onChange(e.target.value)}>
      <option value={DEFAULT_MODEL_AGENT}>Default model{d ? ` (${modelLabel(d)})` : ''}</option>
      <optgroup label="Agents">{shown.filter((a) => a.kind === 'agent').map((a) => <option key={a.id} value={a.id}>{a.name}{a.paused ? ' (paused)' : ''}</option>)}</optgroup>
      <optgroup label="Assistants">{shown.filter((a) => a.kind === 'assistant').map((a) => <option key={a.id} value={a.id}>{a.name}{a.paused ? ' (paused)' : ''}</option>)}</optgroup>
    </select>
  )
}
