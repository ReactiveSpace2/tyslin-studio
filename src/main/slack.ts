import { randomInt } from 'crypto'
import type { Agent, SlackStatus } from '@shared/types'
import * as db from './db'
import { getSecret, setSecret } from './secrets'

/**
 * Slack channel. The bot is the user's own Slack app (bot token), polled from this computer with the Web API,
 * so no public address is needed. Only channels linked with a one-time code can talk to agents: the user
 * invites the bot to a channel and posts "tyslin CODE" there. Replies in a linked channel go to the Lead
 * that last wrote there. Token and links are per computer (home DB), like Telegram's.
 * Scopes the app needs: chat:write, channels:read, groups:read, channels:history, groups:history.
 */

interface Deps {
  startRun: (sessionId: string, text: string) => { runId: string; done: Promise<{ ok: boolean; error?: string }> }
}
interface Link { channelId: string; name: string }

const API = 'https://slack.com/api'
const LINK_TTL_MS = 10 * 60 * 1000
const POLL_MS = 4000
let deps: Deps | null = null
let polling: AbortController | null = null
let botName = ''
let botUserId = ''
let lastError = ''
let pendingCode: { code: string; at: number } | null = null

const token = (): string | null => getSecret('slack')
const links = (): Link[] => { try { return JSON.parse(db.getSetting('slack:links') || '[]') as Link[] } catch { return [] } }
const setLinks = (l: Link[]): void => db.setSetting('slack:links', JSON.stringify(l))

async function call<T extends { ok: boolean; error?: string }>(method: string, body: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const t = token()
  if (!t) throw new Error('Slack is not connected.')
  const res = await fetch(`${API}/${method}`, {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${t}` },
    body: JSON.stringify(body)
  })
  const json = await res.json() as T
  if (!json.ok) throw new Error(`Slack ${method}: ${json.error ?? 'failed'}`)
  return json
}

export async function slackPost(channelId: string, text: string): Promise<void> {
  await call('chat.postMessage', { channel: channelId, text: text.slice(0, 3900) })
}

/** Sends to every linked channel and remembers which agent speaks there, so replies go back to it. */
export async function slackSendToLinked(text: string, agentId: string): Promise<number> {
  if (!token()) throw new Error('Slack is not connected. Add your bot in Channel first.')
  const targets = links()
  if (!targets.length) throw new Error('No Slack channel is linked yet. Link one in Channel.')
  for (const l of targets) {
    await slackPost(l.channelId, text)
    db.setSetting(`slack:agent:${l.channelId}`, agentId)
  }
  return targets.length
}

/** The agent's Slack chat in the current organization, created when missing. */
function sessionFor(agent: Agent): string {
  const key = `slack:session:${agent.id}`
  const id = db.getSetting(key)
  if (id && db.getSession(id)) return id
  const s = db.createSession(agent.id, agent.projectId)
  db.setSessionTitle(s.id, 'Slack')
  db.setSetting(key, s.id)
  return s.id
}

/** Who answers in a linked channel: the agent that last wrote there, else the first agency Lead. */
function agentFor(channelId: string): Agent | null {
  const id = db.getSetting(`slack:agent:${channelId}`)
  const a = id ? db.getAgent(id) : null
  if (a && !a.paused) return a
  const lead = db.listAgencies().map((g) => (g.leadId ? db.getAgent(g.leadId) : null)).find((x) => x && !x.paused)
  return lead ?? null
}

async function onMessage(channelId: string, text: string): Promise<void> {
  const agent = agentFor(channelId)
  if (!agent) { await slackPost(channelId, 'No agency Lead answers here yet. Create an agency in Tyslin Studio first.'); return }
  const sessionId = sessionFor(agent)
  let started: ReturnType<Deps['startRun']>
  try { started = deps!.startRun(sessionId, text) } catch (err) { await slackPost(channelId, err instanceof Error ? err.message : String(err)); return }
  const r = await started.done
  if (!r.ok) { await slackPost(channelId, `${agent.name} couldn't finish: ${r.error ?? 'unknown error'}`); return }
  const last = db.listMessages(sessionId).filter((m) => m.role === 'assistant').pop()
  await slackPost(channelId, `${agent.name}: ${last?.content.trim() || '(no reply)'}`)
}

type Channel = { id: string; name: string }
type History = { ok: boolean; messages?: { ts: string; user?: string; bot_id?: string; subtype?: string; text?: string }[] }

async function poll(signal: AbortSignal): Promise<void> {
  // Linking: look for the code in channels the bot is in but that aren't linked yet.
  if (pendingCode && Date.now() - pendingCode.at < LINK_TTL_MS) {
    const list = await call<{ ok: boolean; channels?: Channel[] }>('users.conversations', { types: 'public_channel,private_channel', limit: 200 }, signal)
    for (const c of list.channels ?? []) {
      if (links().some((l) => l.channelId === c.id)) continue
      const h = await call<History>('conversations.history', { channel: c.id, limit: 20 }, signal)
      if ((h.messages ?? []).some((m) => !m.bot_id && (m.text ?? '').toLowerCase().includes(pendingCode!.code))) {
        setLinks([...links(), { channelId: c.id, name: c.name }])
        db.setSetting(`slack:ts:${c.id}`, String(Date.now() / 1000))
        pendingCode = null
        await slackPost(c.id, 'Linked to your Tyslin Studio. The agency Lead answers here.')
        break
      }
    }
  }
  // Linked channels: new human messages since the last one seen.
  for (const l of links()) {
    const oldest = db.getSetting(`slack:ts:${l.channelId}`) || String(Date.now() / 1000)
    const h = await call<History>('conversations.history', { channel: l.channelId, oldest, limit: 20 }, signal)
    const fresh = (h.messages ?? []).filter((m) => !m.bot_id && m.user !== botUserId && !m.subtype && (m.text ?? '').trim()).sort((a, b) => Number(a.ts) - Number(b.ts))
    for (const m of fresh) {
      db.setSetting(`slack:ts:${l.channelId}`, m.ts)
      await onMessage(l.channelId, m.text!.trim()).catch(() => {})
    }
    if (!fresh.length && h.messages?.length) db.setSetting(`slack:ts:${l.channelId}`, h.messages.map((m) => m.ts).sort().pop()!)
  }
}

async function loop(signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    try { await poll(signal); lastError = '' } catch (err) { if (signal.aborted) return; lastError = err instanceof Error ? err.message : String(err) }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
}
function start(): void { stop(); if (token()) { polling = new AbortController(); void loop(polling.signal) } }
function stop(): void { polling?.abort(); polling = null }

export async function initSlack(d: Deps): Promise<void> {
  deps = d
  if (!token()) return
  try { const me = await call<{ ok: boolean; user: string; user_id: string }>('auth.test'); botName = me.user; botUserId = me.user_id } catch (err) { lastError = err instanceof Error ? err.message : String(err) }
  start()
}

export function slackStatus(): SlackStatus {
  return {
    connected: !!token(), botName, linked: links(), running: !!polling, error: lastError,
    linkCode: pendingCode && Date.now() - pendingCode.at < LINK_TTL_MS ? pendingCode.code : null
  }
}

/** Saves the bot token after checking it with Slack ('' disconnects and forgets linked channels). */
export async function setSlackToken(value: string): Promise<SlackStatus> {
  const t = value.trim()
  if (!t) { stop(); setSecret('slack', ''); setLinks([]); botName = ''; botUserId = ''; lastError = ''; return slackStatus() }
  type AuthTest = { ok: boolean; user?: string; user_id?: string; error?: string }
  const res: AuthTest = await fetch(`${API}/auth.test`, { method: 'POST', headers: { authorization: `Bearer ${t}` } })
    .then((r) => r.json() as Promise<AuthTest>)
    .catch((): AuthTest => ({ ok: false, error: 'Could not reach Slack.' }))
  if (!res.ok || !res.user) throw new Error(res.error === 'invalid_auth' ? 'Slack didn\'t accept that token. Copy the Bot User OAuth Token from your app\'s OAuth page.' : res.error || 'Slack didn\'t accept that token.')
  setSecret('slack', t)
  botName = res.user
  botUserId = res.user_id ?? ''
  lastError = ''
  start()
  return slackStatus()
}

/** A six-digit code, valid for ten minutes, to post as "tyslin CODE" in the channel to link (after inviting the bot). */
export function newSlackLinkCode(): SlackStatus {
  pendingCode = { code: String(randomInt(100000, 999999)), at: Date.now() }
  return slackStatus()
}

export function unlinkSlackChannel(channelId: string): SlackStatus {
  setLinks(links().filter((l) => l.channelId !== channelId))
  return slackStatus()
}
