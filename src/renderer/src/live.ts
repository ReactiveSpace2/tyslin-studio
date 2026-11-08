import { useCallback, useEffect, useRef, useState } from 'react'
import type { Agent, AgentStatus, ChannelMessage, KanbanCard, KanbanDoc, RunEvent } from '@shared/types'
import { BRIEF_LOG } from '@shared/agencies'
import type { AgencyView } from './agencies'
import { firstName } from './boardStats'

/**
 * The agency Live screen's data: one stream of events, built only from what the app already records.
 * History comes from the board's card logs and the Lead's messages (channels); live updates come from
 * run events (tool calls, replies), board changes and new Lead messages. Nothing is invented: an event
 * the app doesn't record (a hand-off) is read from the card log line that says it ("Assigned to …").
 */

export type LiveKind = 'brief' | 'plan' | 'handoff' | 'start' | 'tool' | 'result' | 'failed' | 'review' | 'accepted' | 'declined' | 'move' | 'note' | 'question' | 'digest' | 'message' | 'reply' | 'permission'

/** 'you' is the boss; anything else is an agent id in this agency. */
export type LiveActor = string

export interface LiveEvent {
  id: string
  at: number
  kind: LiveKind
  from: LiveActor
  /** Who it was sent to; null for things one agent did on its own (a tool call, a note). */
  to: LiveActor | null
  text: string
  /** Arrived while the screen was open (only these animate on the map). */
  live: boolean
}

export const KIND_LABEL: Record<LiveKind, string> = {
  brief: 'BRIEF', plan: 'PLAN', handoff: 'HAND-OFF', start: 'START', tool: 'TOOL', result: 'RESULT', failed: 'FAILED',
  review: 'REVIEW', accepted: 'ACCEPTED', declined: 'SENT BACK', move: 'MOVE', note: 'NOTE', question: 'QUESTION',
  digest: 'DIGEST', message: 'MESSAGE', reply: 'REPLY', permission: 'PERMISSION'
}

/** Badge look per kind: hand-offs and things for you are lime, results soft, the rest outline. */
export const KIND_TONE: Record<LiveKind, 'lime' | 'soft' | 'outline'> = {
  brief: 'soft', plan: 'outline', handoff: 'lime', start: 'outline', tool: 'outline', result: 'soft', failed: 'outline',
  review: 'lime', accepted: 'soft', declined: 'outline', move: 'outline', note: 'outline', question: 'lime',
  digest: 'soft', message: 'soft', reply: 'soft', permission: 'lime'
}

const MAX_EVENTS = 80

interface Ctx { leadId: string | null; byName: Map<string, string> }

const nameMap = (members: Agent[]): Map<string, string> => {
  const m = new Map<string, string>()
  for (const a of members) { m.set(a.name.trim().toLowerCase(), a.id); m.set(firstName(a.name).toLowerCase(), a.id) }
  return m
}
const idOf = (ctx: Ctx, name: string | undefined): string | null => (name ? ctx.byName.get(name.trim().toLowerCase()) ?? null : null)

/** One card log line → an event, or null when the line isn't about this agency's people. */
export function fromLog(card: KanbanCard, entry: { at: number; text: string }, ctx: Ctx): LiveEvent | null {
  const t = entry.text.trim()
  const title = `"${card.title}"`
  const base = { id: `log:${card.id}:${entry.at}:${t}`, at: entry.at, live: false }
  const owner = card.assignee || card.agentId || ctx.leadId
  const lead = ctx.leadId
  let m: RegExpExecArray | null
  if (t === BRIEF_LOG) return lead ? { ...base, kind: 'brief', from: 'you', to: lead, text: `Brief: ${card.title}` } : null
  if ((m = /^Added by (.+?)(?:, assigned to (.+))?$/.exec(t))) {
    const by = idOf(ctx, m[1]); const who = idOf(ctx, m[2])
    if (!by) return null
    if (who && who !== by) return { ...base, kind: 'handoff', from: by, to: who, text: `${title} is yours.` }
    return { ...base, kind: 'plan', from: by, to: null, text: `Added ${title} to the board.` }
  }
  if ((m = /^Assigned to (.+) by (.+)$/.exec(t))) {
    const who = idOf(ctx, m[1]); const by = idOf(ctx, m[2])
    return who && by ? { ...base, kind: 'handoff', from: by, to: who, text: `${title} is yours.` } : null
  }
  if ((m = /^Started with (.+)$/.exec(t))) {
    const who = idOf(ctx, m[1])
    return who ? { ...base, kind: 'start', from: who, to: null, text: `Started on ${title}.` } : null
  }
  if ((m = /^(.+?) finished(?: · (\d+(?:\.\d+)?) est\.)?$/.exec(t))) {
    const who = idOf(ctx, m[1])
    if (!who) return null
    const cost = m[2] ? ` (est. $${Number(m[2]).toFixed(2)})` : ''
    return { ...base, kind: 'result', from: who, to: who !== lead ? lead : null, text: `Finished ${title}.${cost}` }
  }
  if ((m = /^(.+?) failed: (.*)$/.exec(t))) {
    const who = idOf(ctx, m[1])
    return who ? { ...base, kind: 'failed', from: who, to: who !== lead ? lead : null, text: `Couldn't finish ${title}: ${m[2]}` } : null
  }
  if (t === 'File changes are waiting for review') return owner ? { ...base, kind: 'review', from: owner, to: null, text: `Changes on ${title} wait for your review.` } : null
  if (t === 'Changes reviewed and accepted') return { ...base, kind: 'accepted', from: 'you', to: null, text: `You accepted the changes on ${title}.` }
  if (t === 'Changes reviewed; none accepted') return { ...base, kind: 'declined', from: 'you', to: null, text: `You turned down the changes on ${title}.` }
  if ((m = /^Moved to (.+)$/.exec(t))) return lead ? { ...base, kind: 'move', from: lead, to: null, text: `${title} moved to ${m[1]}.` } : null
  if ((m = /^(.+?): (.+)$/s.exec(t))) {
    const who = idOf(ctx, m[1])
    return who ? { ...base, kind: 'note', from: who, to: null, text: `On ${title}: ${m[2]}` } : null
  }
  return null
}

export function boardEvents(doc: KanbanDoc, ctx: Ctx): LiveEvent[] {
  const out: LiveEvent[] = []
  for (const col of doc.columns ?? []) for (const card of col.cards ?? []) for (const e of card.log ?? []) {
    const ev = fromLog(card, e, ctx)
    if (ev) out.push(ev)
  }
  return out
}

const MSG_KIND: Record<ChannelMessage['kind'], LiveKind> = { brief: 'message', question: 'question', review: 'review', digest: 'digest' }

export function channelEvents(m: ChannelMessage, live: boolean): LiveEvent[] {
  const out: LiveEvent[] = [{ id: `ch:${m.id}`, at: m.createdAt, kind: MSG_KIND[m.kind], from: m.agentId, to: 'you', text: m.text, live }]
  if (m.reply && m.repliedAt) out.push({ id: `chr:${m.id}`, at: m.repliedAt, kind: 'reply', from: 'you', to: m.agentId, text: m.reply, live })
  return out
}

/** A short, readable detail from a tool call's JSON arguments: a path, an address, a title. */
export function toolDetail(args: string): string {
  let o: Record<string, unknown>
  try { o = JSON.parse(args) as Record<string, unknown> } catch { return '' }
  for (const k of ['path', 'file_path', 'filePath', 'url', 'query', 'title', 'column', 'assignee', 'command', 'text']) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) { const s = v.trim().replace(/\s+/g, ' '); return s.length > 60 ? `${s.slice(0, 59)}…` : s }
  }
  return ''
}

export interface LiveAgent {
  agent: Agent
  working: boolean
  /** What it is doing now, in a few words ("Using read_file", "Writing a reply", "Idle"). */
  doing: string
  /** It is writing a reply right now (typing dots on the map). */
  typing: boolean
  lastTool: string
  /** Its current or latest card, and the column it is in. */
  card: { title: string; column: string; running: boolean } | null
  /**
   * How far along, from the board only (the app records no percentage): a worker's card by its column's place
   * on the board (first column 0, last 100); the Lead by the share of the board's cards in Done.
   */
  progress: { value: number; label: string }
  /** Its card sits in the Done column and it isn't working. */
  done: boolean
}

export interface AgencyLive {
  events: LiveEvent[]
  agents: LiveAgent[]
  unread: number
  board: KanbanDoc | null
  loaded: boolean
}

const statusLine = (s: AgentStatus | undefined): string => {
  if (!s) return 'Idle'
  if (s.state === 'working') return 'Working'
  if (s.state === 'paused') return 'Paused'
  if (s.state === 'setup') return s.reason || 'Needs setup'
  if (s.state === 'failed') return s.reason ? `Last run failed: ${s.reason}` : 'Last run failed'
  return 'Idle'
}

function cardFor(doc: KanbanDoc | null, agentId: string): (LiveAgent['card'] & { place: number }) | null {
  if (!doc) return null
  const cols = doc.columns ?? []
  let best: { card: KanbanCard; column: string; place: number; score: number } | null = null
  for (const [ci, col] of cols.entries()) for (const card of col.cards ?? []) {
    if ((card.assignee || card.agentId) !== agentId) continue
    const t = col.title.trim().toLowerCase()
    const last = card.log?.[card.log.length - 1]?.at ?? card.createdAt
    const score = (card.status === 'running' ? 3e13 : 0) + (t === 'in progress' ? 2e13 : t === 'done' ? 0 : 1e13) + last
    if (!best || score > best.score) best = { card, column: col.title, place: cols.length > 1 ? Math.round((ci / (cols.length - 1)) * 100) : 0, score }
  }
  return best ? { title: best.card.title, column: best.column, running: best.card.status === 'running', place: best.place } : null
}

/** Live data for one agency. Re-reads the board when it changes and follows the agency's runs. */
export function useAgencyLive(view: AgencyView): AgencyLive {
  const { agency, lead, workers } = view
  const members = lead ? [lead, ...workers] : workers
  const memberKey = members.map((a) => `${a.id}:${a.name}`).join('|')
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [board, setBoard] = useState<KanbanDoc | null>(null)
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({})
  const [doing, setDoing] = useState<Record<string, string>>({})
  const [lastTool, setLastTool] = useState<Record<string, string>>({})
  const [unread, setUnread] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const seen = useRef(new Set<string>())

  const add = useCallback((evs: LiveEvent[]) => {
    const fresh = evs.filter((e) => !seen.current.has(e.id))
    if (!fresh.length) return
    for (const e of fresh) seen.current.add(e.id)
    setEvents((prev) => [...fresh, ...prev].sort((a, b) => b.at - a.at).slice(0, MAX_EVENTS))
  }, [])

  useEffect(() => {
    let alive = true
    seen.current = new Set()
    setEvents([]); setLoaded(false)
    const ids = new Set(members.map((a) => a.id))
    const ctx: Ctx = { leadId: lead?.id ?? null, byName: nameMap(members) }
    const sessionAgent = new Map<string, string>()
    const toolCalls = new Map<string, { agentId: string; name: string; args: string }>()
    let firstLoad = true

    const loadBoard = async (): Promise<void> => {
      let doc: KanbanDoc | null = null
      try { doc = JSON.parse(await window.tyslin.studio.read(agency.projectId, agency.boardPath)) as KanbanDoc } catch { doc = null }
      if (!alive) return
      setBoard(doc)
      if (doc) add(boardEvents(doc, ctx).map((e) => (firstLoad ? e : { ...e, live: true })))
    }
    const loadChannel = async (): Promise<void> => {
      const list = await window.tyslin.channels.list(agency.id).catch(() => [] as ChannelMessage[])
      if (!alive) return
      add(list.flatMap((m) => channelEvents(m, !firstLoad)))
      setUnread(list.filter((m) => m.readAt === null).length)
    }
    const loadStatuses = async (): Promise<void> => {
      const list = await window.tyslin.agents.statuses().catch(() => [] as AgentStatus[])
      if (alive) setStatuses(Object.fromEntries(list.filter((s) => ids.has(s.agentId)).map((s) => [s.agentId, s])))
    }
    let sessionsLoading: Promise<void> | null = null
    const loadSessions = (): Promise<void> => {
      sessionsLoading ??= window.tyslin.sessions.list().then((list) => {
        for (const s of list) sessionAgent.set(s.id, s.agentId)
      }).catch(() => undefined).finally(() => { sessionsLoading = null })
      return sessionsLoading
    }

    const setDo = (agentId: string, text: string | null): void => setDoing((d) => {
      if ((d[agentId] ?? null) === text) return d
      const next = { ...d }
      if (text === null) delete next[agentId]; else next[agentId] = text
      return next
    })

    const handle = (e: RunEvent, agentId: string): void => {
      if (!ids.has(agentId)) return
      switch (e.type) {
        case 'run_started':
          setDo(agentId, 'Starting')
          if (agentId === lead?.id) add([{ id: `run:${e.runId}`, at: Date.now(), kind: 'start', from: agentId, to: null, text: 'Started a run.', live: true }])
          void loadStatuses()
          break
        case 'text_delta': setDo(agentId, 'Writing a reply'); break
        case 'tool_call_start':
          toolCalls.set(e.toolCallId, { agentId, name: e.name, args: '' })
          setDo(agentId, `Using ${e.name}`)
          break
        case 'tool_call_args': { const c = toolCalls.get(e.toolCallId); if (c) c.args += e.delta; break }
        case 'tool_call_end': {
          const c = toolCalls.get(e.toolCallId)
          if (!c) break
          toolCalls.delete(e.toolCallId)
          const detail = toolDetail(c.args)
          setLastTool((t) => ({ ...t, [agentId]: c.name }))
          add([{ id: `tool:${e.toolCallId}`, at: Date.now(), kind: 'tool', from: agentId, to: null, text: detail ? `${c.name} · ${detail}` : c.name, live: true }])
          break
        }
        case 'approval_needed':
          add([{ id: `ask:${e.toolCallId}`, at: Date.now(), kind: 'permission', from: agentId, to: null, text: 'filePath' in e ? `Staged a change to ${e.filePath} for your review.` : `Asked for permission: ${e.title}`, live: true }])
          break
        case 'run_finished':
        case 'run_error':
          setDo(agentId, null)
          void loadStatuses()
          break
        default: break
      }
    }

    void Promise.all([loadBoard(), loadChannel(), loadStatuses(), loadSessions()]).then(() => { firstLoad = false; if (alive) setLoaded(true) })
    const offRun = window.tyslin.sessions.onEvent((e) => {
      const agentId = sessionAgent.get(e.sessionId)
      if (agentId) { handle(e, agentId); return }
      void loadSessions().then(() => { const a = sessionAgent.get(e.sessionId); if (a && alive) handle(e, a) })
    })
    const offBoard = window.tyslin.cards.onBoardChanged((p) => {
      if (p.projectId === agency.projectId && (p.path === agency.boardPath || p.path.endsWith(agency.boardPath))) void loadBoard()
    })
    const offMsg = window.tyslin.channels.onMessage((m) => { if (m.agencyId === agency.id) void loadChannel() })
    const poll = window.setInterval(() => void loadStatuses(), 4000)
    return () => { alive = false; offRun(); offBoard(); offMsg(); window.clearInterval(poll) }
  }, [agency.id, agency.projectId, agency.boardPath, memberKey, add])

  const allCards = (board?.columns ?? []).flatMap((c) => c.cards ?? [])
  const doneCards = (board?.columns ?? []).filter((c) => c.title.trim().toLowerCase() === 'done').reduce((n, c) => n + (c.cards?.length ?? 0), 0)
  const agents: LiveAgent[] = members.map((a) => {
    const s = statuses[a.id]
    const now = doing[a.id]
    const working = s?.state === 'working' || !!now
    const card = cardFor(board, a.id)
    const isLead = a.id === lead?.id
    const progress = isLead
      ? { value: allCards.length ? Math.round((doneCards / allCards.length) * 100) : 0, label: allCards.length ? `${doneCards}/${allCards.length} done` : 'No cards' }
      : { value: card?.place ?? 0, label: card?.column ?? '—' }
    return {
      agent: a,
      working,
      doing: now ?? (working ? 'Working' : statusLine(s)),
      typing: now === 'Writing a reply',
      lastTool: lastTool[a.id] ?? '',
      card: card ? { title: card.title, column: card.column, running: card.running } : isLead && allCards.length ? { title: 'The whole board', column: '', running: false } : null,
      progress,
      done: !working && !isLead && !!card && card.column.trim().toLowerCase() === 'done'
    }
  })
  return { events, agents, unread, board, loaded }
}
