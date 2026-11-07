import { useEffect, useRef, useState } from 'react'
import type { Agent, Attachment, Message, PendingChange, PermissionChoice, Project, Session } from '@shared/types'
import { ENGINE_NAMES } from '@shared/engines'
import { RunsOnBadge } from '../components/RunsOnBadge'
import { Avatar } from '../components/Avatar'
import { ChangeReview } from '../components/ChangeReview'
import { Icon } from '../components/Icon'
import { Markdown } from '../components/Markdown'

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
    <span className="attach-chip" title={a.note ? `${a.path} (${a.note})` : a.path}>
      <Icon name={a.kind === 'folder' ? 'folder' : 'file'} size={14} />
      <span className="attach-name">{a.name}</span>
      <span className="attach-meta">{detail}</span>
      {a.note && <span className="attach-note"><Icon name="warning" size={12} /></span>}
      {onRemove && (
        <button type="button" className="attach-remove" aria-label={`Remove ${a.name}`} onClick={onRemove}>
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
    <div className="msg-row msg-row-user">
      <div className="msg-user-wrap">
        <span className="msg-meta">You · {clock(m.createdAt)}</span>
        {m.attachments?.length ? (
          <div className="attach-list" aria-label="Attachments">
            {m.attachments.map((a) => <AttachmentChip key={a.id} a={a} />)}
          </div>
        ) : null}
        {m.content && (
          <div className={'msg-user' + (long && !open ? ' folded' : '')}>
            {long && !open ? m.content.slice(0, LONG_USER).trimEnd() + '…' : m.content}
          </div>
        )}
        {long && <button type="button" className="msg-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Show less' : 'Show the full message'}</button>}
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
}

export function ChatPage({ agentId, projectId, sessionId, agents, projects, onSwitch, onSettings, onSessionChange, onSessionsChanged, onOpenDrive }: Props): JSX.Element {
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
  const attachRef = useRef<HTMLDivElement>(null)
  const [files, setFiles] = useState<string[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [waiting, setWaiting] = useState(false)
  const [changes, setChanges] = useState<PendingChange[]>([])
  const [liveRun, setLiveRun] = useState<string | null>(null)
  const [reviewRun, setReviewRun] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<Permission[]>([])
  const threadRef = useRef<HTMLDivElement>(null)
  const [switcher, setSwitcher] = useState(false)
  const switchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void (async () => {
      const all = (await window.tyslin.sessions.list(agentId)).filter((s) => s.projectId === projectId)
      setSessions(all)
      setSession(all.find((s) => s.id === sessionId) ?? all[0] ?? null)
    })()
    if (projectId) void window.tyslin.projects.files(projectId).then(setFiles)
    else setFiles([])
  }, [agentId, projectId])

  // A chat picked in the sidebar for the same agent and project.
  useEffect(() => {
    if (!sessionId || sessionId === session?.id) return
    const picked = sessions.find((s) => s.id === sessionId)
    if (picked) setSession(picked)
  }, [sessionId])

  useEffect(() => {
    if (session) onSessionChange(session.id)
  }, [session])

  const loadChanges = (id: string): Promise<void> => window.tyslin.changes.list(id).then(setChanges)

  useEffect(() => {
    setError(null)
    setStreaming(null)
    setActivity([])
    setWaiting(false)
    setLiveRun(null)
    setPermissions([])
    if (session) {
      void window.tyslin.sessions.messages(session.id).then(setMessages)
      void loadChanges(session.id)
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
          else await loadChanges(session.id)
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
          setMessages(await window.tyslin.sessions.messages(session.id))
          await loadChanges(session.id)
          onSessionsChanged()
          break
      }
    })
  }, [session])

  // Close the agent switcher on an outside click or Escape.
  useEffect(() => {
    if (!switcher) return
    const onDown = (e: MouseEvent): void => { if (!switchRef.current?.contains(e.target as Node)) setSwitcher(false) }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setSwitcher(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [switcher])

  // Close the attach menu on an outside click or Escape.
  useEffect(() => {
    if (!attachMenu) return
    const onDown = (e: MouseEvent): void => {
      if (!attachRef.current?.contains(e.target as Node)) setAttachMenu(false)
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setAttachMenu(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [attachMenu])

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight })
  }, [messages, streaming, activity, changes])

  // One card per run: the live run, plus any earlier run still waiting for review.
  const runsWithChanges = [...new Set(changes.map((c) => c.runId))]
    .filter((r) => r === liveRun || changes.some((c) => c.runId === r && c.status === 'pending'))
  const reviewing = reviewRun ? changes.filter((c) => c.runId === reviewRun) : []

  if (!agent) return <div className="page"><p className="lead">Agent not found.</p></div>

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
    const t = text.trim()
    const sending = attached
    if ((!t && !sending.length) || streaming !== null) return
    let s = session
    if (!s) {
      s = await window.tyslin.sessions.create(agent.id, projectId)
      setSessions((list) => [s!, ...list])
      setSession(s)
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
      setStreaming(null)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Who you can switch to from here: the same agency's team (Lead first), else the same project. Never the whole organization.
  const team = agents.filter((a) => a.kind === agent.kind && (agent.agency ? a.agency === agent.agency : a.projectId === agent.projectId && !a.isMascot))
    .sort((a, b) => Number(!!a.leadId) - Number(!!b.leadId) || a.name.localeCompare(b.name))
  const isLead = !!agent.agency && !agent.leadId
  const runsOn = agent.engine === 'builtin' ? agent.model : ENGINE_NAMES[agent.engine]
  const docs = files.filter((f) => !f.startsWith('memory/') && !f.startsWith('boards/'))

  return (
    <div className="chat">
      <section className="chat-col" aria-label="Conversation">
        <header className="chat-head">
          <div className="who">
            <Avatar shape={agent.shape} tone={agent.tone} head={agent.head} mascot={agent.isMascot} size={40} />
            <div className="who-text">
              <div className="who-name">
                <h2>{agent.name}</h2>
                {isLead && <span className="role-tag">Lead</span>}
              </div>
              <span className="sub">
                {agent.description || (agent.kind === 'assistant' ? 'Assistant' : 'Agent')}
                <span className="sub-dot" aria-hidden="true">·</span>
                <RunsOnBadge agent={agent} size={14} /> <span className="mono">{runsOn}</span>
              </span>
            </div>
          </div>
          <div className="chat-actions">
            {team.length > 1 && (
              <div className="switcher" ref={switchRef}>
                <button type="button" className="btn btn-sm switcher-btn" aria-haspopup="menu" aria-expanded={switcher} onClick={() => setSwitcher((o) => !o)}>
                  <Icon name="agents" size={14} /> Switch agent <Icon name="updown" size={12} />
                </button>
                {switcher && (
                  <div className="switcher-menu" role="menu" aria-label={project ? `${project.name} team` : 'Team'}>
                    <span className="switcher-cap">{project ? project.name : 'Team'}</span>
                    {team.map((a) => (
                      <button key={a.id} type="button" role="menuitemradio" aria-checked={a.id === agent.id} className={a.id === agent.id ? 'on' : ''}
                        onClick={() => { setSwitcher(false); if (a.id !== agent.id) onSwitch(a.id, projectId) }}>
                        <Avatar shape={a.shape} tone={a.tone} head={a.head} mascot={a.isMascot} size={26} />
                        <span className="switcher-text"><strong>{a.name}</strong><span>{a.description || (a.leadId ? 'Agent' : 'Lead')}</span></span>
                        {a.id === agent.id && <Icon name="check" size={14} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button type="button" className="btn btn-sm btn-primary" onClick={newChat}><Icon name="plus" size={12} /> New chat</button>
          </div>
        </header>

        <div className="thread" ref={threadRef}>
          <div className="thread-inner">
            {messages.length === 0 && streaming === null && (
              <div className="empty" style={{ marginTop: 80 }}>
                <Avatar shape={agent.shape} tone={agent.tone} head={agent.head} mascot={agent.isMascot} size={120} />
                <h2>{agent.kind === 'assistant' ? 'Start a chat with' : 'Start working with'} {agent.name}</h2>
                <p className="lead">{agent.description}</p>
              </div>
            )}
            {messages.map((m) =>
              m.role === 'user'
                ? <UserMessage key={m.id} m={m} />
                : (
                  <div key={m.id} className="msg-row msg-row-agent">
                    <Avatar shape={agent.shape} tone={agent.tone} head={agent.head} mascot={agent.isMascot} size={28} />
                    <div className="msg-agent-col">
                      <span className="msg-meta"><strong>{agent.name}</strong> · {clock(m.createdAt)}</span>
                      <Markdown className="msg-agent" text={m.content} />
                    </div>
                  </div>
                )
            )}
            {streaming && (
              <div className="msg-row msg-row-agent">
                <Avatar shape={agent.shape} tone={agent.tone} head={agent.head} mascot={agent.isMascot} size={28} />
                <div className="msg-agent-col">
                  <span className="msg-meta"><strong>{agent.name}</strong> · now</span>
                  <Markdown className="msg-agent" text={streaming} />
                </div>
              </div>
            )}
            {streaming !== null && activity.length > 0 && (
              <ul className="activity" aria-label="Tool calls">
                {activity.map((a) => (
                  <li key={a.id} className={a.isError ? 'err' : ''}>
                    <Icon name={a.isError ? 'warning' : a.done ? 'check' : 'file'} size={12} />
                    <span className="mono">{activityLabel(a)}</span>
                  </li>
                ))}
              </ul>
            )}
            {runsWithChanges.map((runId) => {
              const list = changes.filter((c) => c.runId === runId)
              const open = list.filter((c) => c.status === 'pending').length
              return (
                <div key={runId} className={'change-card' + (open ? ' open' : '')}>
                  <Icon name="file" />
                  <div className="change-card-text">
                    <strong>{list.length} file{list.length === 1 ? '' : 's'} changed</strong>
                    <span>{open ? `${agent.name} is waiting for your review` : changeSummary(list)}</span>
                  </div>
                  <button type="button" className={'btn btn-sm' + (open ? ' btn-primary' : '')} onClick={() => setReviewRun(runId)}>
                    {open ? 'Review' : 'View'}
                  </button>
                </div>
              )
            })}
            {permissions.map((p) => (
              <div key={p.id} className="change-card open" role="group" aria-label="Permission request">
                <Icon name="warning" />
                <div className="change-card-text">
                  <strong>{p.title}</strong>
                  <span>{agent.name} is asking before it goes ahead</span>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {p.choices.map((c) => (
                    <button key={c.id} type="button" className={'btn btn-sm' + (c.kind.startsWith('allow') ? ' btn-primary' : '')} onClick={() => answer(p, c.id)}>{c.name}</button>
                  ))}
                  {p.choices.length === 0 && <button type="button" className="btn btn-sm" onClick={() => answer(p, null)}>Decline</button>}
                </div>
              </div>
            ))}
            {streaming !== null && !waiting && <div className="typing" role="status"><span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>{agent.name} is working…</div>}
            {error && (
              <div className="msg-error">
                {error}{' '}
                {/API key/i.test(error) && <button type="button" className="btn btn-sm" onClick={onSettings}>Open Settings</button>}
              </div>
            )}
          </div>
        </div>

        <form className="composer" onSubmit={(e) => { e.preventDefault(); void send() }}>
          {attached.length > 0 && (
            <div className="attach-list composer-attachments" aria-label="Attached">
              {attached.map((a) => (
                <AttachmentChip key={a.id} a={a} onRemove={() => setAttached((list) => list.filter((x) => x.id !== a.id))} />
              ))}
            </div>
          )}
          <div className="attach" ref={attachRef}>
            <button type="button" className="btn icon-btn attach-btn" aria-label="Attach files or a folder" title="Attach"
              aria-haspopup="menu" aria-expanded={attachMenu} onClick={() => setAttachMenu((o) => !o)}>
              <Icon name="plus" />
            </button>
            {attachMenu && (
              <div className="attach-menu" role="menu" aria-label="Attach">
                <button type="button" role="menuitem" autoFocus onClick={() => void attach('file')}><Icon name="file" /> File</button>
                <button type="button" role="menuitem" onClick={() => void attach('folder')}><Icon name="folder" /> Folder</button>
              </div>
            )}
          </div>
          <label htmlFor="composer" style={{ position: 'absolute', left: -9999 }}>Message {agent.name}</label>
          <textarea
            id="composer"
            rows={1}
            placeholder={`Message ${agent.name}…`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
          />
          {streaming !== null && session ? (
            <button type="button" className="btn icon-btn" aria-label={`Stop ${agent.name}`} title="Stop" onClick={() => void window.tyslin.sessions.stop(session.id)}>
              <Icon name="stop" />
            </button>
          ) : (
            <button type="submit" className="btn btn-primary icon-btn" aria-label="Send" disabled={!text.trim() && !attached.length}>
              <Icon name="send" />
            </button>
          )}
        </form>
      </section>

      <aside className="context" aria-label="Details">
        <section className="ctx-block" aria-labelledby="ctx-chats">
          <div className="ctx-head">
            <h3 id="ctx-chats">Conversations</h3>
            <button type="button" className="btn btn-ghost btn-sm" onClick={newChat} aria-label="New chat"><Icon name="plus" size={12} /> New</button>
          </div>
          {sessions.length === 0 && <span className="hint">No conversations yet.</span>}
          <ul className="ctx-sessions">
            {sessions.map((s) => (
              <li key={s.id}>
                <button type="button" className={session?.id === s.id ? 'active' : ''} aria-current={session?.id === s.id ? 'true' : undefined} onClick={() => setSession(s)}>
                  <span className="ctx-session-title">{s.title}</span>
                  <span className="ctx-session-time mono">{relDay(s.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="ctx-block" aria-labelledby="ctx-about">
          <div className="ctx-head"><h3 id="ctx-about">About {agent.name}</h3></div>
          <dl className="ctx-facts">
            <div><dt>Role</dt><dd>{agent.description || (isLead ? 'Lead' : 'Agent')}</dd></div>
            <div><dt>Runs on</dt><dd><RunsOnBadge agent={agent} size={14} /> <span className="mono">{runsOn}</span></dd></div>
            {agent.kind === 'agent' && <div><dt>Works in</dt><dd title={project?.folder ?? undefined}>{project ? project.name : 'No project yet'}</dd></div>}
          </dl>
          {agent.isMascot && agent.kind === 'agent' && (
            <select className="select" aria-label="Project" value={projectId ?? ''} onChange={(e) => onSwitch(agent.id, e.target.value || null)}>
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </section>

        <section className="ctx-block" aria-labelledby="ctx-skills">
          <div className="ctx-head"><h3 id="ctx-skills">Skills</h3><span className="ctx-count mono">{agent.skills.length}</span></div>
          <div className="ctx-tags">
            {agent.skills.length ? agent.skills.map((sk) => <span key={sk} className="ctx-tag mono">{sk}</span>) : <span className="hint">No skills attached.</span>}
          </div>
        </section>

        {agent.kind === 'agent' && project?.folder && (
          <section className="ctx-block" aria-labelledby="ctx-files">
            <div className="ctx-head">
              <h3 id="ctx-files">Files</h3>
              <span className="ctx-count mono">{docs.length}</span>
            </div>
            {docs.length === 0 ? <span className="hint">Nothing made yet. Work the agents produce shows up here.</span> : (
              <ul className="ctx-files">
                {docs.slice(0, 12).map((f) => <li key={f} title={f}><Icon name="file" size={13} /><span>{f}</span></li>)}
              </ul>
            )}
            {(docs.length > 12 || onOpenDrive) && (
              <button type="button" className="btn btn-ghost btn-sm ctx-more" onClick={onOpenDrive} disabled={!onOpenDrive}>
                <Icon name="drive" size={13} /> {docs.length > 12 ? `All ${docs.length} files in Drive` : 'Open in Drive'}
              </button>
            )}
          </section>
        )}
      </aside>
      {reviewing.length > 0 && (
        <ChangeReview changes={reviewing} onClose={() => setReviewRun(null)} onResolved={() => session && void loadChanges(session.id)} />
      )}
    </div>
  )
}
