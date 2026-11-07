import { useEffect, useRef, useState } from 'react'
import type { Agent, Session, UpdateStatus } from '@shared/types'
import { PROVIDER_NAME } from '@shared/models'
import { modelLabel, refreshDefaultModel, useDefaultModel } from '../defaultModel'
import type { Route } from '../App'
import { updateTask, useTasks } from '../activity'
import { Icon } from './Icon'
import { useGDrive } from './GoogleDrive'
import { ZoomControl } from './ZoomControl'
import { WorkingDots } from './Working'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

/** A status-bar item: small, muted, a card-coloured hover; `attention` turns it green. */
const ITEM = 'inline-flex h-[22px] py-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-2'
const itemBtn = (attention = false): string => cn(ITEM, 'text-xs font-normal text-muted-foreground hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring has-[>svg]:px-2',
  attention && 'font-semibold text-green hover:text-green')

interface Props {
  route: Route
  agents: Agent[]
  sessions: Session[]
  onNavigate: (r: Route) => void
  onOpenChat: (agentId: string, projectId: string | null, sessionId?: string) => void
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
 * Bottom bar: the zoom slider at the left (Drive is in the rail), then everything running (replies, installs,
 * update downloads) with a list on click, file changes waiting for review, the default model (and whether its key is saved),
 * and the app version or a pending update. Everything here is live.
 */
export function StatusBar({ route, agents, sessions, onNavigate, onOpenChat }: Props): JSX.Element {
  const dm = useDefaultModel()
  const gd = useGDrive()
  const gdStart = useRef<number | null>(null)
  if (gd?.syncing && gdStart.current === null) gdStart.current = Date.now()
  if (!gd?.syncing) gdStart.current = null
  const [pending, setPending] = useState(0)
  const [update, setUpdate] = useState<UpdateStatus | null>(null)
  const [version, setVersion] = useState('')
  const [runs, setRuns] = useState<Map<string, Run>>(new Map())
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(Date.now())
  const tasks = useTasks()

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
    ...(gd?.syncing ? [{ id: 'gdrive', title: 'Google Drive', detail: `Syncing ${gd.current ?? ''}`, startedAt: gdStart.current ?? now }] : []),
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

  // Outside clicks and Escape close the list (the Popover handles both and returns focus to the button).

  const summary = items.length === 1 ? `${items[0].title}: ${items[0].detail}` : `${items.length} running`

  return (
    <footer className="flex h-7 flex-none items-center justify-between gap-3 border-t border-border bg-panel pr-2 pl-3.5 text-xs text-muted-foreground select-none" aria-label="Status">
      <div className="flex min-w-0 items-center gap-1">
        <ZoomControl compact />
        {items.length > 0 && (
          <div className="relative min-w-0">
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" className={cn(itemBtn(), 'max-w-full text-foreground')}>
                  <WorkingDots />
                  <span className="max-w-[360px] truncate">{summary}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" sideOffset={8} aria-label="Running"
                className="flex max-h-[60vh] w-[340px] flex-col gap-2 overflow-y-auto rounded-xl p-2.5 shadow-[0_8px_24px_var(--shadow)]">
                <div className="flex items-center justify-between px-1">
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Running</span>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {items.map((it) => {
                    const s = it.run && (it.run.session ?? sessions.find((x) => x.id === it.run!.sessionId))
                    return (
                      <li key={it.id} className="flex flex-col gap-1.5 rounded-lg border border-border p-2.5">
                        <div className="flex items-center justify-between gap-2 text-[13px]">
                          <strong className="font-semibold">{it.title}</strong>
                          <span className="font-mono text-xs text-muted-foreground">{it.percent !== undefined ? `${Math.round(it.percent)}%` : elapsed(it.startedAt, now)}</span>
                        </div>
                        <span className="truncate text-xs text-muted-foreground" title={it.detail}>{it.detail}</span>
                        {it.percent !== undefined ? (
                          <Progress value={it.percent} aria-hidden="true"
                            className="h-1 rounded-sm bg-accent [&>[data-slot=progress-indicator]]:rounded-sm [&>[data-slot=progress-indicator]]:bg-lime [&>[data-slot=progress-indicator]]:duration-300" />
                        ) : (
                          <span className="relative h-1 overflow-hidden rounded-sm bg-accent" aria-hidden="true">
                            <span className="absolute inset-y-0 w-[35%] animate-slide rounded-sm bg-lime motion-reduce:left-0 motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-50" />
                          </span>
                        )}
                        {it.run && s && (
                          <div className="flex items-center gap-1.5">
                            <Button type="button" variant="outline" size="sm" onClick={() => { setOpen(false); onOpenChat(s.agentId, s.projectId, s.id) }}>Open chat</Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => void window.tyslin.sessions.stop(s.id)}>
                              <Icon name="stop" size={12} /> Stop
                            </Button>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </PopoverContent>
            </Popover>
            <span className="sr-only" role="status">{summary}</span>
          </div>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-1">
        <Button type="button" variant="ghost" className={itemBtn(!!pending)} onClick={() => onNavigate({ name: 'home', focus: 'activity' })}
          title="File changes waiting for your review">
          <Icon name="file" size={12} />
          {pending ? `${pending} to review` : 'Nothing to review'}
        </Button>
        {dm && (
          <Button type="button" variant="ghost" className={itemBtn(!dm.ready)} onClick={() => onNavigate({ name: 'settings', tab: 'models' })}
            title={dm.ready
              ? `Default model, used by the Leads and cards on "Default model": ${modelLabel(dm)}. Click to change it.`
              : `The default model needs a ${PROVIDER_NAME[dm.provider]} key. Click to add one.`}>
            <Icon name="agents" size={12} />
            <span className="font-mono">{modelLabel(dm)}</span>
            {!dm.ready && <span>· add a key</span>}
          </Button>
        )}
        {update && (update.state === 'ready' || update.state === 'available') ? (
          <Button type="button" variant="ghost" className={itemBtn(true)}
            onClick={() => void (update.state === 'ready' ? window.tyslin.updates.install() : window.tyslin.updates.openDownload())}>
            {update.state === 'ready' ? `Restart to update to v${update.version}` : `v${update.version} is out`}
          </Button>
        ) : (
          <span className={cn(ITEM, 'font-mono')}>v{version}</span>
        )}
      </div>
    </footer>
  )
}
