import { randomUUID } from 'crypto'
import type { Agency, Agent, ChannelMessage, MessageKind } from '@shared/types'
import * as db from './db'
import { pointLinkedChatsAt, sendToLinkedChats } from './telegram'
import { slackSendToLinked } from './slack'

/**
 * The channel gateway. Every message from an agency to the boss goes through here as one normalized
 * message {from, to, kind, text, actions}; only the agency's Lead may send (workers report to the Lead,
 * never to the boss), and the agency's notify setting decides which kinds leave the app. Every message
 * is kept in channel_messages so the Channel screen shows it, whether or not it was delivered.
 */

const ALLOWED: Record<Agency['notify'], MessageKind[]> = {
  all: ['brief', 'question', 'review', 'digest'],
  questions: ['question', 'review'],
  digest: ['digest']
}

/** Set by index.ts: the Channel screen refreshes when a message arrives. */
export let onChannelMessage: (m: ChannelMessage) => void = () => {}
export function setChannelMessageHook(fn: typeof onChannelMessage): void { onChannelMessage = fn }

export async function sendToBoss(agency: Agency, from: Agent, kind: MessageKind, text: string): Promise<string> {
  if (from.id !== agency.leadId) throw new Error('Only the Lead messages the boss. Report to your Lead on the card instead.')
  const body = text.trim()
  if (!body) throw new Error('Write the message.')
  const wanted = ALLOWED[agency.notify].includes(kind)
  const via = wanted ? agency.channel.kind : 'none'
  let delivered = false
  let note = ''
  const line = `${from.name} · ${agency.name} · ${kind}\n\n${body}`
  try {
    if (via === 'telegram') {
      // The Lead must answer on Telegram for replies to reach it.
      if (!from.channels.telegram) db.saveAgent({ ...from, channels: { ...from.channels, telegram: true } })
      const n = await sendToLinkedChats(line)
      pointLinkedChatsAt(from.id)
      delivered = n > 0
      note = `Sent on Telegram (${n} chat${n === 1 ? '' : 's'}).`
    } else if (via === 'slack') {
      const n = await slackSendToLinked(line, from.id)
      delivered = n > 0
      note = `Sent on Slack (${n} channel${n === 1 ? '' : 's'}).`
    } else {
      note = wanted ? 'No channel is set up for this agency; the boss sees it in the app.' : `The boss only gets ${agency.notify === 'digest' ? 'digests' : 'questions and reviews'} from this agency; this ${kind} is kept in the app.`
    }
  } catch (err) {
    note = `Could not send: ${err instanceof Error ? err.message : String(err)} The boss sees it in the app.`
  }
  const m = db.addChannelMessage({ id: randomUUID(), agencyId: agency.id, agentId: from.id, kind, text: body, via: delivered && via !== 'none' ? via : 'app', delivered, createdAt: Date.now() })
  onChannelMessage(m)
  return note
}
