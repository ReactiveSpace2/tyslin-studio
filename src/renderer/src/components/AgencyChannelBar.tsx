import { useEffect, useState } from 'react'
import type { Agency, Agent, ChannelMessage } from '@shared/types'

const KIND: Record<ChannelMessage['kind'], string> = { brief: 'Brief', question: 'Question', review: 'Review', digest: 'Digest' }

/** Channel inside an agency tab: what the Lead sends the boss, and the messages it has sent so far. */
export function AgencyChannelBar({ agency, lead, onChanged }: { agency: Agency; lead: Agent | null; onChanged: () => void }): JSX.Element {
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const load = (): void => { void window.tyslin.channels.list(agency.id).then(setMessages) }
  useEffect(() => { load(); return window.tyslin.channels.onMessage((m) => { if (m.agencyId === agency.id) load() }) }, [agency.id])
  const setNotify = async (notify: Agency['notify']): Promise<void> => { await window.tyslin.agencies.update(agency.id, { notify }); onChanged() }
  const setChannel = async (kind: Agency['channel']['kind']): Promise<void> => { await window.tyslin.agencies.update(agency.id, { channel: { kind } }); onChanged() }
  return (
    <div className="card agency-channel">
      <span><span className="eyebrow">{agency.name}</span>
        <strong>{lead ? `${lead.name} talks to you here` : 'No Lead yet: add one to hear from this agency'}</strong>
        <span className="hint">Only the Lead messages you: briefs, questions, work to review and digests. Workers report to the Lead.</span></span>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <label className="field" style={{ flex: 1, minWidth: 150 }}><span className="label">Lead talks to you on</span>
          <select className="select" value={agency.channel.kind} onChange={(e) => void setChannel(e.target.value as Agency['channel']['kind'])}>
            <option value="none">In the app only</option><option value="telegram">Telegram</option><option value="slack">Slack</option>
          </select></label>
        <label className="field" style={{ flex: 1, minWidth: 150 }}><span className="label">What the Lead sends</span>
          <select className="select" value={agency.notify} onChange={(e) => void setNotify(e.target.value as Agency['notify'])}>
            <option value="questions">Questions and reviews</option><option value="all">Everything</option><option value="digest">Digest only</option>
          </select></label>
      </div>
      {messages.length > 0 && (
        <div className="agency-feed">
          <span className="section-label" style={{ padding: 0 }}>From {lead?.name ?? 'the Lead'}</span>
          {messages.slice(0, 8).map((m) => (
            <div key={m.id} className="agency-msg">
              <span className="mono hint">{new Date(m.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {KIND[m.kind]}{m.delivered ? ` · ${m.via}` : ' · in the app'}</span>
              <span>{m.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
