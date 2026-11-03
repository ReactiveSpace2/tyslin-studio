import { useMemo, useState } from 'react'
import type { Agent } from '@shared/types'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'

import { ENGINE_NAMES } from '@shared/engines'

const PROVIDER_LABEL: Record<Agent['provider'], string> = { anthropic: 'Claude', openai: 'OpenAI', gemini: 'Gemini', ollama: 'Local · Ollama' }

interface Props {
  agents: Agent[]
  onChat: (a: Agent) => void
  onEdit: (a: Agent) => void
  onNew: () => void
}

export function AgentsPage({ agents, onChat, onEdit, onNew }: Props): JSX.Element {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'local'>('all')

  const shown = useMemo(() => agents.filter((a) => {
    if (q && !(a.name + ' ' + a.description).toLowerCase().includes(q.toLowerCase())) return false
    if (filter === 'scheduled') return a.schedule !== 'manual'
    if (filter === 'local') return a.provider === 'ollama'
    return true
  }), [agents, q, filter])

  return (
    <div className="page">
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="eyebrow">Your crew</span>
          <h1>Agents</h1>
          <p className="lead">Each agent has a job, its own skills and the model you choose.</p>
        </div>
        <div className="row">
          <label className="row input" style={{ width: 240, gap: 8, color: 'var(--muted)' }}>
            <Icon name="search" />
            <input
              type="search"
              placeholder="Search agents"
              aria-label="Search agents"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ border: 0, outline: 'none', background: 'transparent', flex: 1, minWidth: 0 }}
            />
          </label>
          <button type="button" className="btn btn-primary" onClick={onNew}>
            <Icon name="plus" size={14} /> New agent
          </button>
        </div>
      </header>

      <div className="row" role="group" aria-label="Filter agents">
        {(['all', 'scheduled', 'local'] as const).map((f) => (
          <button key={f} type="button" className={'pill' + (filter === f ? ' on' : '')} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'scheduled' ? 'Scheduled' : 'Local models'}
          </button>
        ))}
      </div>

      <div className="grid">
        {shown.map((a) => (
          <article key={a.id} className="card">
            <div className="card-top">
              <div className="avatar-tile">
                <Avatar shape={a.shape} tone={a.tone} mascot={a.isMascot} />
              </div>
              {a.isMascot ? <span className="badge green">Built-in</span> : a.schedule !== 'manual' ? <span className="badge green">{a.schedule}</span> : null}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h2>{a.name}</h2>
              <p>{a.description}</p>
            </div>
            <div className="card-foot">
              <span className="mono" title={a.engine === 'builtin' ? a.model : undefined}>{a.engine === 'builtin' ? `${PROVIDER_LABEL[a.provider]} · ${a.model}` : `Runs on ${ENGINE_NAMES[a.engine]}`}</span>
              <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                <button type="button" className="btn btn-sm" onClick={() => onEdit(a)}>Edit</button>
                <button type="button" className="btn btn-sm btn-lime" onClick={() => onChat(a)}>Chat</button>
              </div>
            </div>
          </article>
        ))}
        <button type="button" className="add-card" onClick={onNew}>
          <Icon name="plus" size={28} />
          Build a new agent
        </button>
      </div>
    </div>
  )
}
