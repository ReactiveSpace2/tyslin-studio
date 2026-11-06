import { useEffect, useState } from 'react'
import type { Agent, AgentKind, StarterInfo } from '@shared/types'
import { Avatar } from './Avatar'
import { getCurrentProject } from '../currentProject'

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))

/** Starter agents or assistants from the library, each with Add (a copy goes into the selected project). */
export function StarterList({ kind, agents, onAdded, compact }: { kind: AgentKind; agents: Agent[]; onAdded: (a: Agent) => void; compact?: boolean }): JSX.Element {
  const [list, setList] = useState<StarterInfo[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { void window.tyslin.agents.starters().then((s) => setList(s.filter((x) => x.kind === kind))) }, [kind])
  const projectId = getCurrentProject()
  const here = new Set(agents.filter((a) => a.kind === kind && a.projectId === projectId).map((a) => a.name))
  const add = async (s: StarterInfo): Promise<void> => {
    if (!projectId) return
    setBusy(s.name); setError(null)
    try { onAdded(await window.tyslin.agents.addStarter(s.name, projectId)) } catch (e) { setError(errorText(e)) } finally { setBusy(null) }
  }
  return (
    <div className={'starters' + (compact ? ' compact' : '')}>
      {list.map((s) => (
        <div key={s.name} className="starter">
          <Avatar shape={s.shape} tone={s.tone} head={s.head} size={compact ? 26 : 36} />
          <span className="starter-text"><strong>{s.name}</strong>{!compact && <small>{s.description}</small>}</span>
          <button type="button" className="btn btn-sm" disabled={here.has(s.name) || busy === s.name} onClick={() => void add(s)}
            aria-label={`Add ${s.name}`}>{here.has(s.name) ? 'Added' : busy === s.name ? 'Adding…' : 'Add'}</button>
        </div>
      ))}
      {error && <p className="hint account-error" role="alert">{error}</p>}
    </div>
  )
}
