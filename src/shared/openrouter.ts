/**
 * OpenRouter (10 Nov 2026): one key for Leads (Tyslin's own runtime) and for Claude Code and Codex workers set to
 * "OpenRouter" in the agent editor. Gemini CLI has no OpenRouter route. The key lives only in main (`secret:openrouter`).
 */
import type { Agent } from './types'

export const OPENROUTER_API = 'https://openrouter.ai/api/v1'
/** Claude Code's Anthropic-compatible base (Claude Code appends /v1/messages). */
export const OPENROUTER_ANTHROPIC_BASE = 'https://openrouter.ai/api'

/** Adapters that can run on OpenRouter, and which model slugs each accepts. */
export const OPENROUTER_ENGINES = ['claude-code', 'codex'] as const
export type OpenRouterEngine = (typeof OPENROUTER_ENGINES)[number]
export const canUseOpenRouter = (engine: string): engine is OpenRouterEngine => (OPENROUTER_ENGINES as readonly string[]).includes(engine)
/** Claude Code speaks Anthropic's API, so only anthropic/* models; Codex takes any full slug (vendor/model). */
export const slugFits = (engine: OpenRouterEngine, slug: string): boolean =>
  engine === 'claude-code' ? /^anthropic\/\S+$/.test(slug) : /^[a-z0-9-]+\/\S+$/i.test(slug)

/**
 * Whether this worker runs through OpenRouter: an adapter that supports it, provider set to OpenRouter in the
 * editor, and a slug that fits the adapter. Workers made while the default model was on OpenRouter keep their own key.
 */
export const usesOpenRouter = (agent: Pick<Agent, 'engine' | 'provider' | 'model'>): boolean =>
  agent.provider === 'openrouter' && canUseOpenRouter(agent.engine) && slugFits(agent.engine, agent.model.trim())

/**
 * OpenRouter's errors in plain words (bad key, no credit, unknown model, rate limit); null when the text isn't one.
 * Matches the HTTP status and OpenRouter's own messages, as relayed by Tyslin's runtime, Claude Code ("API Error: 402 …")
 * and Codex ("unexpected status 402 …").
 */
export function openRouterError(text: string, model?: string): string | null {
  const t = text.slice(0, 2000)
  const status = Number(/(?:error|status|API Error:?)\s*(\d{3})\b/i.exec(t)?.[1] ?? NaN)
  if (status === 401 || /no auth credentials|user not found|invalid api key/i.test(t)) return 'OpenRouter refused the key. Replace it in Settings → Models.'
  if (status === 402 || /insufficient credits|requires more credits|can only afford/i.test(t)) return 'Your OpenRouter account is out of credits. Add credits at openrouter.ai/settings/credits, then run it again.'
  if (/not a valid model id|no endpoints found|model .* (does not exist|not found)/i.test(t) || (status === 404 && /model/i.test(t))) return `OpenRouter doesn't offer the model ${model ? `"${model}"` : 'set for this agent'}${/no endpoints found/i.test(t) ? ' with the features it needs (tool calls)' : ''}. Pick another one in the agent's settings.`
  if (status === 429) return 'OpenRouter is rate-limiting this key or model. Wait a minute, or pick another model.'
  return null
}
