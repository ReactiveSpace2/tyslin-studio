import { randomUUID } from 'crypto'
import type { Agent, AgencySuggestion, StarterTurn } from '@shared/types'
import { AVAILABLE_TEMPLATES } from '@shared/agencies'
import { PROVIDER_NAME } from '@shared/models'
import { defaultModel } from './defaultModel'
import { runtimeFor } from './runtime'

/**
 * "What do you want to get done?" on Home while an organization has no agency (owner, 12 Nov 2026; canvas
 * artboard 31, A + C): one call to the default model with the templates and what the user said. The model only
 * picks from the templates, so every agency made from its answer is the same as one made by hand. Nothing is
 * created here; the window shows the picks and the user presses Create.
 */
const MAX_PICKS = 4

function instructions(): string {
  return [
    'You help a new user of Tyslin Studio set up their first teams of AI agents ("agencies"). You only suggest; the user creates them.',
    'Pick the agencies that fit what the user wants, from this list only (id: name: what it does):',
    ...AVAILABLE_TEMPLATES.map((t) => `- ${t.id}: ${t.name}: ${t.tagline}`),
    '',
    `Rules: pick one to ${MAX_PICKS}, only what the user's words call for; when nothing fits, pick none and say so. Use plain, everyday English a non-technical person understands: no jargon. Keep "reply" to one or two short sentences, and ask at most one short follow-up question when it would change the picks.`,
    'For each pick give "why" (one short sentence tied to what the user said) and "firstTask" (one sentence the user could send that team as its first job, written as an instruction).',
    'Answer with JSON only, no code fence: {"reply": string, "picks": [{"templateId": string, "why": string, "firstTask": string}]}'
  ].join('\n')
}

export async function suggestAgencies(turns: StarterTurn[]): Promise<AgencySuggestion> {
  const said = turns.filter((t) => t.text.trim()).slice(-12)
  if (!said.some((t) => t.role === 'user')) throw new Error('Say what you want to get done first.')
  const dm = defaultModel()
  if (!dm.ready) throw new Error(`No ${PROVIDER_NAME[dm.provider] ?? dm.provider} key yet. Add one in Settings → Models, or pick a template yourself.`)
  const now = Date.now()
  const agent: Agent = {
    id: 'starter', kind: 'agent', name: 'Tyslin', description: '', instructions: instructions(), shape: 'round', tone: 'lime', head: null,
    provider: dm.provider, model: dm.model, skills: [], schedule: '', engine: 'builtin', writeMode: 'ask', isMascot: false,
    projectId: null, leadId: null, pinned: false, paused: false, tools: { read: false, write: false }, channels: { telegram: false },
    team: '', agency: null, goal: '', createdAt: now, updatedAt: now
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  let text: string
  try {
    text = await runtimeFor(agent).run({
      runId: 'starter-' + randomUUID(), sessionId: 'starter', agent, skills: [], project: null,
      history: said.map((t, i) => ({ id: `s${i}`, sessionId: 'starter', role: t.role === 'user' ? 'user' as const : 'assistant' as const, content: t.text.slice(0, 2000), createdAt: now + i, attachments: [], context: '' })),
      emit: () => {}, signal: controller.signal
    })
  } catch (err) {
    // Plain words for the two usual failures; the provider's raw error is no help to a new user.
    const msg = err instanceof Error ? err.message : String(err)
    const name = PROVIDER_NAME[dm.provider] ?? dm.provider
    if (/\b(401|403)\b|authentication|invalid.{0,12}key|unauthori[sz]ed/i.test(msg)) throw new Error(`${name} did not accept your key. Check it in Settings → Models, or pick a template yourself.`)
    if (/abort|timed? ?out|fetch failed|network|ENOTFOUND|ECONN/i.test(msg)) throw new Error(`Tyslin could not reach ${name}. Check your connection and try again, or pick a template yourself.`)
    throw new Error(`${name} could not answer just now. Try again, or pick a template yourself.`)
  } finally { clearTimeout(timer) }
  return parseSuggestion(text)
}

/** The model's JSON, read forgivingly (a code fence or a sentence round it); picks outside the templates are dropped. */
export function parseSuggestion(text: string): AgencySuggestion {
  const start = text.indexOf('{'), end = text.lastIndexOf('}')
  let raw: { reply?: unknown; picks?: unknown } = {}
  if (start >= 0 && end > start) { try { raw = JSON.parse(text.slice(start, end + 1)) as typeof raw } catch { /* fall through to the plain text */ } }
  const picks: AgencySuggestion['picks'] = []
  for (const p of Array.isArray(raw.picks) ? raw.picks as { templateId?: unknown; why?: unknown; firstTask?: unknown }[] : []) {
    const t = AVAILABLE_TEMPLATES.find((x) => x.id === String(p?.templateId ?? '').trim() || x.name.toLowerCase() === String(p?.templateId ?? '').trim().toLowerCase())
    if (!t || picks.some((x) => x.templateId === t.id)) continue
    picks.push({ templateId: t.id, why: String(p.why ?? '').trim().slice(0, 240), firstTask: String(p.firstTask ?? '').trim().slice(0, 300) })
    if (picks.length >= MAX_PICKS) break
  }
  const reply = typeof raw.reply === 'string' && raw.reply.trim() ? raw.reply.trim().slice(0, 600) : picks.length ? 'Here is what I would set up.' : (start < 0 ? text.trim().slice(0, 600) : '') || "I couldn't match that to a team. Tell me a bit more, or pick a template yourself."
  return { reply, picks }
}
