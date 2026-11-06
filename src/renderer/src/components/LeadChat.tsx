import { useEffect, useRef, useState } from 'react'
import type { Agency, Agent, ChannelMessage, KanbanDoc } from '@shared/types'
import { BRIEF_LOG } from '@shared/agencies'
import { Avatar } from './Avatar'
import { firstName } from '../boardStats'

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))

/** One line in the thread: a Lead message (with the boss's answer under it) or a brief the boss typed here. */
type Item =
  | { kind: 'lead'; at: number; m: ChannelMessage }
  | { kind: 'brief'; at: number; id: string; text: string; column: string }

const time = (at: number): string => {
  const d = new Date(at)
  const today = new Date().toDateString() === d.toDateString()
  return d.toLocaleString([], today ? { hour: '2-digit', minute: '2-digit' } : { weekday: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Briefs the boss typed in this chat, read back from the board (cards whose log starts with BRIEF_LOG). */
async function readBriefs(agency: Agency): Promise<Item[]> {
  try {
    const doc = JSON.parse(await window.tyslin.studio.read(agency.projectId, agency.boardPath)) as KanbanDoc
    return doc.columns.flatMap((c) => c.cards
      .filter((k) => k.log?.some((l) => l.text === BRIEF_LOG))
      .map((k) => ({ kind: 'brief' as const, at: k.log!.find((l) => l.text === BRIEF_LOG)!.at, id: k.id, text: k.notes || k.title, column: c.title })))
  } catch { return [] }
}

/**
 * The Lead's side of the agency, as a chat: its briefs, questions, reviews and digests (channel_messages), the
 * boss's answers, and briefs the boss gives here. Quick answers and replies go through channels.reply;
 * a new message becomes a card in Inbox and starts the Lead's planning run (agencies.brief).
 */
export function LeadChat({ agency, lead, onChannel, onCountChange }: {
  agency: Agency
  lead: Agent | null
  /** Opens the agency's Channel screen (Telegram and Slack). */
  onChannel: () => void
  /** Called after messages are marked read, so the toolbar's Inbox count updates. */
  onCountChange: () => void
}): JSX.Element {
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [briefs, setBriefs] = useState<Item[]>([])
  const [target, setTarget] = useState<ChannelMessage | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const who = lead ? firstName(lead.name) : 'the Lead'

  const load = (): void => {
    void window.tyslin.channels.list(agency.id).then(setMessages)
    void readBriefs(agency).then(setBriefs)
  }
  useEffect(() => {
    load()
    const offMsg = window.tyslin.channels.onMessage((m) => { if (m.agencyId === agency.id) load() })
    const offBoard = window.tyslin.cards.onBoardChanged((p) => { if (p.projectId === agency.projectId) void readBriefs(agency).then(setBriefs) })
    return () => { offMsg(); offBoard() }
  }, [agency.id])

  // Opening the chat reads what's in it.
  useEffect(() => {
    const unread = messages.filter((m) => !m.readAt).map((m) => m.id)
    if (unread.length) void window.tyslin.channels.markRead(unread).then(onCountChange)
  }, [messages])

  const items: Item[] = [...messages.map((m) => ({ kind: 'lead' as const, at: m.createdAt, m })), ...briefs].sort((a, b) => a.at - b.at)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [items.length])

  const answer = async (m: ChannelMessage, text: string): Promise<void> => {
    setBusy(true); setError(null); setNote(null)
    try { await window.tyslin.channels.reply(m.id, text); setTarget(null); setDraft(''); setNote(`Sent to ${who}.`); load() } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const send = async (): Promise<void> => {
    const text = draft.trim()
    if (!text || busy) return
    if (target) return answer(target, text)
    setBusy(true); setError(null); setNote(null)
    try {
      const r = await window.tyslin.agencies.brief(agency.id, text)
      setDraft('')
      setNote(r.planned ? `Added to Inbox. ${who} is planning it.` : agency.paused ? `Added to Inbox. ${who} plans it when you resume ${agency.name}.` : `Added to Inbox. ${who} plans it on the next run.`)
      load()
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const replyTo = (m: ChannelMessage): void => { setTarget(m); setNote(null); input.current?.focus() }

  const channel = agency.channel.kind === 'telegram' ? 'Telegram' : agency.channel.kind === 'slack' ? 'Slack' : null

  return (
    <section className="lc" aria-label={`Chat with ${lead?.name ?? 'the Lead'}`}>
      <header className="lc-head">
        {lead ? <Avatar shape={lead.shape} tone={lead.tone} head={lead.head} size={36} /> : <span className="lc-noav" aria-hidden="true">?</span>}
        <span className="lc-who">
          <strong>{lead?.name ?? 'No Lead yet'}</strong>
          <span className="hint">{channel ? `Also writes to you on ${channel}` : 'Talks to you here until a channel is set up'}</span>
        </span>
      </header>

      <div className="lc-thread" role="log" aria-live="polite">
        {items.length === 0 && <p className="hint lc-empty">{lead ? `${who} hasn't written yet. Give ${who} a brief below and it lands in Inbox on the board.` : 'Add a Lead to this agency to talk to it here.'}</p>}
        {items.map((it) => it.kind === 'brief' ? (
          <div key={'b' + it.id} className="lc-me">
            <span className="mono lc-meta">Brief · {it.column} · {time(it.at)}</span>
            <span className="lc-text">{it.text}</span>
          </div>
        ) : (
          <div key={it.m.id} className="lc-pair">
            <div className={'lc-msg' + (it.m.kind === 'question' && !it.m.reply ? ' ask' : '') + (target?.id === it.m.id ? ' target' : '')}>
              <span className="lc-msg-top">
                <span className={'lc-kind mono' + (it.m.kind === 'question' ? ' q' : '')}>{it.m.kind}</span>
                <span className="mono lc-meta">{time(it.m.createdAt)}{it.m.delivered && it.m.via !== 'app' ? ` · also on ${it.m.via === 'telegram' ? 'Telegram' : 'Slack'}` : ''}</span>
              </span>
              <span className="lc-text">{it.m.text}</span>
              {!it.m.reply && (it.m.kind === 'question' || it.m.kind === 'review') && (
                <span className="lc-actions">
                  {it.m.options.map((o) => (
                    <button key={o} type="button" className="btn btn-sm" disabled={busy} onClick={() => void answer(it.m, o)}>{o}</button>
                  ))}
                  <button type="button" className="btn btn-sm lc-reply" disabled={busy} onClick={() => replyTo(it.m)}>Reply</button>
                </span>
              )}
            </div>
            {it.m.reply && (
              <div className="lc-me">
                <span className="mono lc-meta">You{it.m.repliedAt ? ` · ${time(it.m.repliedAt)}` : ''}</span>
                <span className="lc-text">{it.m.reply}</span>
              </div>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>

      <form className="lc-compose" onSubmit={(e) => { e.preventDefault(); void send() }}>
        {target ? (
          <span className="lc-target">
            <span className="hint">Answering {who}&apos;s {target.kind}: <em>{target.text.length > 70 ? `${target.text.slice(0, 70)}…` : target.text}</em></span>
            <button type="button" className="btn btn-sm" onClick={() => setTarget(null)}>New brief instead</button>
          </span>
        ) : <label htmlFor="lc-input" className="hint">Message {who}</label>}
        <div className="lc-row">
          <textarea id="lc-input" ref={input} className="input lc-input" rows={2} value={draft} disabled={!lead}
            aria-label={target ? `Answer ${who}` : `Message ${who}`}
            placeholder={target ? 'Your answer' : `Give ${who} a new brief`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }} />
          <button type="submit" className="btn btn-primary" disabled={!draft.trim() || busy || !lead}>{busy ? 'Sending…' : 'Send'}</button>
        </div>
        {note && <span className="hint" role="status">{note}</span>}
        {error && <span className="hint account-error" role="alert">{error}</span>}
        {!channel && <button type="button" className="link-btn lc-channel" onClick={onChannel}>Also get these on Telegram or Slack</button>}
      </form>
    </section>
  )
}
