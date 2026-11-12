import { randomUUID } from 'crypto'
import type { Agency, Agent, ChannelMessage, MessageKind } from '@shared/types'
import * as db from './db'
import { pointLinkedChatsAt, sendToLinkedChats } from './telegram'
import { slackSendToLinked } from './slack'
import { findCard, log, patchCard, readBoard } from './boardTools'
import { answerBudget } from './budget'
import { saveIntegration, testIntegration } from './integrations'
import { needLabel, resolveTool, serverIsTool } from '@shared/toolCatalog'

/**
 * The channel gateway. Every message from an agency to the boss goes through here as one normalized
 * message {from, to, kind, text, actions}; only the agency's Lead may send (workers report to the Lead,
 * never to the boss), and the agency's notify setting decides which kinds leave the app. Every message
 * is kept in channel_messages so the agency's Inbox and Channel screen show it, whether or not it was delivered.
 * The boss answers in the Inbox (or a desktop notification); `replyToLead` saves the answer, notes it on
 * the card and sends it to the Lead in its "Inbox" chat.
 */

const ALLOWED: Record<Agency['notify'], MessageKind[]> = {
  all: ['brief', 'question', 'review', 'digest', 'budget', 'needs'],
  questions: ['question', 'review', 'budget', 'needs'],
  digest: ['digest', 'budget']
}

/** Set by index.ts: the Inbox and Channel screens refresh, and `wanted` messages pop up as desktop notifications. */
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
      note = wanted ? 'No channel is set up for this agency; the boss gets it in this agency\'s Inbox in the app and as a desktop notification, and the answer comes back to you in your "Your answers" chat.' : `The boss only gets ${agency.notify === 'digest' ? 'digests' : 'questions and reviews'} from this agency as notifications; this ${kind} is kept in the Inbox.`
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
  db.setSessionTitle(s.id, 'Your answers')
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
        // Only a busy Lead is worth waiting for; any other error (chat or Lead deleted) would retry forever.
        try { deps!.startRun(next.sessionId, next.text) } catch (e) { if (e instanceof Error && /still working/.test(e.message)) queued.unshift(next) }
      }, 5000)
    } else throw err
  }
}

/**
 * Saves the boss's answer, notes it on the card, and sends it to the Lead: into the task it was answered
 * from when that chat is the Lead's (so the follow-up lands in the same thread), else into the Lead's "Your answers" chat.
 */
export function replyToLead(messageId: string, text: string, sessionId?: string): ChannelMessage {
  const answer = text.trim()
  if (!answer) throw new Error('Write your answer.')
  const m = db.getChannelMessage(messageId)
  if (!m) throw new Error('That message is gone.')
  // The cap message is Tyslin's, not the Lead's: raise the cap or keep it paused, without waking the Lead.
  if (m.kind === 'budget') { const saved = answerBudget(m, answer); onChannelMessage(saved, false); return saved }
  const agency = db.getAgency(m.agencyId)
  const lead = agency?.leadId ? db.getAgent(agency.leadId) : null
  if (!agency || !lead) throw new Error('This agency has no Lead to answer.')
  if (!deps) throw new Error('Replies are not available yet.')
  const quoted = m.text.length > 400 ? `${m.text.slice(0, 400)}…` : m.text
  const card = m.cardId ? ` (card ${m.cardId})` : ''
  const inTask = sessionId && db.getSession(sessionId)?.agentId === lead.id ? sessionId : null
  // A needs message answered with "Add <name>" (from Telegram or Slack, where the app's buttons aren't there): Tyslin
  // attaches the skill, or adds a tool that needs no account, and tells the Lead what happened.
  const did = m.kind === 'needs' ? applyNeedAnswer(agency, answer) : ''
  deliver(inTask ?? inboxSession(lead), `The boss answered your ${m.kind}${card}${inTask ? '' : " in the app's Inbox"}.\n\nYou wrote:\n> ${quoted.replace(/\n/g, '\n> ')}\n\nThe boss's answer:\n${answer}${did ? `\n\n${did}` : ''}\n\nAct on it: update the board and tell the worker on the card if their work changes.`)
  if (m.cardId) patchCard(agency, m.cardId, (c) => log(c, `Boss: ${answer}`))
  const saved = db.replyChannelMessage(messageId, answer)!
  onChannelMessage(saved, false)
  return saved
}

/** "Add Playwright" / "Add accessibility-check" from a needs message: done here for things that need no token. */
function applyNeedAnswer(agency: Agency, answer: string): string {
  const notes: string[] = []
  const team = db.listAgents().filter((a) => a.agency === agency.id && a.engine !== 'builtin')
  for (const part of answer.split(/\s*(?:,|;| and )\s*/)) {
    const m = /^add\s+(.+)$/i.exec(part.trim())
    if (!m) continue
    const name = m[1].trim()
    const tool = resolveTool(name)
    if (tool) {
      const have = db.listMcpServers().find((s) => serverIsTool(s, tool.id))
      if (have) {
        const ids = [...new Set([...have.agentIds, ...team.map((a) => a.id)])]
        if (ids.length !== have.agentIds.length) db.setMcpAgents(have.id, ids)
        notes.push(`Tyslin: ${tool.title} is connected for ${team.map((a) => a.name.split(' ')[0]).join(', ')}.`)
      } else if (tool.commandLine) {
        try {
          const saved = saveIntegration({ name: tool.name, title: tool.title, source: tool.source ?? '', preset: '', transport: 'stdio', commandLine: tool.commandLine, env: '', agentIds: team.map((a) => a.id) })
          void testIntegration(saved.id).catch(() => undefined)
          notes.push(`Tyslin: added ${needLabel({ kind: 'tool', name: tool.id })} for ${team.map((a) => a.name.split(' ')[0]).join(', ')}.`)
        } catch (err) { notes.push(`Tyslin: could not add ${tool.title}: ${err instanceof Error ? err.message : String(err)}`) }
      } else notes.push(`Tyslin: ${tool.title} needs the boss's token, so it is connected from the app, not from here. Plan as if it will be there.`)
      continue
    }
    const skill = db.listSkills().find((s) => s.name === name.toLowerCase())
    if (skill) {
      for (const a of team) if (!a.skills.includes(skill.name)) db.saveAgent({ ...a, skills: [...a.skills, skill.name] })
      notes.push(`Tyslin: the ${skill.name} skill is now on ${team.map((a) => a.name.split(' ')[0]).join(', ')}.`)
    } else notes.push(`Tyslin: no tool or skill called "${name}".`)
  }
  return notes.join('\n')
}
