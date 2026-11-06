import { useEffect, useMemo, useState } from 'react'
import type { Agency, Agent, ChannelMessage } from '@shared/types'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'

type Filter = 'all' | 'needs' | 'review' | 'brief' | 'digest'
const KIND: Record<ChannelMessage['kind'], string> = { brief: 'brief', question: 'question', review: 'review', digest: 'digest' }
const FILTERS: [Filter, string][] = [['all', 'All'], ['needs', 'Needs you'], ['review', 'Reviews'], ['brief', 'Briefs'], ['digest', 'Digests']]

/** Waiting on the boss: a question or review not answered yet. */
export const needsYou = (m: ChannelMessage): boolean => (m.kind === 'question' || m.kind === 'review') && !m.reply

const when = (t: number): string => {
  const d = new Date(t)
  const today = new Date()
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/** The Inbox: every message the organization's agency Leads sent you, in one place, with answers going back to the Lead. */
export function InboxPage({ agencies, agents, focusId, onOpenBoard, onOpenChannel, onCountChange }: {
  agencies: Agency[]
  agents: Agent[]
  focusId?: string
  onOpenBoard: (projectId: string) => void
  onOpenChannel: (projectId: string) => void
  /** Read or answered: the toolbar count changes. */
  onCountChange: () => void
}): JSX.Element {
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | null>(focusId ?? null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const load = (): void => { void window.tyslin.channels.list().then(setMessages) }
  useEffect(() => { load(); return window.tyslin.channels.onMessage(() => load()) }, [])
  useEffect(() => { if (focusId) setSelected(focusId) }, [focusId])

  const agencyById = useMemo(() => new Map(agencies.map((a) => [a.id, a])), [agencies])
  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents])
  const counts = useMemo(() => ({
    all: messages.length,
    needs: messages.filter(needsYou).length,
    review: messages.filter((m) => m.kind === 'review').length,
    brief: messages.filter((m) => m.kind === 'brief').length,
    digest: messages.filter((m) => m.kind === 'digest').length
  }), [messages])
  const shown = messages.filter((m) => filter === 'all' ? true : filter === 'needs' ? needsYou(m) : m.kind === filter)
  const current = messages.find((m) => m.id === selected) ?? shown[0] ?? null

  // Opening a message marks it read.
  useEffect(() => {
    if (current && !current.readAt) void window.tyslin.channels.markRead([current.id]).then(() => { load(); onCountChange() })
    setDraft('')
    setError('')
  }, [current?.id])

  const send = async (text: string): Promise<void> => {
    if (!current || !text.trim()) return
    setSending(true)
    setError('')
    try { await window.tyslin.channels.reply(current.id, text); setDraft(''); load() } catch (err) { setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)) } finally { setSending(false) }
  }

  const agency = current ? agencyById.get(current.agencyId) : undefined
  const lead = current ? agentById.get(current.agentId) : undefined

  return (
    <div className="inbox">
      <aside className="inbox-list" aria-label="Messages">
        <div className="inbox-head">
          <span className="eyebrow">From your Leads</span>
          <h1>Inbox</h1>
          <div className="inbox-filters" role="tablist" aria-label="Show">
            {FILTERS.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={filter === id} className={'chip' + (filter === id ? ' on' : '') + (id === 'needs' && counts.needs ? ' needs' : '')} onClick={() => setFilter(id)}>
                {label}{counts[id] ? <span className="mono" style={{ marginLeft: 6 }}>{counts[id]}</span> : null}
              </button>
            ))}
          </div>
        </div>
        <div className="inbox-items">
          {shown.length === 0 && (
            <p className="hint inbox-empty">{messages.length ? 'Nothing here.' : 'When an agency Lead has a question, work to review or a digest, it lands here.'}</p>
          )}
          {shown.map((m) => {
            const a = agentById.get(m.agentId)
            return (
              <button key={m.id} type="button" className={'inbox-item' + (current?.id === m.id ? ' on' : '') + (m.readAt ? '' : ' unread') + (needsYou(m) ? ' needs' : '')} onClick={() => setSelected(m.id)}>
                <span className="inbox-item-top">
                  <strong>{a?.name.replace(/\s*\(Lead\)$/, '') ?? 'Lead'} · {agencyById.get(m.agencyId)?.name ?? 'Agency'}</strong>
                  <span className="mono hint">{when(m.createdAt)}</span>
                </span>
                <span className="inbox-item-text">{m.text}</span>
                <span className="row" style={{ gap: 6 }}>
                  <span className={'kind-tag' + (needsYou(m) ? ' needs' : '')}>{KIND[m.kind]}</span>
                  {m.reply && <span className="kind-tag"><Icon name="check" size={10} /> answered</span>}
                </span>
              </button>
            )
          })}
        </div>
      </aside>

      <section className="inbox-detail" aria-label="Message">
        {!current ? (
          <div className="inbox-blank">
            <span className="area-icon"><Icon name="channel" size={18} /></span>
            <strong>No messages yet</strong>
            <span className="hint">Leads write here when there's no channel, and as well as Telegram or Slack when there is.</span>
          </div>
        ) : (
          <>
            <header className="inbox-from">
              {lead ? <Avatar shape={lead.shape} tone={lead.tone} head={lead.head} size={44} /> : <span className="area-icon"><Icon name="agency" size={16} /></span>}
              <span className="inbox-from-text">
                <strong>{lead?.name ?? 'Lead'}</strong>
                <span className="hint">{agency?.name ?? 'Agency'} · {new Date(current.createdAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}{current.delivered ? ` · also sent on ${current.via === 'telegram' ? 'Telegram' : 'Slack'}` : ''}</span>
              </span>
              <span className={'kind-tag' + (needsYou(current) ? ' needs' : '')}>{KIND[current.kind]}</span>
            </header>

            <div className="card inbox-body">{current.text}</div>

            {current.reply ? (
              <div className="inbox-answer">
                <span className="label">Your answer · {current.repliedAt ? when(current.repliedAt) : ''}</span>
                <span>{current.reply}</span>
                <span className="hint">Sent to {lead?.name ?? 'the Lead'}{current.cardId ? ' and noted on the card' : ''}.</span>
              </div>
            ) : (
              <>
                {current.options.length > 0 && (
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    {current.options.map((o) => <button key={o} type="button" className="btn" disabled={sending} onClick={() => void send(o)}>{o}</button>)}
                  </div>
                )}
                <div className="field">
                  <label className="label" htmlFor="inbox-reply">Reply to {lead?.name.replace(/\s*\(Lead\)$/, '') ?? 'the Lead'}</label>
                  <textarea id="inbox-reply" className="textarea" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)}
                    placeholder={current.kind === 'question' ? 'Your answer' : current.kind === 'review' ? 'Approve, or say what to change' : 'Reply, or give the Lead a new brief'}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send(draft) }} />
                </div>
                {error && <p className="hint account-error" role="alert">{error}</p>}
                <div className="row inbox-send">
                  <span className="hint">Your answer goes to {lead?.name.replace(/\s*\(Lead\)$/, '') ?? 'the Lead'}{current.cardId ? ' and onto the card' : ''}.</span>
                  <button type="button" className="btn btn-primary" disabled={sending || !draft.trim()} onClick={() => void send(draft)}>
                    <Icon name="send" size={13} /> {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </>
            )}

            <div className="row" style={{ gap: 8 }}>
              {agency && <button type="button" className="btn" onClick={() => onOpenBoard(agency.projectId)}><Icon name="kanban" size={14} /> Open the board</button>}
            </div>

            {agency && agency.channel.kind === 'none' && (
              <div className="inbox-strip">
                <span className="hint">No channel is set up for {agency.name}, so {lead?.name.replace(/\s*\(Lead\)$/, '') ?? 'the Lead'} writes here. Add Telegram or Slack to get these on your phone.</span>
                <button type="button" className="link-btn" onClick={() => onOpenChannel(agency.projectId)}>Set up a channel</button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
