import type { ProviderId } from './types'

/**
 * Rough list prices per million tokens (USD), used only to estimate what a run cost so an agency can
 * watch its budget. Unknown models cost 0 and show as "not reported". Update when prices change.
 */
const PRICES: { provider: ProviderId; match: RegExp; input: number; output: number }[] = [
  { provider: 'anthropic', match: /opus/i, input: 15, output: 75 },
  { provider: 'anthropic', match: /sonnet/i, input: 3, output: 15 },
  { provider: 'anthropic', match: /haiku/i, input: 0.8, output: 4 },
  // OpenAI list prices from developers.openai.com/api/docs/pricing (standard tier, read 16 Nov 2026). For models with
  // context tiers this is the short-context rate (up to 272K input tokens). A model with no row here estimates as
  // "not reported", never at a guessed rate. Pro sizes come before their family; small sizes too.
  { provider: 'openai', match: /^gpt-5\.6-sol/i, input: 4, output: 20 },
  { provider: 'openai', match: /^gpt-5\.6-terra/i, input: 2, output: 12 },
  { provider: 'openai', match: /^gpt-5\.6-luna/i, input: 0.2, output: 1.2 },
  { provider: 'openai', match: /^gpt-5\.5-pro/i, input: 30, output: 180 },
  { provider: 'openai', match: /^gpt-5\.5(-\d{4}-\d\d-\d\d)?$/i, input: 5, output: 30 },
  { provider: 'openai', match: /^gpt-5\.4-pro/i, input: 30, output: 180 },
  { provider: 'openai', match: /^gpt-5\.4-mini/i, input: 0.75, output: 4.5 },
  { provider: 'openai', match: /^gpt-5\.4-nano/i, input: 0.2, output: 1.25 },
  { provider: 'openai', match: /^gpt-5\.4(-\d{4}-\d\d-\d\d)?$/i, input: 2.5, output: 15 },
  { provider: 'openai', match: /^gpt-5\.3-codex/i, input: 1.75, output: 14 },
  { provider: 'openai', match: /^gpt-5\.2-pro/i, input: 21, output: 168 },
  { provider: 'openai', match: /^gpt-5\.2(-\d{4}-\d\d-\d\d)?$/i, input: 1.75, output: 14 },
  { provider: 'openai', match: /^gpt-5\.1(-\d{4}-\d\d-\d\d)?$/i, input: 1.25, output: 10 },
  { provider: 'openai', match: /^gpt-5-pro/i, input: 15, output: 120 },
  { provider: 'openai', match: /^gpt-5-nano/i, input: 0.05, output: 0.4 },
  { provider: 'openai', match: /^gpt-5-mini/i, input: 0.25, output: 2 },
  { provider: 'openai', match: /^gpt-5(-chat|-codex|-\d{4})?$|^gpt-5-\d{4}-\d\d-\d\d$/i, input: 1.25, output: 10 },
  { provider: 'openai', match: /^gpt-4\.1-nano/i, input: 0.1, output: 0.4 },
  { provider: 'openai', match: /^gpt-4\.1-mini/i, input: 0.4, output: 1.6 },
  { provider: 'openai', match: /^gpt-4\.1/i, input: 2, output: 8 },
  { provider: 'openai', match: /^gpt-4o-mini/i, input: 0.15, output: 0.6 },
  { provider: 'openai', match: /^gpt-4o/i, input: 2.5, output: 10 },
  { provider: 'gemini', match: /pro/i, input: 1.25, output: 10 },
  { provider: 'gemini', match: /flash/i, input: 0.3, output: 2.5 },
  { provider: 'openrouter', match: /opus/i, input: 15, output: 75 },
  { provider: 'openrouter', match: /sonnet/i, input: 3, output: 15 },
  { provider: 'openrouter', match: /gpt-5|gpt-4/i, input: 2.5, output: 10 },
  { provider: 'openrouter', match: /gemini.*pro/i, input: 1.25, output: 10 },
  { provider: 'openrouter', match: /gemini.*flash/i, input: 0.3, output: 2.5 },
  { provider: 'openrouter', match: /deepseek/i, input: 0.3, output: 1.2 }
]

export interface Usage { inputTokens: number; outputTokens: number }

/** Estimated cost in USD, or null when the model's price isn't known (local models are free). */
export function estimateCost(provider: ProviderId, model: string, usage: Usage): number | null {
  if (provider === 'ollama') return 0
  const p = PRICES.find((x) => x.provider === provider && x.match.test(model))
  if (!p) return null
  return (usage.inputTokens * p.input + usage.outputTokens * p.output) / 1_000_000
}
