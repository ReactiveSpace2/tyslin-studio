import { useEffect, useRef, useState } from 'react'
import type { Agent, Attachment, Message, PendingChange, PermissionChoice, Project, Session } from '@shared/types'
import { ENGINE_NAMES } from '@shared/engines'
import { RunsOnBadge } from '../components/RunsOnBadge'
import { Avatar } from '../components/Avatar'
import { ChangeReview } from '../components/ChangeReview'
import { Icon } from '../components/Icon'

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
}

export function ChatPage({ agentId, projectId, sessionId, agents, projects, onSwitch, onSettings, onSessionChange, onSessionsChanged }: Props): JSX.Element {
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

  return (
    <div className="chat">
      <section className="chat-col" aria-label="Conversation">
        <header className="chat-head">
          <div className="who">
            <Avatar shape={agent.shape} tone={agent.tone} mascot={agent.isMascot} size={44} />
            <div>
              <h2>{agent.name}</h2>
              <span className="sub">{agent.kind === 'assistant' ? 'Assistant' : project ? project.name : 'No project'} · <RunsOnBadge agent={agent} size={16} /> <span className="mono">{agent.engine === 'builtin' ? agent.model : `Runs on ${ENGINE_NAMES[agent.engine]}`}</span></span>
            </div>
          </div>
          <div className="row">
            <label htmlFor="agent-switch" className="section-label" style={{ padding: 0 }}>{agent.kind === 'assistant' ? 'Assistant' : 'Agent'}</label>
            <select id="agent-switch" className="select" style={{ width: 170, height: 36 }} value={agent.id} onChange={(e) => onSwitch(e.target.value, projectId)}>
              {agents.filter((a) => a.kind === agent.kind).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button type="button" className="btn btn-sm" onClick={newChat}><Icon name="plus" size={12} /> New chat</button>
          </div>
        </header>

        <div className="thread" ref={threadRef}>
          <div className="thread-inner">
            {messages.length === 0 && streaming === null && (
              <div className="empty" style={{ marginTop: 80 }}>
                <Avatar shape={agent.shape} tone={agent.tone} mascot={agent.isMascot} size={120} />
                <h2>{agent.kind === 'assistant' ? 'Start a chat with' : 'Start working with'} {agent.name}</h2>
                <p className="lead">{agent.description}</p>
              </div>
            )}
            {messages.map((m) =>
              m.role === 'user'
                ? (
                  <div key={m.id} className="msg-user-wrap">
                    {m.attachments?.length ? (
                      <div className="attach-list" aria-label="Attachments">
                        {m.attachments.map((a) => <AttachmentChip key={a.id} a={a} />)}
                      </div>
                    ) : null}
                    {m.content && <div className="msg-user">{m.content}</div>}
                  </div>
                )
                : <div key={m.id} className="msg-agent">{m.content}</div>
            )}
            {streaming && <div className="msg-agent">{streaming}</div>}
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
            {streaming !== null && !waiting && <div className="typing">{agent.name} is working…</div>}
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
            placeholder={`Message ${agent.name}`}
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

      <aside className="context" aria-label="Context">
        {agent.kind === 'agent' && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="section-label" style={{ padding: 0 }}>Project</span>
          <select className="select" aria-label="Project" value={projectId ?? ''} onChange={(e) => onSwitch(agent.id, e.target.value || null)}>
            <option value="">No project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {project?.folder && <span className="path">{project.folder}</span>}
          {project?.folder && (
            <ul>
              {files.slice(0, 40).map((f) => <li key={f} title={f}>{f}</li>)}
              {files.length === 0 && <li className="hint">Folder is empty</li>}
              {files.length > 40 && <li className="hint">+ {files.length - 40} more</li>}
            </ul>
          )}
        </div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="section-label" style={{ padding: 0 }}>Skills</span>
          <div className="row" style={{ gap: 6 }}>
            {agent.skills.length ? agent.skills.map((s) => <span key={s} className="chip on" style={{ cursor: 'default' }}>{s}</span>) : <span className="hint">No skills attached</span>}
          </div>
        </div>
        <div className="sessions" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="section-label" style={{ padding: 0 }}>History</span>
          {sessions.length === 0 && <span className="hint">No chats yet</span>}
          {sessions.map((s) => (
            <button key={s.id} type="button" className={session?.id === s.id ? 'active' : ''} onClick={() => setSession(s)}>{s.title}</button>
          ))}
        </div>
      </aside>
      {reviewing.length > 0 && (
        <ChangeReview changes={reviewing} onClose={() => setReviewRun(null)} onResolved={() => session && void loadChanges(session.id)} />
      )}
    </div>
  )
}
