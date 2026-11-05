import { useEffect, useRef, useState } from 'react'
import type { Agent, Session, UpdateStatus } from '@shared/types'
import { PROVIDER_NAME } from '@shared/models'
import { modelLabel, refreshDefaultModel, useDefaultModel } from '../defaultModel'
import type { Route } from '../App'
import { updateTask, useTasks } from '../activity'
import { Icon } from './Icon'
import { OrgSwitcher } from './OrgSwitcher'

interface Props {
  route: Route
  agents: Agent[]
  sessions: Session[]
  onNavigate: (r: Route) => void
  onOpenChat: (agentId: string, projectId: string | null, sessionId?: string) => void
  onNewOrg: () => void
}

/** A reply in progress and what it is doing right now, from the run-event stream. */
interface Run {
  runId: string
  sessionId: string
  step: string
  startedAt: number
  /** Looked up when the run starts, so new chats show their agent straight away. */
  session?: Session
}

/** One row in the Running list. */
interface Item {
  id: string
  title: string
  detail: string
  startedAt: number
  /** 0–100 when known; otherwise the bar is indeterminate. */
  percent?: number
  run?: Run
}

const TOOL_STEP: Record<string, string> = {
  list_files: 'Listing project files',
  read_file: 'Reading a file',
  write_file: 'Proposing a file change',
  edit_file: 'Proposing a file change'
}

const elapsed = (from: number, now: number): string => {
  const s = Math.max(0, Math.round((now - from) / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

/**
 * Bottom bar: organization switcher, where data lives, everything running (replies, installs,
 * update downloads) with a list on click, file changes waiting for review, the default model (and whether its key is saved),
 * and the app version or a pending update. Everything here is live.
 */
export function StatusBar({ route, agents, sessions, onNavigate, onOpenChat, onNewOrg }: Props): JSX.Element {
  const dm = useDefaultModel()
  const [pending, setPending] = useState(0)
  const [update, setUpdate] = useState<UpdateStatus | null>(null)
  const [version, setVersion] = useState('')
  const [runs, setRuns] = useState<Map<string, Run>>(new Map())
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(Date.now())
  const tasks = useTasks()
  const menuRef = useRef<HTMLDivElement>(null)

  const refreshPending = (): void => { void window.tyslin.app.dashboard().then((d) => setPending(d.pendingChanges)) }

  useEffect(() => {
    void window.tyslin.app.info().then((i) => setVersion(i.version))
    void window.tyslin.updates.status().then(setUpdate)
    return window.tyslin.updates.onStatus(setUpdate)
  }, [])

  // Keys, the default model and reviews can change on any screen, so look again when the screen changes.
  useEffect(() => {
    void refreshDefaultModel()
    refreshPending()
  }, [route])

  // Follow every reply through its steps.
  useEffect(() => window.tyslin.sessions.onEvent((e) => {
    const setStep = (step: string): void => setRuns((m) => {
      const r = m.get(e.runId)
      return r ? new Map(m).set(e.runId, { ...r, step }) : m
    })
    switch (e.type) {
      case 'run_started':
        setRuns((m) => new Map(m).set(e.runId, { runId: e.runId, sessionId: e.sessionId, step: 'Thinking', startedAt: Date.now() }))
        void window.tyslin.sessions.list().then((all) => {
          const session = all.find((x) => x.id === e.sessionId)
          if (session) setRuns((m) => { const r = m.get(e.runId); return r ? new Map(m).set(e.runId, { ...r, session }) : m })
        })
        break
      case 'text_delta': setStep('Writing the reply'); break
      case 'tool_call_start': setStep(TOOL_STEP[e.name] ?? `Using ${e.name}`); break
      case 'tool_result': setStep('Thinking'); break
      case 'approval_needed':
        setStep('permissionId' in e ? `Waiting for permission: ${e.title}` : 'Waiting for your review')
        refreshPending()
        break
      case 'state_update': setStep(e.status === 'waiting_for_review' ? 'Waiting for your review' : 'Thinking'); break
      case 'run_finished':
      case 'run_error':
        setRuns((m) => { const n = new Map(m); n.delete(e.runId); return n })
        refreshPending()
        break
    }
  }), [])

  // Last line of installer output as the install task's detail.
  useEffect(() => window.tyslin.engines.onInstallOutput((o) => {
    const line = o.text.split('\n').map((l) => l.trim()).filter(Boolean).pop()
    if (line) updateTask(`engine:${o.id}`, line.slice(0, 120))
  }), [])

  const items: Item[] = [
    ...[...runs.values()].map((r) => {
      const s = r.session ?? sessions.find((x) => x.id === r.sessionId)
      const a = agents.find((x) => x.id === s?.agentId)
      return { id: r.runId, title: a?.name ?? 'Agent', detail: r.step, startedAt: r.startedAt, run: r }
    }),
    ...tasks.map((t) => ({ id: t.id, title: t.title, detail: t.detail ?? 'Working', startedAt: t.startedAt })),
    ...(update?.state === 'downloading'
      ? [{ id: 'update', title: `Downloading v${update.version ?? ''}`, detail: 'App update', startedAt: now, percent: update.percent ?? 0 }]
      : [])
  ]

  // Tick the elapsed times while anything runs; close the list when it empties.
  useEffect(() => {
    if (!items.length) { setOpen(false); return }
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [items.length])

  // Close the list on an outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const summary = items.length === 1 ? `${items[0].title}: ${items[0].detail}` : `${items.length} running`

  return (
    <footer className="statusbar" aria-label="Status">
      <div className="statusbar-group">
        <OrgSwitcher onNewOrg={onNewOrg} />
        <span className="status-item" title="Agents, chats and keys are stored on this computer">
          <span className="status-dot" aria-hidden="true" /> Local
        </span>
        {items.length > 0 && (
          <div className="running" ref={menuRef}>
            <button type="button" className="status-item status-btn status-busy" aria-haspopup="dialog" aria-expanded={open}
              onClick={() => setOpen((o) => !o)}>
              <span className="status-pulse" aria-hidden="true" />
              <span className="running-summary">{summary}</span>
            </button>
            <span className="sr-only" role="status">{summary}</span>
            {open && (
              <div className="running-panel" role="dialog" aria-label="Running">
                <div className="running-head">
                  <span className="section-label" style={{ padding: 0 }}>Running</span>
                  <span className="hint">{items.length}</span>
                </div>
                <ul>
                  {items.map((it) => {
                    const s = it.run && (it.run.session ?? sessions.find((x) => x.id === it.run!.sessionId))
                    return (
                      <li key={it.id} className="running-row">
                        <div className="running-top">
                          <strong>{it.title}</strong>
                          <span className="mono hint">{it.percent !== undefined ? `${Math.round(it.percent)}%` : elapsed(it.startedAt, now)}</span>
                        </div>
                        <span className="running-detail" title={it.detail}>{it.detail}</span>
                        <span className={'running-bar' + (it.percent === undefined ? ' indeterminate' : '')} aria-hidden="true">
                          <span style={it.percent !== undefined ? { width: `${it.percent}%` } : undefined} />
                        </span>
                        {it.run && s && (
                          <div className="row" style={{ gap: 6 }}>
                            <button type="button" className="btn btn-sm" onClick={() => { setOpen(false); onOpenChat(s.agentId, s.projectId, s.id) }}>Open chat</button>
                            <button type="button" className="btn btn-sm" onClick={() => void window.tyslin.sessions.stop(s.id)}>
                              <Icon name="stop" size={12} /> Stop
                            </button>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="statusbar-group">
        <button type="button" className={'status-item status-btn' + (pending ? ' attention' : '')} onClick={() => onNavigate({ name: 'dashboard' })}
          title="File changes waiting for your review">
          <Icon name="file" size={12} />
          {pending ? `${pending} to review` : 'Nothing to review'}
        </button>
        {dm && (
          <button type="button" className={'status-item status-btn' + (dm.ready ? '' : ' attention')} onClick={() => onNavigate({ name: 'settings', tab: 'models' })}
            title={dm.ready
              ? `Default model, used by Mind mapper, Canvas and Workflows: ${modelLabel(dm)}. Click to change it.`
              : `The default model needs a ${PROVIDER_NAME[dm.provider]} key. Click to add one.`}>
            <Icon name="agents" size={12} />
            <span className="mono">{modelLabel(dm)}</span>
            {!dm.ready && <span>· add a key</span>}
          </button>
        )}
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
