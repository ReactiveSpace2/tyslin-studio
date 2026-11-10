import { useCallback, useEffect, useRef, useState } from 'react'
import type { Agent, Attachment, ChannelMessage, KanbanCard, KanbanDoc, Message, PendingChange, PermissionChoice, RunEvent, Session } from '@shared/types'
import type { AgencyView } from '../agencies'

/** A tool call in a run, shown as one compact line. */
export interface Activity { id: string; name: string; args: string; done: boolean; isError: boolean }
/** A permission request from an external agent, waiting for an answer. */
export interface Permission { id: string; title: string; choices: PermissionChoice[]; sessionId: string; agentId: string }

/** What a worker did on its card, followed through that card's own chat. */
export interface WorkerRun {
  cardId: string
  sessionId: string
  agentId: string | null
  activity: Activity[]
  running: boolean
  permissions: Permission[]
  error: string | null
}

const TOOL_VERB: Record<string, string> = { list_files: 'Listed files', read_file: 'Read', write_file: 'Proposed', edit_file: 'Proposed an edit to' }
export function activityLabel(a: Activity): string {
  if (!TOOL_VERB[a.name]) return a.name
  let path = ''
  try { path = JSON.parse(a.args || '{}').path ?? '' } catch { /* args still streaming */ }
  return [TOOL_VERB[a.name], path].filter(Boolean).join(' ')
}

const applyEvent = (run: { activity: Activity[]; running: boolean; permissions: Permission[]; error: string | null }, e: RunEvent, agentId: string | null): void => {
  switch (e.type) {
    case 'run_started': run.running = true; run.activity = []; run.error = null; break
    case 'tool_call_start': run.activity = [...run.activity, { id: e.toolCallId, name: e.name, args: '', done: false, isError: false }]; break
    case 'tool_call_args': run.activity = run.activity.map((x) => (x.id === e.toolCallId ? { ...x, args: x.args + e.delta } : x)); break
    case 'tool_result': run.activity = run.activity.map((x) => (x.id === e.toolCallId ? { ...x, done: true, isError: e.isError } : x)); break
    case 'approval_needed': if ('permissionId' in e) run.permissions = [...run.permissions, { id: e.permissionId, title: e.title, choices: e.choices, sessionId: e.sessionId, agentId: agentId ?? '' }]; break
    case 'run_finished': run.running = false; run.permissions = []; break
    case 'run_error': run.running = false; run.permissions = []; run.error = e.error; break
  }
}

export interface Task {
  session: Session | null
  messages: Message[]
  streaming: string | null
  activity: Activity[]
  waiting: boolean
  liveRun: string | null
  permissions: Permission[]
  changes: PendingChange[]
  error: string | null
  stoppedAt: number | null
  /** The Lead's messages to you and the board, for a Lead's task. */
  channel: ChannelMessage[]
  board: KanbanDoc | null
  /** The board's cards that belong to this task (made or worked by the Lead since it started, before the next Lead task). */
  cards: KanbanCard[]
  workerRuns: Record<string, WorkerRun>
  cost: number
  send: (text: string, attachments: Attachment[]) => Promise<void>
  stop: () => Promise<void>
  answerPermission: (p: Permission, choiceId: string | null) => void
  reloadChanges: () => Promise<void>
  reloadChannel: () => void
}

/**
 * Everything one task shows: the chat (messages, the streaming reply, tool calls, permission requests,
 * staged changes), and for a Lead's task the board and the Lead's messages to you, narrowed to this task,
 * plus each worker's run on its card, followed through the card's chat.
 */
export function useTask(sessionId: string, agent: Agent | null, view: AgencyView | null, allSessions: Session[], onSessionsChanged: () => void): Task {
  const isLead = !!view && !!agent && view.lead?.id === agent.id
  const agency = view?.agency ?? null
  const [session, setSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState<string | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [waiting, setWaiting] = useState(false)
  const [liveRun, setLiveRun] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [changes, setChanges] = useState<PendingChange[]>([])
  const [error, setError] = useState<string | null>(null)
  const [stoppedAt, setStoppedAt] = useState<number | null>(null)
  const [channel, setChannel] = useState<ChannelMessage[]>([])
  const [board, setBoard] = useState<KanbanDoc | null>(null)
  const [tick, setTick] = useState(0)
  const [workerRuns, setWorkerRuns] = useState<Record<string, WorkerRun>>({})
  const sessionRef = useRef(sessionId)
  sessionRef.current = sessionId
  /** Run events for chats we don't know the card of yet (a worker's first lines), replayed once the board names them. */
  const buffer = useRef(new Map<string, RunEvent[]>())
  const cardSessions = useRef(new Map<string, string>())

  const reloadChanges = useCallback(async (): Promise<void> => {
    const c = await window.tyslin.changes.list(sessionId)
    if (sessionRef.current === sessionId) setChanges(c)
  }, [sessionId])
  const reloadChannel = useCallback((): void => setTick((t) => t + 1), [])

  // The chat itself.
  useEffect(() => {
    let live = true
    setError(null); setStreaming(null); setActivity([]); setWaiting(false); setLiveRun(null); setPermissions([]); setStoppedAt(null)
    void window.tyslin.sessions.list().then((all) => { if (live) setSession(all.find((s) => s.id === sessionId) ?? null) })
    // A reply may have started (or failed) before this screen was listening.
    void Promise.all([window.tyslin.sessions.messages(sessionId), window.tyslin.sessions.status(sessionId)]).then(([m, st]) => {
      if (!live) return
      setMessages(m)
      if (st.running) setStreaming((s) => s ?? '')
      else if (st.lastError && m[m.length - 1]?.role === 'user') setError(st.lastError)
    })
    void reloadChanges()
    return () => { live = false }
  }, [sessionId, reloadChanges])

  // The Lead's board and messages, reloaded when either changes.
  useEffect(() => {
    if (!isLead || !agency) { setChannel([]); setBoard(null); return }
    let live = true
    void window.tyslin.channels.list(agency.id).then((ms) => {
      if (!live) return
      setChannel([...ms].sort((a, b) => a.createdAt - b.createdAt))
      const unread = ms.filter((m) => !m.readAt).map((m) => m.id)
      if (unread.length) void window.tyslin.channels.markRead(unread)
    })
    void window.tyslin.studio.read(agency.projectId, agency.boardPath)
      .then((t) => { if (live) setBoard(JSON.parse(t) as KanbanDoc) })
      .catch(() => { if (live) setBoard(null) })
    return () => { live = false }
  }, [isLead, agency?.id, agency?.boardPath, agency?.projectId, tick])
  useEffect(() => {
    if (!isLead || !agency) return
    const offMsg = window.tyslin.channels.onMessage((m) => { if (m.agencyId === agency.id) reloadChannel() })
    const offBoard = window.tyslin.cards.onBoardChanged((p) => { if (p.projectId === agency.projectId) reloadChannel() })
    return () => { offMsg(); offBoard() }
  }, [isLead, agency?.id, agency?.projectId, reloadChannel])

  // This task's window on the agency: from the chat's start to the next Lead task (cards and messages are per agency).
  const start = session?.createdAt ?? 0
  const next = agent ? allSessions.filter((s) => s.agentId === agent.id && s.createdAt > start).sort((a, b) => a.createdAt - b.createdAt)[0] : undefined
  const end = next?.createdAt ?? Number.POSITIVE_INFINITY
  const inWindow = (t: number): boolean => t >= start && t < end
  // A card is this task's when it was made in the window, or when the Lead touched it then (assigned, moved,
  // edited: every board tool logs on the card), which is how template starter cards get reused for a brief.
  const belongs = (c: KanbanCard): boolean => inWindow(c.createdAt) || (c.log ?? []).some((l) => inWindow(l.at))
  const cards = isLead && board ? board.columns.flatMap((c) => c.cards).filter(belongs) : []
  const cardKey = cards.map((c) => c.id + ':' + (c.sessionId ?? '')).join(',')

  // Worker runs: follow each card's chat; seed from its current state so a run already going shows up.
  useEffect(() => {
    const known = new Map<string, string>()
    for (const c of cards) if (c.sessionId) known.set(c.sessionId, c.id)
    cardSessions.current = known
    setWorkerRuns((prev) => {
      const nextRuns: Record<string, WorkerRun> = {}
      for (const c of cards) {
        if (!c.sessionId) continue
        const was = prev[c.id]
        const run: WorkerRun = was && was.sessionId === c.sessionId ? was : { cardId: c.id, sessionId: c.sessionId, agentId: c.agentId ?? c.assignee ?? null, activity: [], running: c.status === 'running', permissions: [], error: null }
        const buffered = buffer.current.get(c.sessionId)
        if (buffered) { for (const e of buffered) applyEvent(run, e, run.agentId); buffer.current.delete(c.sessionId) }
        nextRuns[c.id] = run
      }
      return nextRuns
    })
  }, [cardKey])

  // One listener: this chat, every known worker chat, and a short buffer for the rest.
  useEffect(() => {
    return window.tyslin.sessions.onEvent((e) => {
      if (e.sessionId === sessionId) { void handleOwn(e); return }
      const cardId = cardSessions.current.get(e.sessionId)
      if (cardId) {
        setWorkerRuns((prev) => {
          const run = prev[cardId]
          if (!run) return prev
          const copy = { ...run }
          applyEvent(copy, e, run.agentId)
          return { ...prev, [cardId]: copy }
        })
        if (e.type === 'run_finished' || e.type === 'run_error') reloadChannel()
        return
      }
      if (!isLead) return
      const list = buffer.current.get(e.sessionId) ?? []
      list.push(e)
      buffer.current.set(e.sessionId, list.slice(-60))
    })
    async function handleOwn(e: RunEvent): Promise<void> {
      switch (e.type) {
        case 'run_started': setLiveRun(e.runId); setActivity([]); setStoppedAt(null); setStreaming((s) => s ?? ''); break
        case 'text_delta': setStreaming((s) => (s ?? '') + e.text); break
        case 'tool_call_start': setActivity((a) => [...a, { id: e.toolCallId, name: e.name, args: '', done: false, isError: false }]); break
        case 'tool_call_args': setActivity((a) => a.map((x) => (x.id === e.toolCallId ? { ...x, args: x.args + e.delta } : x))); break
        case 'tool_result': setActivity((a) => a.map((x) => (x.id === e.toolCallId ? { ...x, done: true, isError: e.isError } : x))); break
        case 'approval_needed':
          if ('permissionId' in e) setPermissions((p) => [...p, { id: e.permissionId, title: e.title, choices: e.choices, sessionId, agentId: agent?.id ?? '' }])
          else await reloadChanges()
          break
        case 'state_update': setWaiting(e.status === 'waiting_for_review'); break
        case 'run_finished':
        case 'run_error': {
          setStreaming(null); setWaiting(false); setPermissions([])
          if (e.type === 'run_error') setError(e.error)
          const [m, c] = await Promise.all([window.tyslin.sessions.messages(sessionId), window.tyslin.changes.list(sessionId)])
          if (sessionRef.current === sessionId) { setMessages(m); setChanges(c) }
          onSessionsChanged()
          break
        }
      }
    }
  }, [sessionId, isLead, agent?.id, reloadChanges, reloadChannel, onSessionsChanged])

  const send = async (text: string, attachments: Attachment[]): Promise<void> => {
    const t = text.trim()
    if (!t && !attachments.length) return
    setError(null)
    setStoppedAt(null)
    setMessages((m) => [...m, { id: `pending-${Date.now()}`, sessionId, role: 'user', content: t, createdAt: Date.now(), attachments }])
    setStreaming('')
    try {
      await window.tyslin.sessions.send(sessionId, t, attachments.map((a) => a.id))
      onSessionsChanged()
    } catch (err) {
      setMessages((m) => m.filter((x) => !x.id.startsWith('pending-')))
      setStreaming(null)
      setError(err instanceof Error ? err.message.replace(/^.*Error: /, '') : String(err))
      throw err
    }
  }
  const stop = async (): Promise<void> => { await window.tyslin.sessions.stop(sessionId); setStoppedAt(Date.now()) }
  const answerPermission = (p: Permission, choiceId: string | null): void => {
    if (p.sessionId === sessionId) setPermissions((list) => list.filter((x) => x.id !== p.id))
    else setWorkerRuns((prev) => { const cardId = cardSessions.current.get(p.sessionId); const run = cardId ? prev[cardId] : null; return run ? { ...prev, [cardId!]: { ...run, permissions: run.permissions.filter((x) => x.id !== p.id) } } : prev })
    void window.tyslin.sessions.answerPermission(p.id, choiceId)
  }
  const cost = cards.reduce((n, c) => n + (c.cost ?? 0), 0)
  const channelInWindow = channel.filter((m) => inWindow(m.createdAt))

  return { session, messages, streaming, activity, waiting, liveRun, permissions, changes, error, stoppedAt, channel: channelInWindow, board, cards, workerRuns, cost, send, stop, answerPermission, reloadChanges, reloadChannel }
}
