import type { Agent, DefaultModel, ProviderId } from '@shared/types'
import { MODEL_SUGGESTIONS, PROVIDER_ORDER } from '@shared/models'
import * as db from './db'
import { getSecret } from './secrets'

/**
 * The default model: chosen during onboarding or in Settings → Models, kept per computer, shown in the
 * status bar. Leads and "Default model" cards use it, through each
 * organization's built-in Studio assistant (a normal assistant, so chats, the status bar and Stop all work).
 */

/** Per organization: the id of its Studio assistant. */
const STUDIO = 'assistant:studio'

const ready = (p: ProviderId): boolean => p === 'ollama' || !!getSecret(p)

export function defaultModel(): DefaultModel {
  const p = db.getPrefs()
  const assistantId = db.getSetting(STUDIO)
  if (p.defaultProvider && p.defaultModel) return { provider: p.defaultProvider, model: p.defaultModel, chosen: true, ready: ready(p.defaultProvider), assistantId }
  // Nothing chosen yet: the first provider with a key, else Claude (which then asks for a key).
  const provider = PROVIDER_ORDER.find((x) => x !== 'ollama' && ready(x)) ?? 'anthropic'
  return { provider, model: MODEL_SUGGESTIONS[provider][0], chosen: false, ready: ready(provider), assistantId }
}


export function isStudioAssistant(id: string | undefined): boolean {
  return !!id && db.getSetting(STUDIO) === id
}

/** The organization's Studio assistant on the default model, created the first time it's needed. */
export function studioAssistant(): Agent {
  const d = defaultModel()
  const id = db.getSetting(STUDIO)
  const existing = id ? db.getAgent(id) : null
  if (existing) {
    if (existing.provider !== d.provider || existing.model !== d.model) db.setAgentModel(existing.id, d.provider, d.model)
    return db.getAgent(existing.id)!
  }
  const a = db.saveAgent({
    kind: 'assistant',
    name: 'Studio',
    description: 'Runs on your default model. Cards on "Default model" use it.',
    instructions: `You help with mind maps, designs and automation steps in Tyslin Studio.

- Do exactly what the message asks and reply with only that: no preamble, no closing notes.
- Keep the user's language, terms and formatting unless asked to change them.
- When the message asks for a Markdown list or a passage, reply with just that list or passage.`,
    shape: 'round', tone: 'lime', head: 'profile',
    provider: d.provider, model: d.model, skills: [], schedule: 'manual', engine: 'builtin', writeMode: 'ask', isMascot: false
  })
  db.setSetting(STUDIO, a.id)
  return a
}

/** Moves an existing Studio assistant onto the current default model (it is not created here). */
export function syncStudioAssistant(): void {
  const id = db.getSetting(STUDIO)
  const a = id ? db.getAgent(id) : null
  if (!a) return
  const d = defaultModel()
  if (a.provider !== d.provider || a.model !== d.model) db.setAgentModel(a.id, d.provider, d.model)
}
