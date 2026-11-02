import { useEffect, useRef, useState } from 'react'
import type { Agent, Message, Project, Session } from '@shared/types'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'

interface Props {
  agentId: string
  projectId: string | null
  agents: Agent[]
  projects: Project[]
  onSwitch: (agentId: string, projectId: string | null) => void
  onSettings: () => void
}

export function ChatPage({ agentId, projectId, agents, projects, onSwitch, onSettings }: Props): JSX.Element {
  const agent = agents.find((a) => a.id === agentId)
  const project = projects.find((p) => p.id === projectId) ?? null
  const [sessions, setSessions] = useState<Session[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void (async () => {
      const all = (await window.tyslin.sessions.list(agentId)).filter((s) => s.projectId === projectId)
      setSessions(all)
      setSession(all[0] ?? null)
    })()
    if (projectId) void window.tyslin.projects.files(projectId).then(setFiles)
    else setFiles([])
  }, [agentId, projectId])

  useEffect(() => {
    setError(null)
    setStreaming(null)
    if (session) void window.tyslin.sessions.messages(session.id).then(setMessages)
    else setMessages([])
  }, [session])

  useEffect(() => {
    return window.tyslin.sessions.onStream(async (e) => {
      if (!session || e.sessionId !== session.id) return
      if (e.type === 'delta') setStreaming((s) => (s ?? '') + (e.text ?? ''))
      if (e.type === 'done' || e.type === 'error') {
        setStreaming(null)
        if (e.error) setError(e.error)
        setMessages(await window.tyslin.sessions.messages(session.id))
      }
    })
  }, [session])

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight })
  }, [messages, streaming])

  if (!agent) return <div className="page"><p className="lead">Agent not found.</p></div>

  const newChat = async (): Promise<void> => {
    const s = await window.tyslin.sessions.create(agent.id, projectId)
    setSessions((list) => [s, ...list])
    setSession(s)
  }

  const send = async (): Promise<void> => {
    const t = text.trim()
    if (!t || streaming !== null) return
    let s = session
    if (!s) {
      s = await window.tyslin.sessions.create(agent.id, projectId)
      setSessions((list) => [s!, ...list])
      setSession(s)
    }
    setText('')
    setError(null)
    setMessages((m) => [...m, { id: 'pending', sessionId: s!.id, role: 'user', content: t, createdAt: Date.now() }])
    setStreaming('')
    try {
      await window.tyslin.sessions.send(s.id, t)
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
              <span className="sub">{project ? project.name : 'No project'} · <span className="mono">{agent.model}</span></span>
            </div>
          </div>
          <div className="row">
            <label htmlFor="agent-switch" className="section-label" style={{ padding: 0 }}>Agent</label>
            <select id="agent-switch" className="select" style={{ width: 170, height: 36 }} value={agent.id} onChange={(e) => onSwitch(e.target.value, projectId)}>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button type="button" className="btn btn-sm" onClick={newChat}><Icon name="plus" size={12} /> New chat</button>
          </div>
        </header>

        <div className="thread" ref={threadRef}>
          <div className="thread-inner">
            {messages.length === 0 && streaming === null && (
              <div className="empty" style={{ marginTop: 80 }}>
                <Avatar shape={agent.shape} tone={agent.tone} mascot={agent.isMascot} size={120} />
                <h2>Start working with {agent.name}</h2>
                <p className="lead">{agent.description}</p>
              </div>
            )}
            {messages.map((m) =>
              m.role === 'user'
                ? <div key={m.id} className="msg-user">{m.content}</div>
                : <div key={m.id} className="msg-agent">{m.content}</div>
            )}
            {streaming !== null && (streaming ? <div className="msg-agent">{streaming}</div> : <div className="typing">{agent.name} is working…</div>)}
            {error && (
              <div className="msg-error">
                {error}{' '}
                {/API key/i.test(error) && <button type="button" className="btn btn-sm" onClick={onSettings}>Open Settings</button>}
              </div>
            )}
          </div>
        </div>

        <form className="composer" onSubmit={(e) => { e.preventDefault(); void send() }}>
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
          <button type="submit" className="btn btn-primary icon-btn" aria-label="Send" disabled={!text.trim() || streaming !== null}>
            <Icon name="send" />
          </button>
        </form>
      </section>

      <aside className="context" aria-label="Context">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
        </div>
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
    </div>
  )
}
