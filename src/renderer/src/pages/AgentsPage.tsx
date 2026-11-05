import { useInWorkspace } from '../currentProject'
import { useMemo, useState } from 'react'
import type { Agent, AgentKind } from '@shared/types'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { RunsOnBadge, runsOnLabel } from '../components/RunsOnBadge'

interface Props {
  kind: AgentKind
  agents: Agent[]
  onChat: (a: Agent) => void
  onEdit: (a: Agent) => void
  onNew: () => void
}

const COPY = {
  agent: {
    eyebrow: 'Your crew', title: 'Agents', noun: 'agent', add: 'Build a new agent',
    lead: 'Agents do work in your project folders: each has a job, its own skills and tools, and the model or engine you choose.'
  },
  assistant: {
    eyebrow: 'Everyday chat', title: 'Assistants', noun: 'assistant', add: 'Make a new assistant',
    lead: 'Assistants are a prompt and a model for quick chats: writing, translating, questions. No folders or tools.'
  }
} as const

/** List page for agents or for assistants (same cards, different filters and copy). */
export function AgentsPage({ kind, agents, onChat, onEdit, onNew }: Props): JSX.Element {
  const c = COPY[kind]
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'local'>('all')

  const inWs = useInWorkspace()
  const shown = useMemo(() => agents.filter((a) => {
    if (!inWs(a)) return false
    if (q && !(a.name + ' ' + a.description).toLowerCase().includes(q.toLowerCase())) return false
    if (filter === 'scheduled') return a.schedule !== 'manual'
    if (filter === 'local') return a.provider === 'ollama'
    return true
  }), [agents, q, filter])

  return (
    <div className="page">
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="eyebrow">{c.eyebrow}</span>
          <h1>{c.title}</h1>
          <p className="lead">{c.lead}</p>
        </div>
        <div className="row">
          <label className="row input" style={{ width: 240, gap: 8, color: 'var(--muted)' }}>
            <Icon name="search" />
            <input
              type="search"
              placeholder={`Search ${c.noun}s`}
              aria-label={`Search ${c.noun}s`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ border: 0, outline: 'none', background: 'transparent', flex: 1, minWidth: 0 }}
            />
          </label>
          <button type="button" className="btn btn-primary" onClick={onNew}>
            <Icon name="plus" size={14} /> New {c.noun}
          </button>
        </div>
      </header>

      <div className="row" role="group" aria-label={`Filter ${c.noun}s`}>
        {(kind === 'agent' ? (['all', 'scheduled', 'local'] as const) : (['all', 'local'] as const)).map((f) => (
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
                <Avatar shape={a.shape} tone={a.tone} head={a.head} mascot={a.isMascot} />
              </div>
              {a.isMascot ? <span className="badge green">Built-in</span> : a.schedule !== 'manual' ? <span className="badge green">{a.schedule}</span> : null}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h2>{a.name}</h2>
              <p>{a.description}</p>
            </div>
            <div className="card-foot">
              <span className="runs-on-line" title={a.engine === 'builtin' ? `${runsOnLabel(a)} · ${a.model}` : `Runs on ${runsOnLabel(a)}`}>
                <RunsOnBadge agent={a} />
                <span className="mono">{a.engine === 'builtin' ? `${runsOnLabel(a)} · ${a.model}` : `Runs on ${runsOnLabel(a)}`}</span>
              </span>
              <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                <button type="button" className="btn btn-sm" onClick={() => onEdit(a)}>Edit</button>
                <button type="button" className="btn btn-sm btn-lime" onClick={() => onChat(a)}>Chat</button>
              </div>
            </div>
          </article>
        ))}
        <button type="button" className="add-card" onClick={onNew}>
          <Icon name="plus" size={28} />
          {c.add}
        </button>
      </div>
    </div>
  )
}
