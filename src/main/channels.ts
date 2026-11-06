import { randomUUID } from 'crypto'
import type { Agency, Agent, ChannelMessage, MessageKind } from '@shared/types'
import * as db from './db'
import { pointLinkedChatsAt, sendToLinkedChats } from './telegram'
import { slackSendToLinked } from './slack'
import { findCard, log, patchCard, readBoard } from './boardTools'

/**
 * The channel gateway. Every message from an agency to the boss goes through here as one normalized
 * message {from, to, kind, text, actions}; only the agency's Lead may send (workers report to the Lead,
 * never to the boss), and the agency's notify setting decides which kinds leave the app. Every message
 * is kept in channel_messages so the agency's Lead chat and Channel screen show it, whether or not it was delivered.
 * The boss answers in the Lead chat (or a desktop notification); `replyToLead` saves the answer, notes it on
 * the card and sends it to the Lead in its "Inbox" chat.
 */

const ALLOWED: Record<Agency['notify'], MessageKind[]> = {
  all: ['brief', 'question', 'review', 'digest'],
  questions: ['question', 'review'],
  digest: ['digest']
}

/** Set by index.ts: the Lead chat and Channel screens refresh, and `wanted` messages pop up as desktop notifications. */
export let onChannelMessage: (m: ChannelMessage, wanted: boolean) => void = () => {}
export function setChannelMessageHook(fn: typeof onChannelMessage): void { onChannelMessage = fn }

interface Deps {
  startRun: (sessionId: string, text: string) => { runId: string; done: Promise<{ ok: boolean; error?: string }> }
}
let deps: Deps | null = null
export function initChannels(d: Deps): void { deps = d }

export interface BossExtras { options?: string[]; cardId?: string | null }

export async function sendToBoss(agency: Agency, from: Agent, kind: MessageKind, text: string, extras: BossExtras = {}): Promise<string> {
  if (from.id !== agency.leadId) throw new Error('Only the Lead messages the boss. Report to your Lead on the card instead.')
  const body = text.trim()
  if (!body) throw new Error('Write the message.')
  const options = (extras.options ?? []).map((o) => String(o).trim()).filter(Boolean).slice(0, 4)
  const doc = extras.cardId ? readBoard(agency) : null
  const cardId = doc && extras.cardId && findCard(doc, extras.cardId) ? extras.cardId : null
  const wanted = ALLOWED[agency.notify].includes(kind)
  const via = wanted ? agency.channel.kind : 'none'
  let delivered = false
  let note = ''
  const line = `${from.name} · ${agency.name} · ${kind}\n\n${body}${options.length ? `\n\nOptions: ${options.join(' / ')}` : ''}`
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
      note = wanted ? 'No channel is set up for this agency; the boss gets it in this agency\'s Lead chat and as a desktop notification, and the answer comes back to you in your "Inbox" chat.' : `The boss only gets ${agency.notify === 'digest' ? 'digests' : 'questions and reviews'} from this agency as notifications; this ${kind} is kept in the Inbox.`
    }
  } catch (err) {
    note = `Could not send: ${err instanceof Error ? err.message : String(err)} The boss sees it in the app.`
  }
  const m = db.addChannelMessage({
    id: randomUUID(), agencyId: agency.id, agentId: from.id, kind, text: body, via: delivered && via !== 'none' ? via : 'app', delivered,
    createdAt: Date.now(), options, cardId, reply: '', repliedAt: null, readAt: null
  })
  onChannelMessage(m, wanted)
  return note
}

/** The Lead's chat for answers from the Inbox (per organization), created when missing. */
function inboxSession(agent: Agent): string {
  const key = `inbox:session:${agent.id}`
  const id = db.getSetting(key)
  if (id && db.getSession(id)) return id
  const s = db.createSession(agent.id, agent.projectId)
  db.setSessionTitle(s.id, 'Inbox')
  db.setSetting(key, s.id)
  return s.id
}

/** Answers that wait because the Lead is busy in its Inbox chat; retried every few seconds. */
const queued: { sessionId: string; text: string }[] = []
let retry: ReturnType<typeof setInterval> | null = null
function deliver(sessionId: string, text: string): void {
  try { deps!.startRun(sessionId, text) } catch (err) {
    if (err instanceof Error && /still working/.test(err.message)) {
      queued.push({ sessionId, text })
      retry ??= setInterval(() => {
        const next = queued.shift()
        if (!next) { clearInterval(retry!); retry = null; return }
        try { deps!.startRun(next.sessionId, next.text) } catch { queued.unshift(next) }
      }, 5000)
    } else throw err
  }
}

/** Saves the boss's answer, notes it on the card, and sends it to the Lead. */
export function replyToLead(messageId: string, text: string): ChannelMessage {
  const answer = text.trim()
  if (!answer) throw new Error('Write your answer.')
  const m = db.getChannelMessage(messageId)
  if (!m) throw new Error('That message is gone.')
  const agency = db.getAgency(m.agencyId)
  const lead = agency?.leadId ? db.getAgent(agency.leadId) : null
  if (!agency || !lead) throw new Error('This agency has no Lead to answer.')
  if (!deps) throw new Error('Replies are not available yet.')
  const quoted = m.text.length > 400 ? `${m.text.slice(0, 400)}…` : m.text
  const card = m.cardId ? ` (card ${m.cardId})` : ''
  deliver(inboxSession(lead), `The boss answered your ${m.kind}${card} in the Lead chat.\n\nYou wrote:\n> ${quoted.replace(/\n/g, '\n> ')}\n\nThe boss's answer:\n${answer}\n\nAct on it: update the board and tell the worker on the card if their work changes.`)
  if (m.cardId) patchCard(agency, m.cardId, (c) => log(c, `Boss: ${answer}`))
  const saved = db.replyChannelMessage(messageId, answer)!
  onChannelMessage(saved, false)
  return saved
}
