import { randomInt } from 'crypto'
import type { Agent, PermissionChoice, RunEvent, TelegramNotify, TelegramStatus } from '@shared/types'
import { diffHunks } from '@shared/diff'
import * as db from './db'
import { getSecret, setSecret } from './secrets'

/**
 * Telegram channel. The bot is the user's own (token from BotFather), polled from this computer
 * with getUpdates, so no public address is needed. Only chats linked with a one-time code can
 * talk to agents; everything else is ignored. Each agent answers in a chat titled "Telegram".
 * Bot token, linked chats and notification choices are per computer (home DB); the agents that
 * answer, and their Telegram chats, belong to the current organization.
 */

interface Deps {
  /** Same path as a chat message: saves it and starts the reply. */
  startRun: (sessionId: string, text: string) => { runId: string; done: Promise<{ ok: boolean; error?: string }> }
  resolveChange: (changeId: string, acceptedHunks: number[], note: string) => unknown
  answerPermission: (permissionId: string, choiceId: string | null) => void
}

interface Link { chatId: number; name: string }

const API = 'https://api.telegram.org'
const LINK_TTL_MS = 10 * 60 * 1000
let deps: Deps | null = null
let polling: AbortController | null = null
let botName = ''
let lastError = ''
let pendingCode: { code: string; at: number } | null = null
/** Telegram chat → the agent it's talking to (falls back to the first agent that answers on Telegram). */
const currentAgent = new Map<number, string>()
/** Runs started from Telegram → the chat to send approvals to. */
const runChats = new Map<string, number>()
/** Short callback keys for permission choices (Telegram allows 64 bytes of callback data). */
const permissionKeys = new Map<string, { permissionId: string; choiceId: string }>()

const token = (): string | null => getSecret('telegram')
const links = (): Link[] => { try { return JSON.parse(db.getSetting('telegram:links') || '[]') as Link[] } catch { return [] } }
const setLinks = (l: Link[]): void => db.setSetting('telegram:links', JSON.stringify(l))
const isLinked = (chatId: number): boolean => links().some((l) => l.chatId === chatId)

export function notifyPrefs(): TelegramNotify {
  try {
    return { results: true, approvals: true, failures: true, ...JSON.parse(db.getSetting('telegram:notify') || '{}') }
  } catch {
    return { results: true, approvals: true, failures: true }
  }
}

async function call<T>(method: string, body: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const t = token()
  if (!t) throw new Error('No Telegram bot token.')
  const res = await fetch(`${API}/bot${t}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
  const json = (await res.json()) as { ok: boolean; result: T; description?: string }
  if (!json.ok) throw new Error(json.description || `Telegram ${method} failed`)
  return json.result
}

/** Telegram caps a message at 4096 characters; long replies go in parts. */
async function send(chatId: number, text: string, extra: Record<string, unknown> = {}): Promise<void> {
  const parts = text.match(/[\s\S]{1,3900}/g) ?? ['']
  for (let i = 0; i < parts.length; i++) {
    await call('sendMessage', { chat_id: chatId, text: parts[i], ...(i === parts.length - 1 ? extra : {}) }).catch(() => {})
  }
}

const answerers = (): Agent[] => db.listAgents().filter((a) => a.channels.telegram && !a.paused)
const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '')

function agentFor(chatId: number): Agent | null {
  const list = answerers()
  return list.find((a) => a.id === currentAgent.get(chatId)) ?? list[0] ?? null
}

/** The agent's Telegram chat in the current organization, created when missing. */
function sessionFor(agent: Agent): string {
  const key = `tg:session:${agent.id}`
  const id = db.getSetting(key)
  if (id && db.getSession(id)) return id
  const s = db.createSession(agent.id, agent.projectId)
  db.setSessionTitle(s.id, 'Telegram')
  db.setSetting(key, s.id)
  return s.id
}

async function ask(chatId: number, agent: Agent, text: string): Promise<void> {
  const sessionId = sessionFor(agent)
  let started: { runId: string; done: Promise<{ ok: boolean; error?: string }> }
  try {
    started = deps!.startRun(sessionId, text)
  } catch (err) {
    await send(chatId, err instanceof Error ? err.message : String(err))
    return
  }
  runChats.set(started.runId, chatId)
  void call('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {})
  const r = await started.done
  runChats.delete(started.runId)
  if (!r.ok) {
    await send(chatId, `${agent.name} couldn't finish: ${r.error ?? 'unknown error'}`)
    return
  }
  const last = db.listMessages(sessionId).filter((m) => m.role === 'assistant').pop()
  await send(chatId, `${agent.name}: ${last?.content.trim() || '(no reply)'}`)
}

async function onMessage(msg: { chat: { id: number }; from?: { first_name?: string; username?: string }; text?: string }): Promise<void> {
  const chatId = msg.chat.id
  const text = (msg.text ?? '').trim()
  if (text.startsWith('/start')) {
    const code = text.split(/\s+/)[1] ?? ''
    if (pendingCode && code === pendingCode.code && Date.now() - pendingCode.at < LINK_TTL_MS) {
      pendingCode = null
      const name = msg.from?.username ? `@${msg.from.username}` : msg.from?.first_name || 'Telegram user'
      setLinks([...links().filter((l) => l.chatId !== chatId), { chatId, name }])
      await send(chatId, 'Linked to your Tyslin Studio. Send a message to talk to your agents. /agents lists who answers here.')
    }
    return
  }
  // Anyone who hasn't linked with a code is ignored, without a reply.
  if (!isLinked(chatId) || !text) return
  if (text === '/agents' || text === '/help') {
    const list = answerers()
    const cur = agentFor(chatId)
    await send(chatId, list.length
      ? 'Agents on Telegram:\n' + list.map((a) => `/${slug(a.name)}  ${a.name}${a.id === cur?.id ? ' (talking now)' : ''}: ${a.description}`).join('\n') + '\n\nSend /name to switch, or /name followed by a message.'
      : 'No agents answer on Telegram yet. Turn it on in an agent\'s Channels section in Tyslin.')
    return
  }
  if (text.startsWith('/')) {
    const [cmd, ...rest] = text.slice(1).split(/\s+/)
    const agent = answerers().find((a) => slug(a.name) === slug(cmd.split('@')[0]))
    if (!agent) { await send(chatId, 'No agent by that name answers here. /agents lists them.'); return }
    currentAgent.set(chatId, agent.id)
    if (rest.length) await ask(chatId, agent, rest.join(' '))
    else await send(chatId, `Now talking to ${agent.name}.`)
    return
  }
  const agent = agentFor(chatId)
  if (!agent) { await send(chatId, 'No agents answer on Telegram yet. Turn it on in an agent\'s Channels section in Tyslin.'); return }
  await ask(chatId, agent, text)
}

async function onCallback(q: { id: string; data?: string; message?: { chat: { id: number }; message_id: number; text?: string } }): Promise<void> {
  const chatId = q.message?.chat.id
  if (!chatId || !isLinked(chatId) || !q.data) return
  let result = ''
  try {
    const [kind, key] = q.data.split(':')
    if (kind === 'a' || kind === 'r') {
      const change = db.getChange(key)
      if (!change) throw new Error('That change is gone.')
      const all = Array.from({ length: diffHunks(change.original ?? '', change.proposed).hunkCount }, (_, i) => i)
      deps!.resolveChange(key, kind === 'a' ? all : [], kind === 'a' ? '' : 'Rejected from Telegram')
      result = kind === 'a' ? 'Approved' : 'Rejected'
    } else if (kind === 'p') {
      const p = permissionKeys.get(key)
      if (!p) throw new Error('That request has expired.')
      permissionKeys.delete(key)
      deps!.answerPermission(p.permissionId, p.choiceId === '-' ? null : p.choiceId)
      result = p.choiceId === '-' ? 'Declined' : 'Answered'
    }
  } catch (err) {
    result = err instanceof Error ? err.message : String(err)
  }
  await call('answerCallbackQuery', { callback_query_id: q.id, text: result }).catch(() => {})
  if (q.message) {
    await call('editMessageText', { chat_id: chatId, message_id: q.message.message_id, text: `${q.message.text ?? ''}\n\n${result}` }).catch(() => {})
  }
}

/**
 * Run events: file changes and permission requests go to the chat that started the run, or to every
 * linked chat when approvals are on and the run started elsewhere (desktop chat, scheduled task).
 */
export function onRunEvent(e: RunEvent): void {
  if (!polling || e.type !== 'approval_needed') return
  const origin = runChats.get(e.runId)
  const targets = origin ? [origin] : notifyPrefs().approvals ? links().map((l) => l.chatId) : []
  if (!targets.length) return
  const session = db.getSession(e.sessionId)
  const agent = session ? db.getAgent(session.agentId) : null
  const who = agent?.name ?? 'An agent'
  if ('changeId' in e) {
    const project = session?.projectId ? db.getProject(session.projectId)?.name : null
    const text = `${who} wants to change ${e.filePath}${project ? ` in ${project}` : ''}.`
    const markup = { inline_keyboard: [[{ text: 'Approve', callback_data: `a:${e.changeId}` }, { text: 'Reject', callback_data: `r:${e.changeId}` }]] }
    for (const chatId of targets) void send(chatId, text, { reply_markup: markup })
  } else {
    const buttons = (e.choices as PermissionChoice[]).slice(0, 4).map((c) => {
      const key = String(randomInt(1e9))
      permissionKeys.set(key, { permissionId: e.permissionId, choiceId: c.id })
      return { text: c.name, callback_data: `p:${key}` }
    })
    const no = String(randomInt(1e9))
    permissionKeys.set(no, { permissionId: e.permissionId, choiceId: '-' })
    for (const chatId of targets) void send(chatId, `${who}: ${e.title}`, { reply_markup: { inline_keyboard: [buttons, [{ text: 'Decline', callback_data: `p:${no}` }]] } })
  }
}

/** Sends a message to every linked chat (Automation's Telegram node). Returns how many got it. */
export async function sendToLinkedChats(text: string): Promise<number> {
  if (!token()) throw new Error('Telegram is not connected. Add your bot in Connectors first.')
  const targets = links()
  if (!targets.length) throw new Error('No Telegram chat is linked yet. Link one in Connectors.')
  const body = text.trim() || '(empty message)'
  for (const l of targets) await send(l.chatId, body.slice(0, 4000))
  return targets.length
}

/** A scheduled task finished: tell linked chats, if they asked for results or failures. */
export function notifyTask(taskName: string, agentName: string, ok: boolean, error: string, sessionId: string): void {
  if (!polling) return
  const n = notifyPrefs()
  if (ok ? !n.results : !n.failures) return
  const reply = ok ? db.listMessages(sessionId).filter((m) => m.role === 'assistant').pop()?.content.trim() ?? '' : ''
  const text = ok
    ? `${taskName} (${agentName}) finished.\n\n${reply.slice(0, 1500)}${reply.length > 1500 ? '…' : ''}`
    : `${taskName} (${agentName}) failed: ${error}`
  for (const l of links()) void send(l.chatId, text)
}

async function loop(signal: AbortSignal): Promise<void> {
  let offset = Number(db.getSetting('telegram:offset') || 0)
  while (!signal.aborted) {
    try {
      const updates = await call<{ update_id: number; message?: Parameters<typeof onMessage>[0]; callback_query?: Parameters<typeof onCallback>[0] }[]>(
        'getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query'] }, signal)
      lastError = ''
      for (const u of updates) {
        offset = u.update_id + 1
        db.setSetting('telegram:offset', String(offset))
        if (u.message) await onMessage(u.message).catch(() => {})
        if (u.callback_query) await onCallback(u.callback_query).catch(() => {})
      }
    } catch (err) {
      if (signal.aborted) return
      lastError = err instanceof Error ? err.message : String(err)
      await new Promise((r) => setTimeout(r, 5000))
    }
  }
}

function start(): void {
  stop()
  if (!token()) return
  polling = new AbortController()
  void loop(polling.signal)
}

function stop(): void {
  polling?.abort()
  polling = null
}

export async function initTelegram(d: Deps): Promise<void> {
  deps = d
  if (!token()) return
  try { botName = (await call<{ username: string }>('getMe')).username } catch (err) { lastError = err instanceof Error ? err.message : String(err) }
  start()
}

export function telegramStatus(): TelegramStatus {
  return {
    connected: !!token(), botName, linked: links().map((l) => ({ chatId: l.chatId, name: l.name })), running: !!polling, error: lastError,
    notify: notifyPrefs(),
    linkCode: pendingCode && Date.now() - pendingCode.at < LINK_TTL_MS ? pendingCode.code : null
  }
}

/** Saves the bot token after checking it with Telegram ('' disconnects and forgets linked chats). */
export async function setTelegramToken(value: string): Promise<TelegramStatus> {
  const t = value.trim()
  if (!t) {
    stop()
    setSecret('telegram', '')
    setLinks([])
    db.setSetting('telegram:offset', '0')
    botName = ''
    lastError = ''
    return telegramStatus()
  }
  type GetMe = { ok: boolean; result?: { username: string }; description?: string }
  const res: GetMe = await fetch(`${API}/bot${t}/getMe`).then((r) => r.json() as Promise<GetMe>)
    .catch((): GetMe => ({ ok: false, description: 'Could not reach Telegram.' }))
  if (!res.ok || !res.result) throw new Error(res.description === 'Unauthorized' ? 'Telegram didn\'t accept that token. Copy it again from BotFather.' : res.description || 'Telegram didn\'t accept that token.')
  setSecret('telegram', t)
  botName = res.result.username
  lastError = ''
  start()
  return telegramStatus()
}

/** A six-digit code, valid for ten minutes, to send as "/start CODE" from the account to link. */
export function newLinkCode(): TelegramStatus {
  pendingCode = { code: String(randomInt(100000, 999999)), at: Date.now() }
  return telegramStatus()
}

export function unlinkChat(chatId: number): TelegramStatus {
  setLinks(links().filter((l) => l.chatId !== chatId))
  return telegramStatus()
}

export function setTelegramNotify(p: Partial<TelegramNotify>): TelegramStatus {
  db.setSetting('telegram:notify', JSON.stringify({ ...notifyPrefs(), ...p }))
  return telegramStatus()
}
