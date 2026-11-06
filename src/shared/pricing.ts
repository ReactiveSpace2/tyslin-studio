import type { ProviderId } from './types'

/**
 * Rough list prices per million tokens (USD), used only to estimate what a run cost so an agency can
 * watch its budget. Unknown models cost 0 and show as "not reported". Update when prices change.
 */
const PRICES: { provider: ProviderId; match: RegExp; input: number; output: number }[] = [
  { provider: 'anthropic', match: /opus/i, input: 15, output: 75 },
  { provider: 'anthropic', match: /sonnet/i, input: 3, output: 15 },
  { provider: 'anthropic', match: /haiku/i, input: 0.8, output: 4 },
  { provider: 'openai', match: /gpt-5|gpt-4\.1(?!-mini|-nano)|gpt-4o(?!-mini)/i, input: 2.5, output: 10 },
  { provider: 'openai', match: /mini|nano/i, input: 0.15, output: 0.6 },
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
