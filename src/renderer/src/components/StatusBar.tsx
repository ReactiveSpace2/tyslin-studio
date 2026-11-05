import { useEffect, useState } from 'react'
import type { Agent, ProviderSettings, Session, UpdateStatus } from '@shared/types'
import type { Route } from '../App'
import { Icon } from './Icon'
import { OrgSwitcher } from './OrgSwitcher'

interface Props {
  route: Route
  agents: Agent[]
  sessions: Session[]
  onNavigate: (r: Route) => void
  onNewOrg: () => void
}

/**
 * Bottom bar: organization switcher, where data lives, replies in progress, file changes waiting for
 * review, which models have a key, and the app version or a pending update. Everything here is live.
 */
export function StatusBar({ route, agents, sessions, onNavigate, onNewOrg }: Props): JSX.Element {
  const [keys, setKeys] = useState<ProviderSettings | null>(null)
  const [pending, setPending] = useState(0)
  const [update, setUpdate] = useState<UpdateStatus | null>(null)
  const [version, setVersion] = useState('')
  /** Runs in progress: run id → session id. */
  const [running, setRunning] = useState<Map<string, string>>(new Map())

  const refreshPending = (): void => { void window.tyslin.app.dashboard().then((d) => setPending(d.pendingChanges)) }

  useEffect(() => {
    void window.tyslin.app.info().then((i) => setVersion(i.version))
    void window.tyslin.updates.status().then(setUpdate)
    return window.tyslin.updates.onStatus(setUpdate)
  }, [])

  // Keys and reviews can change on any screen, so look again when the screen changes.
  useEffect(() => {
    void window.tyslin.settings.get().then(setKeys)
    refreshPending()
  }, [route])

  useEffect(() => window.tyslin.sessions.onEvent((e) => {
    if (e.type === 'run_started') setRunning((m) => new Map(m).set(e.runId, e.sessionId))
    if (e.type === 'run_finished' || e.type === 'run_error') {
      setRunning((m) => { const n = new Map(m); n.delete(e.runId); return n })
      refreshPending()
    }
    if (e.type === 'approval_needed') refreshPending()
  }), [])

  const ready = keys ? ([['Claude', keys.anthropicKeySet], ['OpenAI', keys.openaiKeySet], ['Gemini', keys.geminiKeySet]] as const).filter(([, on]) => on).map(([n]) => n) : []
  const busy = [...running.values()].map((sid) => agents.find((a) => a.id === sessions.find((s) => s.id === sid)?.agentId)?.name ?? 'An agent')
  const busyText = busy.length === 1 ? `${busy[0]} is replying…` : `${busy.length} agents are replying…`

  return (
    <footer className="statusbar" aria-label="Status">
      <div className="statusbar-group">
        <OrgSwitcher onNewOrg={onNewOrg} />
        <span className="status-item" title="Agents, chats and keys are stored on this computer">
          <span className="status-dot" aria-hidden="true" /> Local
        </span>
        {busy.length > 0 && (
          <span className="status-item status-busy" role="status"><span className="status-pulse" aria-hidden="true" />{busyText}</span>
        )}
      </div>
      <div className="statusbar-group">
        <button type="button" className={'status-item status-btn' + (pending ? ' attention' : '')} onClick={() => onNavigate({ name: 'dashboard' })}
          title="File changes waiting for your review">
          <Icon name="file" size={12} />
          {pending ? `${pending} to review` : 'Nothing to review'}
        </button>
        <button type="button" className={'status-item status-btn' + (ready.length ? '' : ' attention')} onClick={() => onNavigate({ name: 'settings', tab: 'models' })}
          title="Model providers with a key saved">
          <Icon name="agents" size={12} />
          {ready.length ? ready.join(' · ') : 'Add a model key'}
        </button>
        {update && (update.state === 'ready' || update.state === 'available') ? (
          <button type="button" className="status-item status-btn attention"
            onClick={() => void (update.state === 'ready' ? window.tyslin.updates.install() : window.tyslin.updates.openDownload())}>
            {update.state === 'ready' ? `Restart to update to v${update.version}` : `v${update.version} is out`}
          </button>
        ) : (
          <span className="status-item mono">v{version}</span>
        )}
      </div>
    </footer>
  )
}
