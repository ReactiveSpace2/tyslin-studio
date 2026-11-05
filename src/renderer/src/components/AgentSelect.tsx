import type { Agent } from '@shared/types'
import { DEFAULT_MODEL_AGENT } from '@shared/models'
import { modelLabel, useDefaultModel } from '../defaultModel'

/** Picks who does the work: the default model (first), an agent or an assistant. */
export function AgentSelect({ agents, value, onChange, label, id }: { agents: Agent[]; value: string; onChange: (id: string) => void; label?: string; id?: string }): JSX.Element {
  const d = useDefaultModel()
  // The Studio assistant is what "Default model" runs on, so it isn't listed twice.
  const shown = agents.filter((a) => a.id !== d?.assistantId)
  return (
    <select id={id} className="select" value={value} aria-label={label ?? 'Agent or assistant'} onChange={(e) => onChange(e.target.value)}>
      <option value={DEFAULT_MODEL_AGENT}>Default model{d ? ` (${modelLabel(d)})` : ''}</option>
      <optgroup label="Agents">{shown.filter((a) => a.kind === 'agent').map((a) => <option key={a.id} value={a.id}>{a.name}{a.paused ? ' (paused)' : ''}</option>)}</optgroup>
      <optgroup label="Assistants">{shown.filter((a) => a.kind === 'assistant').map((a) => <option key={a.id} value={a.id}>{a.name}{a.paused ? ' (paused)' : ''}</option>)}</optgroup>
    </select>
  )
}
