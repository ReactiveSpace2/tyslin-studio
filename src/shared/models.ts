import type { ProviderId } from './types'

/** Model names offered for each provider (any other name can be typed in). */
export const MODEL_SUGGESTIONS: Record<ProviderId, string[]> = {
  anthropic: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'],
  openai: ['gpt-4o', 'gpt-4o-mini'],
  gemini: ['gemini-pro-latest', 'gemini-flash-latest', 'gemini-3.1-pro-preview', 'gemini-3.8-flash', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  ollama: ['llama3.1', 'qwen2.5', 'mistral'],
  // OpenRouter: the full list loads from its API in the picker; these are only fallbacks.
  openrouter: ['anthropic/claude-sonnet-4.5', 'openai/gpt-5', 'google/gemini-2.5-pro', 'deepseek/deepseek-chat']
}

/** Short provider names, as the status bar and pickers show them. */
export const PROVIDER_NAME: Record<ProviderId, string> = { anthropic: 'Claude', openai: 'ChatGPT', gemini: 'Gemini', ollama: 'Ollama', openrouter: 'OpenRouter' }

/** The order used when no default model has been chosen: the first provider with a key wins. */
export const PROVIDER_ORDER: ProviderId[] = ['anthropic', 'openai', 'gemini', 'openrouter', 'ollama']
