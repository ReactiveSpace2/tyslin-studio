import { useEffect, useMemo, useState } from 'react'
import type { Agency, Agent, ChannelMessage } from '@shared/types'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Pose } from '../components/Pose'

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

/**
 * An agency's Inbox: what its Lead sent you (briefs, questions, reviews, digests) as a list with filters,
 * the open message with its quick answers and reply box, and New brief, which puts a card in the board's
 * Inbox column and starts the Lead's planning run (agencies.brief).
 */
export function InboxPage({ agency: scope, agencies, agents, focusId, onOpenBoard, onOpenChannel, onCountChange }: {
  /** The agency whose Inbox this is: only its messages show. */
  agency: Agency
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
  /** New brief open in the right pane instead of a message. */
  const [briefing, setBriefing] = useState(false)
  const [brief, setBrief] = useState('')
  const [note, setNote] = useState('')

  const load = (): void => { void window.tyslin.channels.list(scope.id).then(setMessages) }
  useEffect(() => { load(); return window.tyslin.channels.onMessage((m) => { if (m.agencyId === scope.id) load() }) }, [scope.id])
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
  const scopeLead = scope.leadId ? agentById.get(scope.leadId) : undefined
  const leadFirst = scopeLead?.name.replace(/\s*\(Lead\)$/, '') ?? 'the Lead'

  const sendBrief = async (): Promise<void> => {
    if (!brief.trim()) return
    setSending(true); setError(''); setNote('')
    try {
      const r = await window.tyslin.agencies.brief(scope.id, brief)
      setBrief('')
      setNote(r.planned ? `Added to Inbox on the board. ${leadFirst} is planning it.` : scope.paused ? `Added to Inbox on the board. ${leadFirst} plans it when you resume ${scope.name}.` : `Added to Inbox on the board. ${leadFirst} plans it on the next run.`)
    } catch (err) { setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)) } finally { setSending(false) }
  }

  return (
    <div className="inbox">
      <aside className="inbox-list" aria-label="Messages">
        <div className="inbox-head">
          <span className="eyebrow">{scope.name}</span>
          <div className="inbox-title">
            <h1>Inbox</h1>
            <button type="button" className={'btn btn-sm' + (briefing ? ' btn-primary' : '')} disabled={!scopeLead} onClick={() => { setBriefing(true); setNote(''); setError('') }}><Icon name="plus" size={12} /> New brief</button>
          </div>
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
            <p className="hint inbox-empty">{messages.length ? 'Nothing here.' : `When ${leadFirst} has a question, work to review or a digest, it lands here.`}</p>
          )}
          {shown.map((m) => {
            const a = agentById.get(m.agentId)
            return (
              <button key={m.id} type="button" className={'inbox-item' + (current?.id === m.id ? ' on' : '') + (m.readAt ? '' : ' unread') + (needsYou(m) ? ' needs' : '')} onClick={() => { setSelected(m.id); setBriefing(false) }}>
                <span className="inbox-item-top">
                  <strong>{a?.name.replace(/\s*\(Lead\)$/, '') ?? 'Lead'}</strong>
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

      <section className="inbox-detail" aria-label={briefing ? 'New brief' : 'Message'}>
        {briefing ? (
          <>
            <header className="inbox-from">
              {scopeLead ? <Avatar shape={scopeLead.shape} tone={scopeLead.tone} head={scopeLead.head} size={44} /> : <span className="area-icon"><Icon name="agency" size={16} /></span>}
              <span className="inbox-from-text">
                <strong>New brief for {scopeLead?.name ?? 'the Lead'}</strong>
                <span className="hint">It goes into Inbox on {scope.name}&apos;s board, and {leadFirst} turns it into cards.</span>
              </span>
            </header>
            <div className="field">
              <label className="label" htmlFor="inbox-brief">What do you need?</label>
              <textarea id="inbox-brief" className="textarea" rows={6} autoFocus value={brief} onChange={(e) => setBrief(e.target.value)}
                placeholder="The work, what done looks like, and anything to avoid."
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void sendBrief() }} />
            </div>
            {error && <p className="hint account-error" role="alert">{error}</p>}
            {note && <p className="ok" role="status">{note}</p>}
            <div className="row inbox-send">
              <button type="button" className="btn" onClick={() => setBriefing(false)}>{note ? 'Back to messages' : 'Cancel'}</button>
              <button type="button" className="btn btn-primary" disabled={sending || !brief.trim()} onClick={() => void sendBrief()}>
                <Icon name="send" size={13} /> {sending ? 'Sending…' : 'Send brief'}
              </button>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn" onClick={() => onOpenBoard(scope.projectId)}><Icon name="kanban" size={14} /> Open the board</button>
            </div>
          </>
        ) : !current ? (
          <div className="inbox-blank">
            <Pose pose={3} height={170} />
            <strong>No messages yet</strong>
            <span className="hint">{leadFirst} writes here when there&apos;s no channel, and as well as Telegram or Slack when there is. Use New brief to give {leadFirst} work.</span>
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
                    placeholder={current.kind === 'question' ? 'Your answer' : current.kind === 'review' ? 'Approve, or say what to change' : `Reply to ${leadFirst}`}
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
