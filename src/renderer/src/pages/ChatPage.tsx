import { useEffect, useRef, useState } from 'react'
import type { Agency, Agent, Attachment, ChannelMessage, Message, PendingChange, PermissionChoice, Project, Session } from '@shared/types'
import { ENGINE_NAMES } from '@shared/engines'
import { RunsOnBadge } from '../components/RunsOnBadge'
import { Avatar } from '../components/Avatar'
import { ChangeReview } from '../components/ChangeReview'
import { Icon } from '../components/Icon'
import { Markdown } from '../components/Markdown'
import { BoardPanel, ChannelCard, ChannelSheet, needsYou, useLeadChannel } from '../components/LeadChannel'
import { useBoardStats } from '../boardStats'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

/** A tool call in the live run, shown as one compact line. */
interface Activity {
  id: string
  name: string
  args: string
  done: boolean
  isError: boolean
}

const TOOL_VERB: Record<string, string> = {
  list_files: 'Listed files', read_file: 'Read', write_file: 'Proposed', edit_file: 'Proposed an edit to'
}

/** A permission request from an external agent, waiting for an answer. */
interface Permission {
  id: string
  title: string
  choices: PermissionChoice[]
}

function activityLabel(a: Activity): string {
  // External agents send a ready-made title, like "Read notes.md".
  if (!TOOL_VERB[a.name]) return a.name
  let path = ''
  try { path = JSON.parse(a.args || '{}').path ?? '' } catch { /* args still streaming */ }
  return [TOOL_VERB[a.name], path].filter(Boolean).join(' ')
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function AttachmentChip({ a, onRemove }: { a: Attachment; onRemove?: () => void }): JSX.Element {
  const detail = a.kind === 'folder' ? `${a.files ?? 0} file${a.files === 1 ? '' : 's'}` : formatSize(a.size)
  return (
    <span className="inline-flex h-8 max-w-[280px] items-center gap-1.5 rounded-md border border-border bg-muted pr-1.5 pl-2.5 text-[13px] text-foreground" title={a.note ? `${a.path} (${a.note})` : a.path}>
      <Icon name={a.kind === 'folder' ? 'folder' : 'file'} size={14} />
      <span className="truncate">{a.name}</span>
      <span className="pr-1 font-mono text-[11px] whitespace-nowrap text-muted-foreground">{detail}</span>
      {a.note && <span className="inline-flex text-destructive"><Icon name="warning" size={12} /></span>}
      {onRemove && (
        <button type="button" className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40" aria-label={`Remove ${a.name}`} onClick={onRemove}>
          <Icon name="close" size={12} />
        </button>
      )}
    </span>
  )
}

const clock = (ms: number): string => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
/** "Today", "Yesterday" or a short date, for the conversation list. */
function relDay(ms: number): string {
  const d = new Date(ms), now = new Date()
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000)
  if (days === 0) return clock(ms)
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
/** Card runs and briefs send long generated prompts; show their start and fold the rest. */
const LONG_USER = 420

function UserMessage({ m }: { m: Message }): JSX.Element {
  const [open, setOpen] = useState(false)
  const long = m.content.length > LONG_USER
  return (
    <div className="flex justify-end">
      <div className="flex max-w-[80%] flex-col items-end gap-1">
        <span className="text-xs text-muted-foreground">You · <span className="font-mono">{clock(m.createdAt)}</span></span>
        {m.attachments?.length ? (
          <div className="flex flex-wrap justify-end gap-1.5" aria-label="Attachments">
            {m.attachments.map((a) => <AttachmentChip key={a.id} a={a} />)}
          </div>
        ) : null}
        {m.content && (
          <div className={cn('max-w-full rounded-[14px_14px_4px_14px] bg-primary px-4 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap text-primary-foreground', long && !open && 'text-primary-foreground/75')}>
            {long && !open ? m.content.slice(0, LONG_USER).trimEnd() + '…' : m.content}
          </div>
        )}
        {long && <Button variant="link" size="sm" className="h-7 px-0.5 text-[13px] underline" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Show less' : 'Show the full message'}</Button>}
      </div>
    </div>
  )
}

function changeSummary(list: PendingChange[]): string {
  const n = (s: PendingChange['status'][]): number => list.filter((c) => s.includes(c.status)).length
  const parts = [
    n(['accepted']) && `${n(['accepted'])} accepted`,
    n(['partial']) && `${n(['partial'])} partly accepted`,
    n(['rejected']) && `${n(['rejected'])} rejected`,
    n(['expired']) && `${n(['expired'])} expired`
  ].filter(Boolean)
  return parts.join(', ')
}

interface Props {
  agentId: string
  projectId: string | null
  /** Chat to open; the most recent one when missing. */
  sessionId?: string
  agents: Agent[]
  projects: Project[]
  onSwitch: (agentId: string, projectId: string | null) => void
  onSettings: () => void
  /** Called when the open chat changes, so the sidebar can highlight it. */
  onSessionChange: (sessionId: string) => void
  /** Called when a chat is created or gets a new message, so the sidebar list can refresh. */
  onSessionsChanged: () => void
  /** Opens Drive for the agent's folder (agency chats). */
  onOpenDrive?: () => void
  /** The agency when this is its Lead: the chat becomes the agency's one conversation (Lead messages, board, channel). */
  agency?: Agency | null
  /** A Lead message to scroll to (a clicked desktop notification). */
  focus?: string
  /** Lead messages were read or answered: unread counts change. */
  onCountChange?: () => void
  onOpenKanban?: () => void
  /** Opens the Telegram / Slack bot setup. */
  onChannelSetup?: () => void
  /** The agency's channel settings changed. */
  onAgencyChanged?: () => void
}

export function ChatPage({ agentId, projectId, sessionId, agents, projects, onSwitch, onSettings, onSessionChange, onSessionsChanged, onOpenDrive, agency, focus, onCountChange, onOpenKanban, onChannelSetup, onAgencyChanged }: Props): JSX.Element {
  const agent = agents.find((a) => a.id === agentId)
  const project = projects.find((p) => p.id === projectId) ?? null
  const [sessions, setSessions] = useState<Session[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [attached, setAttached] = useState<Attachment[]>([])
  const [attachMenu, setAttachMenu] = useState(false)
  const [files, setFiles] = useState<string[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [waiting, setWaiting] = useState(false)
  const [changes, setChanges] = useState<PendingChange[]>([])
  const [liveRun, setLiveRun] = useState<string | null>(null)
  const [reviewRun, setReviewRun] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<Permission[]>([])
  const threadRef = useRef<HTMLDivElement>(null)
  const [switcher, setSwitcher] = useState(false)
  /** The open chat's id, for async work that finishes after a switch. */
  const sessionRef = useRef<string | null>(null)
  sessionRef.current = session?.id ?? null
  /** A chat `send` just created: its first message is already on screen and must not be reset. */
  const freshRef = useRef<string | null>(null)
  const creating = useRef(false)

  // An agency Lead's chat is the agency's one conversation: what the Lead sent you, the board and the channel.
  const leadAgency = agency && agency.leadId === agentId ? agency : null
  const channel = useLeadChannel(leadAgency, onCountChange)
  const boardStats = useBoardStats(leadAgency ? [leadAgency] : [])[leadAgency?.id ?? '']
  const [filter, setFilter] = useState<'all' | 'needs' | 'reviews'>('all')
  const [mode, setMode] = useState<'message' | 'brief'>('message')
  const [briefNote, setBriefNote] = useState('')
  const [channelOpen, setChannelOpen] = useState(false)
  const [cardReview, setCardReview] = useState<{ changes: PendingChange[]; sessionId: string } | null>(null)
  const focusDone = useRef<string | null>(null)
  useEffect(() => {
    if (!focus || focusDone.current === focus || !channel.messages.some((m) => m.id === focus)) return
    focusDone.current = focus
    setFilter('all')
    requestAnimationFrame(() => document.getElementById(`cm-${focus}`)?.scrollIntoView({ block: 'center' }))
  }, [focus, channel.messages])

  const listSessions = async (): Promise<Session[]> =>
    (await window.tyslin.sessions.list(agentId)).filter((s) => s.projectId === projectId)

  useEffect(() => {
    let live = true
    void listSessions().then((all) => {
      if (!live) return
      setSessions(all)
      setSession(all.find((s) => s.id === sessionId) ?? all[0] ?? null)
    })
    if (projectId) void window.tyslin.projects.files(projectId).then((f) => { if (live) setFiles(f) })
    else setFiles([])
    return () => { live = false }
  }, [agentId, projectId])

  // A chat picked in the sidebar for the same agent and project (it may be newer than our list).
  useEffect(() => {
    if (!sessionId || sessionId === session?.id) return
    const picked = sessions.find((s) => s.id === sessionId)
    if (picked) { setSession(picked); return }
    let live = true
    void listSessions().then((all) => {
      const found = all.find((s) => s.id === sessionId)
      if (!live || !found) return
      setSessions(all)
      setSession(found)
    })
    return () => { live = false }
  }, [sessionId])

  useEffect(() => {
    if (session) onSessionChange(session.id)
  }, [session])

  const loadChanges = (id: string): Promise<void> => window.tyslin.changes.list(id).then(setChanges)

  useEffect(() => {
    // `send` created this chat and already shows the message and the working state.
    if (session && freshRef.current === session.id) {
      freshRef.current = null
      return
    }
    setError(null)
    setStreaming(null)
    setActivity([])
    setWaiting(false)
    setLiveRun(null)
    setPermissions([])
    if (session) {
      const id = session.id
      // A reply may have started (or failed) before this screen was listening, e.g. Run on the agency page.
      void Promise.all([window.tyslin.sessions.messages(id), window.tyslin.sessions.status(id)]).then(([m, st]) => {
        if (sessionRef.current !== id) return
        setMessages(m)
        if (st.running) setStreaming((s) => s ?? '')
        else if (st.lastError && m[m.length - 1]?.role === 'user') setError(st.lastError)
      })
      void window.tyslin.changes.list(id).then((c) => { if (sessionRef.current === id) setChanges(c) })
    } else {
      setMessages([])
      setChanges([])
    }
  }, [session])

  useEffect(() => {
    return window.tyslin.sessions.onEvent(async (e) => {
      if (!session || e.sessionId !== session.id) return
      switch (e.type) {
        case 'run_started':
          setLiveRun(e.runId)
          setActivity([])
          break
        case 'text_delta':
          setStreaming((s) => (s ?? '') + e.text)
          break
        case 'tool_call_start':
          setActivity((a) => [...a, { id: e.toolCallId, name: e.name, args: '', done: false, isError: false }])
          break
        case 'tool_call_args':
          setActivity((a) => a.map((x) => (x.id === e.toolCallId ? { ...x, args: x.args + e.delta } : x)))
          break
        case 'tool_result':
          setActivity((a) => a.map((x) => (x.id === e.toolCallId ? { ...x, done: true, isError: e.isError } : x)))
          break
        case 'approval_needed':
          if ('permissionId' in e) setPermissions((p) => [...p, { id: e.permissionId, title: e.title, choices: e.choices }])
          else {
            const c = await window.tyslin.changes.list(session.id)
            if (sessionRef.current === session.id) setChanges(c)
          }
          break
        case 'state_update':
          setWaiting(e.status === 'waiting_for_review')
          break
        case 'run_finished':
        case 'run_error':
          setStreaming(null)
          setWaiting(false)
          setPermissions([])
          if (e.type === 'run_error') setError(e.error)
          {
            const id = session.id
            const [m, c, all] = await Promise.all([window.tyslin.sessions.messages(id), window.tyslin.changes.list(id), listSessions()])
            // The user may have opened another chat meanwhile.
            if (sessionRef.current === id) {
              setMessages(m)
              setChanges(c)
              setSessions(all)
            }
          }
          onSessionsChanged()
          break
      }
    })
  }, [session])

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight })
  }, [messages, streaming, activity, changes])

  // One card per run: the live run, plus any earlier run still waiting for review.
  const runsWithChanges = [...new Set(changes.map((c) => c.runId))]
    .filter((r) => r === liveRun || changes.some((c) => c.runId === r && c.status === 'pending'))
  const reviewing = reviewRun ? changes.filter((c) => c.runId === reviewRun) : []

  if (!agent) return <div className="p-8 text-muted-foreground"><p>Agent not found.</p></div>

  const newChat = async (): Promise<void> => {
    const s = await window.tyslin.sessions.create(agent.id, projectId)
    setSessions((list) => [s, ...list])
    setSession(s)
    onSessionsChanged()
  }

  const answer = (p: Permission, choiceId: string | null): void => {
    setPermissions((list) => list.filter((x) => x.id !== p.id))
    void window.tyslin.sessions.answerPermission(p.id, choiceId)
  }

  const attach = async (kind: 'file' | 'folder'): Promise<void> => {
    setAttachMenu(false)
    const picked = await window.tyslin.attachments.pick(kind)
    setAttached((list) => [...list, ...picked.filter((p) => !list.some((x) => x.path === p.path))])
  }

  const send = async (): Promise<void> => {
    if (leadAgency && mode === 'brief') return sendBrief()
    const t = text.trim()
    const sending = attached
    if ((!t && !sending.length) || streaming !== null || creating.current) return
    let s = session
    if (!s) {
      // Enter pressed twice before the chat exists would otherwise make two chats and send twice.
      creating.current = true
      try { s = await window.tyslin.sessions.create(agent.id, projectId) } finally { creating.current = false }
      freshRef.current = s.id
      setSessions((list) => [s!, ...list])
      setSession(s)
      setChanges([])
      setActivity([])
      setPermissions([])
      setLiveRun(null)
      setWaiting(false)
    }
    setText('')
    setAttached([])
    setError(null)
    setMessages((m) => [...m, { id: 'pending', sessionId: s!.id, role: 'user', content: t, createdAt: Date.now(), attachments: sending }])
    setStreaming('')
    try {
      await window.tyslin.sessions.send(s.id, t, sending.map((a) => a.id))
      // The message is saved by now, and the first one renames the chat.
      onSessionsChanged()
    } catch (err) {
      // Nothing was saved (busy, paused, ...): drop the optimistic message and give the text back.
      setMessages((m) => m.filter((x) => x.id !== 'pending'))
      setText((cur) => cur || t)
      setAttached((cur) => (cur.length ? cur : sending))
      setStreaming(null)
      setError(err instanceof Error ? err.message.replace(/^.*Error: /, '') : String(err))
    }
  }

  /** New brief: a card in the board's Inbox, then the Lead's planning run (agencies.brief). */
  const sendBrief = async (): Promise<void> => {
    const t = text.trim()
    if (!leadAgency || !t) return
    setError(null); setBriefNote('')
    try {
      const r = await window.tyslin.agencies.brief(leadAgency.id, t)
      setText('')
      const who = agent ? agent.name.replace(/\s*\(Lead\)$/, '') : 'The Lead'
      setBriefNote(r.planned ? `Added to Inbox on the board. ${who} is planning it.`
        : leadAgency.paused ? `Added to Inbox on the board. ${who} plans it when you resume ${leadAgency.name}.` : `Added to Inbox on the board. ${who} plans it on the next run.`)
    } catch (err) { setError(err instanceof Error ? err.message.replace(/^.*Error: /, '') : String(err)) }
  }
  /** Run the plan: the Lead's planning run now, opened here. */
  const runPlan = async (): Promise<void> => {
    if (!leadAgency) return
    setError(null)
    try {
      const sid = await window.tyslin.agencies.plan(leadAgency.id)
      const all = await listSessions()
      setSessions(all)
      const s = all.find((x) => x.id === sid)
      if (s) setSession(s)
      onSessionsChanged()
    } catch (err) { setError(err instanceof Error ? err.message.replace(/^.*Error: /, '') : String(err)) }
  }

  // Who you can switch to from here: the same agency's team (Lead first), else the same project. Never the whole organization.
  const team = agents.filter((a) => a.kind === agent.kind && (agent.agency ? a.agency === agent.agency : a.projectId === agent.projectId && !a.isMascot))
    .sort((a, b) => Number(!!a.leadId) - Number(!!b.leadId) || a.name.localeCompare(b.name))
  const isLead = !!agent.agency && !agent.leadId
  const runsOn = agent.engine === 'builtin' ? agent.model : ENGINE_NAMES[agent.engine]
  const docs = files.filter((f) => !f.startsWith('memory/') && !f.startsWith('boards/'))

  const needs = channel.messages.filter(needsYou)
  const shownChannel = channel.messages.filter((m) => filter === 'all' || (filter === 'needs' ? needsYou(m) : m.kind === 'review'))
  const thread: { at: number; chat?: Message; lead?: ChannelMessage }[] = [
    ...(filter === 'all' ? messages.map((m) => ({ at: m.createdAt, chat: m })) : []),
    ...shownChannel.map((m) => ({ at: m.createdAt, lead: m }))
  ].sort((a, b) => a.at - b.at)
  const boardLine = boardStats
    ? [boardStats.inbox && `${boardStats.inbox} in Inbox`, boardStats.planned && `${boardStats.planned} planned`, boardStats.inProgress && `${boardStats.inProgress} in progress`, boardStats.review && `${boardStats.review} to review`]
      .filter(Boolean).join(' · ') || 'Board is clear'
    : ''
  const toggleItem = 'h-8 gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-ring/40 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground'

  const avatar = (size: number): JSX.Element => (
    <span className="flex-none"><Avatar shape={agent.shape} tone={agent.tone} head={agent.head} mascot={agent.isMascot} size={size} /></span>
  )
  const agentMeta = (time: React.ReactNode): JSX.Element => (
    <span className="text-[13px]">
      <strong className="font-semibold">{agent.name}</strong>
      <span className="text-muted-foreground">{isLead ? ' · Lead' : ''} · {time}</span>
    </span>
  )

  return (
    <div className="flex h-full min-h-0 bg-background text-foreground">
      <section className="flex min-w-0 flex-1 flex-col" aria-label="Conversation">
        <header className="flex min-h-[64px] flex-none items-center justify-between gap-3 border-b border-border px-6 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            {avatar(36)}
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-[15px] font-semibold tracking-tight">{agent.name}</h2>
                {isLead && <Badge variant="soft">Lead</Badge>}
              </div>
              <span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-[13px] whitespace-nowrap text-muted-foreground">
                <span className="truncate">{leadAgency ? boardLine : agent.description || (agent.kind === 'assistant' ? 'Assistant' : 'Agent')}</span>
                {!leadAgency && (<>
                  <span aria-hidden="true">·</span>
                  <RunsOnBadge agent={agent} size={14} /> <span className="font-mono text-xs">{runsOn}</span>
                </>)}
              </span>
            </div>
          </div>
          <div className="flex flex-none items-center gap-2">
            {leadAgency && needs.length > 0 && (
              <Button variant="ghost" size="sm" className="h-9 px-1" aria-label={`${needs.length} waiting for you: go to the first`}
                onClick={() => { setFilter('all'); requestAnimationFrame(() => document.getElementById(`cm-${needs[0].id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })) }}>
                <Badge variant="lime" className="font-mono">Needs you · {needs.length}</Badge>
              </Button>
            )}
            {leadAgency && <Button variant="outline" size="sm" onClick={() => setChannelOpen(true)}><Icon name="channel" size={14} /> Channel</Button>}
            {team.length > 1 && (
              <DropdownMenu open={switcher} onOpenChange={setSwitcher}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Icon name="agents" size={14} /> Switch agent <Icon name="updown" size={12} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={6} className="flex max-h-[420px] w-[300px] flex-col gap-0.5 rounded-xl p-1.5 shadow-lg"
                  aria-label={project ? `${project.name} team` : 'Team'}>
                  <DropdownMenuLabel className="px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground">{project ? project.name : 'Team'}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={agent.id} onValueChange={(id) => { if (id !== agent.id) onSwitch(id, projectId) }}>
                    {team.map((a) => {
                      const on = a.id === agent.id
                      return (
                        <DropdownMenuRadioItem key={a.id} value={a.id}
                          className={cn('min-h-11 gap-2.5 rounded-md px-2.5 py-1.5 [&>span:first-child]:hidden', on && 'bg-lime-soft focus:bg-lime-soft')}>
                          <span className="flex-none"><Avatar shape={a.shape} tone={a.tone} head={a.head} mascot={a.isMascot} size={26} /></span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <strong className="text-[13.5px] font-semibold">{a.name}</strong>
                            <span className="truncate text-xs text-muted-foreground">{a.description || (a.leadId ? 'Agent' : 'Lead')}</span>
                          </span>
                          {on && <Icon name="check" size={14} />}
                        </DropdownMenuRadioItem>
                      )
                    })}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button variant="outline" size="sm" onClick={newChat}><Icon name="plus" size={12} /> New chat</Button>
          </div>
        </header>

        {leadAgency && (
          <div className="flex flex-none items-center gap-3 border-b border-border px-6 py-2">
            <ToggleGroup type="single" spacing={1.5} aria-label="Show" value={filter} onValueChange={(v) => { if (v) setFilter(v as typeof filter) }}>
              <ToggleGroupItem value="all" className={toggleItem}>All</ToggleGroupItem>
              <ToggleGroupItem value="needs" className={cn(toggleItem, needs.length > 0 && 'border-green text-green')}>Needs you{needs.length ? <span className="font-mono">{needs.length}</span> : null}</ToggleGroupItem>
              <ToggleGroupItem value="reviews" className={toggleItem}>Reviews</ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-8 pt-7 pb-3" ref={threadRef}>
          <div className="mx-auto flex w-full max-w-[760px] flex-col gap-[22px]">
            {messages.length === 0 && channel.messages.length === 0 && streaming === null && (
              <div className="mt-20 flex flex-col items-center gap-3 text-center">
                {avatar(120)}
                <h2 className="text-xl font-semibold tracking-tight">{agent.kind === 'assistant' ? 'Start a chat with' : 'Start working with'} {agent.name}</h2>
                <p className="max-w-[460px] text-[15px] text-muted-foreground">{agent.description}</p>
              </div>
            )}
            {thread.map((it) => {
              if (it.lead) {
                return (
                  <div key={it.lead.id} id={`cm-${it.lead.id}`} className="flex scroll-mt-4 items-start gap-3">
                    {avatar(32)}
                    <div className="max-w-[600px] min-w-0 flex-1">
                      <ChannelCard m={it.lead} lead={agent} board={channel.board} onAnswered={() => { channel.reload(); onCountChange?.() }}
                        onReview={(changes, sid) => setCardReview({ changes, sessionId: sid })} />
                    </div>
                  </div>
                )
              }
              const m = it.chat!
              return m.role === 'user'
                ? <UserMessage key={m.id} m={m} />
                : (
                  <div key={m.id} className="flex items-start gap-3">
                    {avatar(32)}
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      {agentMeta(<span className="font-mono text-xs">{clock(m.createdAt)}</span>)}
                      <Markdown className={MD} text={m.content} />
                    </div>
                  </div>
                )
            })}
            {leadAgency && filter !== 'all' && shownChannel.length === 0 && (
              <p className="text-center text-[13px] text-muted-foreground">{filter === 'needs' ? 'Nothing is waiting for you.' : 'No reviews yet.'}</p>
            )}
            {streaming && (
              <div className="flex items-start gap-3">
                {avatar(32)}
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {agentMeta('now')}
                  <Markdown className={MD} text={streaming} />
                </div>
              </div>
            )}
            {streaming !== null && activity.length > 0 && (
              <ul className="flex flex-col gap-1 pl-11" aria-label="Tool calls">
                {activity.map((a) => (
                  <li key={a.id} className={cn('flex items-center gap-2 text-xs', a.isError ? 'text-destructive' : 'text-muted-foreground')}>
                    <Icon name={a.isError ? 'warning' : a.done ? 'check' : 'file'} size={12} />
                    <span className="font-mono">{activityLabel(a)}</span>
                  </li>
                ))}
              </ul>
            )}
            {runsWithChanges.map((runId) => {
              const list = changes.filter((c) => c.runId === runId)
              const open = list.filter((c) => c.status === 'pending').length
              return (
                <div key={runId} className="flex items-start gap-3">
                  {avatar(32)}
                  <Card className={cn('max-w-[520px] min-w-0 flex-1 gap-2.5 px-4 py-3.5', open && 'border-green')}>
                    {open > 0 && <span className="flex items-center gap-2 text-[13px]"><Badge variant="lime">Review</Badge></span>}
                    <span className="flex flex-col gap-0.5">
                      <strong className="text-sm font-semibold">{list.length} file{list.length === 1 ? '' : 's'} changed</strong>
                      <span className="text-[13px] text-muted-foreground">{open ? `${agent.name} is waiting for your review` : changeSummary(list)}</span>
                    </span>
                    <span className="flex flex-wrap gap-2">
                      <Button variant={open ? 'lime' : 'outline'} size="sm" className={cn(open && 'font-semibold')} onClick={() => setReviewRun(runId)}>
                        {open ? 'Review changes' : 'View'}
                      </Button>
                    </span>
                  </Card>
                </div>
              )
            })}
            {permissions.map((p) => (
              <div key={p.id} className="flex items-start gap-3">
                {avatar(32)}
                <Card className="max-w-[520px] min-w-0 flex-1 gap-2.5 border-green px-4 py-3.5" role="group" aria-label="Permission request">
                  <span className="flex items-start gap-2">
                    <span className="mt-0.5 flex-none text-green"><Icon name="warning" size={16} /></span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <strong className="text-sm font-semibold break-words">{p.title}</strong>
                      <span className="text-[13px] text-muted-foreground">{agent.name} is asking before it goes ahead</span>
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    {p.choices.map((c) => (
                      <Button key={c.id} variant={c.kind.startsWith('allow') ? 'lime' : 'outline'} size="sm" className={cn(c.kind.startsWith('allow') && 'font-semibold')} onClick={() => answer(p, c.id)}>{c.name}</Button>
                    ))}
                    {p.choices.length === 0 && <Button variant="outline" size="sm" onClick={() => answer(p, null)}>Decline</Button>}
                  </span>
                </Card>
              </div>
            ))}
            {streaming !== null && !waiting && (
              <div className="flex items-center gap-2 pl-11 text-[13px] text-muted-foreground" role="status">
                <span className="inline-flex gap-[3px]" aria-hidden="true">
                  {[0, 150, 300].map((d) => <i key={d} className="size-[5px] rounded-full bg-green animate-dot motion-reduce:animate-none motion-reduce:opacity-60" style={{ animationDelay: `${d}ms` }} />)}
                </span>
                {agent.name} is working…
              </div>
            )}
            {error && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-destructive-soft px-3.5 py-2.5 text-sm text-destructive">
                {error}{' '}
                {/API key/i.test(error) && <Button variant="outline" size="sm" onClick={onSettings}>Open Settings</Button>}
              </div>
            )}
          </div>
        </div>

        <form className="mx-auto w-full max-w-[824px] flex-none px-8 pt-3 pb-6" onSubmit={(e) => { e.preventDefault(); void send() }}>
          <Card className="gap-2 px-3 py-2.5 shadow-md transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
            {leadAgency && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ToggleGroup type="single" spacing={1.5} aria-label="Write" value={mode} onValueChange={(v) => { if (v) { setMode(v as typeof mode); setBriefNote('') } }}>
                  <ToggleGroupItem value="message" className={toggleItem}>Message</ToggleGroupItem>
                  <ToggleGroupItem value="brief" className={toggleItem}>New brief</ToggleGroupItem>
                </ToggleGroup>
                {(boardStats?.planned ?? 0) > 0 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => void runPlan()}><Icon name="play" size={12} /> Run the plan</Button>
                )}
              </div>
            )}
            {attached.length > 0 && (
              <div className="flex flex-wrap gap-1.5" aria-label="Attached">
                {attached.map((a) => (
                  <AttachmentChip key={a.id} a={a} onRemove={() => setAttached((list) => list.filter((x) => x.id !== a.id))} />
                ))}
              </div>
            )}
            <Label htmlFor="composer" className="sr-only">Message {agent.name}</Label>
            <Textarea
              id="composer"
              rows={2}
              className="max-h-[200px] min-h-0 resize-none rounded-none border-0 bg-transparent px-1 py-1 text-sm shadow-none focus-visible:ring-0"
              placeholder={leadAgency && mode === 'brief' ? `New brief for ${agent.name}: the work, what done looks like, anything to avoid` : `Message ${agent.name}…`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
            />
            <div className="flex items-center gap-2">
              <DropdownMenu open={attachMenu} onOpenChange={setAttachMenu}>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="size-8 flex-none" aria-label="Attach files or a folder" title="Attach">
                    <Icon name="plus" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" sideOffset={8} className="min-w-[168px] rounded-xl p-1.5 shadow-lg" aria-label="Attach">
                  {(['file', 'folder'] as const).map((k) => (
                    <DropdownMenuItem key={k} onSelect={() => void attach(k)} className="min-h-10 gap-2.5 rounded-md px-3">
                      <Icon name={k} /> {k === 'file' ? 'File' : 'Folder'}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Badge variant="outline" className="min-w-0 gap-1.5 bg-card">
                <RunsOnBadge agent={agent} size={12} /><span className="truncate font-mono">{runsOn}</span>
              </Badge>
              <span className="flex-1" />
              <span className="hidden text-xs text-muted-foreground sm:inline">Enter to send</span>
              {streaming !== null && session && mode === 'message' ? (
                <Button type="button" variant="outline" size="icon" aria-label={`Stop ${agent.name}`} title="Stop" onClick={() => void window.tyslin.sessions.stop(session.id)}>
                  <Icon name="stop" />
                </Button>
              ) : (
                <Button type="submit" size="icon" aria-label={mode === 'brief' && leadAgency ? 'Send brief' : 'Send'} disabled={!text.trim() && (!attached.length || (mode === 'brief' && !!leadAgency))}>
                  <Icon name="send" />
                </Button>
              )}
            </div>
          </Card>
          {briefNote && <p role="status" className="px-1 pt-2 text-[13px] text-green">{briefNote}</p>}
        </form>
      </section>

      <aside className="flex w-[300px] flex-none flex-col gap-[22px] overflow-y-auto border-l border-border p-5" aria-label="Details">
        <section className="flex flex-col gap-3" aria-labelledby="ctx-about">
          <div className="flex items-center gap-3">
            {avatar(44)}
            <span className="flex min-w-0 flex-col gap-0.5">
              <h3 id="ctx-about" className="truncate text-[15px] font-semibold"><span className="sr-only">About </span>{agent.name}</h3>
              <span className="text-[13px] text-muted-foreground">{agent.description || (isLead ? 'Lead' : 'Agent')}</span>
            </span>
          </div>
          <dl className="flex flex-col gap-2 text-[13px]">
            <div className="grid grid-cols-[72px_1fr] items-baseline gap-2">
              <dt className="text-xs text-muted-foreground">Runs on</dt>
              <dd className="flex min-w-0 items-center gap-1.5 [overflow-wrap:anywhere]"><RunsOnBadge agent={agent} size={14} /> <span className="font-mono text-xs">{runsOn}</span></dd>
            </div>
            {agent.kind === 'agent' && (
              <div className="grid grid-cols-[72px_1fr] items-baseline gap-2">
                <dt className="text-xs text-muted-foreground">Works in</dt>
                <dd className="min-w-0 [overflow-wrap:anywhere]" title={project?.folder ?? undefined}>{project ? project.name : 'No project yet'}</dd>
              </div>
            )}
          </dl>
          {agent.isMascot && agent.kind === 'agent' && (
            <Select value={projectId ?? NO_PROJECT} onValueChange={(v) => onSwitch(agent.id, v === NO_PROJECT ? null : v)}>
              <SelectTrigger aria-label="Project" className="w-full bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT}>No project</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </section>

        {leadAgency && <BoardPanel board={channel.board} onOpenKanban={onOpenKanban} />}

        <section className="flex flex-col gap-2" aria-labelledby="ctx-skills">
          <PanelHead id="ctx-skills" title="Skills" count={agent.skills.length} />
          <div className="flex flex-wrap gap-1.5">
            {agent.skills.length
              ? agent.skills.map((sk) => <Badge key={sk} variant="outline" className="bg-card font-mono font-normal">{sk}</Badge>)
              : <span className="text-[13px] text-muted-foreground">No skills attached.</span>}
          </div>
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="ctx-chats">
          <PanelHead id="ctx-chats" title="Conversations">
            <Button variant="ghost" size="sm" className="h-7 px-2 has-[>svg]:px-2" onClick={newChat} aria-label="New chat"><Icon name="plus" size={12} /> New</Button>
          </PanelHead>
          {sessions.length === 0 && <span className="text-[13px] text-muted-foreground">No conversations yet.</span>}
          <ul className="flex flex-col gap-0.5">
            {sessions.map((s) => {
              const active = session?.id === s.id
              return (
                <li key={s.id}>
                  <button type="button" aria-current={active ? 'true' : undefined} onClick={() => setSession(s)}
                    className={cn('flex w-full flex-col items-start gap-0.5 rounded-md border px-2.5 py-2 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                      active ? 'border-border bg-card font-medium shadow-xs' : 'border-transparent hover:bg-accent')}>
                    <span className="w-full truncate">{s.title}</span>
                    <span className="font-mono text-xs font-normal text-muted-foreground">{relDay(s.updatedAt)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        {agent.kind === 'agent' && project?.folder && (
          <section className="flex flex-col gap-2" aria-labelledby="ctx-files">
            <PanelHead id="ctx-files" title="Files" count={docs.length} />
            {docs.length === 0 ? <span className="text-[13px] text-muted-foreground">Nothing made yet. Work the agents produce shows up here.</span> : (
              <ul className="flex flex-col gap-0.5">
                {docs.slice(0, 12).map((f) => (
                  <li key={f} title={f} className="flex min-w-0 items-center gap-2 py-1 text-[13px]">
                    <span className="flex-none text-muted-foreground"><Icon name="file" size={13} /></span>
                    <span className="truncate font-mono">{f}</span>
                  </li>
                ))}
              </ul>
            )}
            {(docs.length > 12 || onOpenDrive) && (
              <Button variant="link" size="sm" className="h-8 self-start px-0 has-[>svg]:px-0" onClick={onOpenDrive} disabled={!onOpenDrive}>
                <Icon name="drive" size={13} /> {docs.length > 12 ? `All ${docs.length} files in Drive` : 'Open in Drive'}
              </Button>
            )}
          </section>
        )}
      </aside>
      {reviewing.length > 0 && (
        <ChangeReview changes={reviewing} onClose={() => setReviewRun(null)} onResolved={() => session && void loadChanges(session.id)} />
      )}
      {cardReview && (
        <ChangeReview changes={cardReview.changes} onClose={() => setCardReview(null)}
          onResolved={() => { void window.tyslin.changes.list(cardReview.sessionId).then((c) => setCardReview((r) => r && { ...r, changes: c })); channel.reload() }} />
      )}
      {leadAgency && (
        <ChannelSheet open={channelOpen} onOpenChange={setChannelOpen} agency={leadAgency} lead={agent} onChanged={() => onAgencyChanged?.()}
          onSetup={onChannelSetup ? () => { setChannelOpen(false); onChannelSetup() } : undefined} />
      )}
    </div>
  )
}

/** A context-panel heading with an optional count and action. */
function PanelHead({ id, title, count, children }: { id: string; title: string; count?: number; children?: React.ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-7 items-center justify-between gap-2">
      <h3 id={id} className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {title}
        {count !== undefined && <span className="rounded-full bg-muted px-2 py-px font-mono text-[11px]">{count}</span>}
      </h3>
      {children}
    </div>
  )
}

/** Radix Select can't use an empty value; this stands for "No project". */
const NO_PROJECT = '__none__'

/** Markdown replies: the `md` styles plus list markers (Preflight removes them). */
const MD = 'max-w-full text-[15px] leading-[1.65] text-foreground [&_ol]:list-decimal [&_ul]:list-disc'
