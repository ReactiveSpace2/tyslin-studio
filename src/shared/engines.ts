import type { EngineId, ExternalEngineId } from './types'

/** Display names, shared by main and the UI. */
export const ENGINE_NAMES: Record<EngineId, string> = {
  builtin: 'Tyslin', goose: 'Goose', hermes: 'Hermes', zeroclaw: 'ZeroClaw', openclaw: 'OpenClaw', custom: 'Custom ACP agent',
  'claude-code': 'Claude Code', 'gemini-cli': 'Gemini CLI', codex: 'Codex'
}

/**
 * The external agents Tyslin offers today: Claude Code, Codex and Gemini CLI. Hermes, Goose, ZeroClaw,
 * OpenClaw and custom ACP commands stay in main/engines.ts and keep working for agents already on them,
 * but screens hide them while this is false (same pattern as SHOW_OPENROUTER in ModelSetup.tsx).
 */
export const SHOW_OTHER_ENGINES = false

export const MAIN_ENGINES: ExternalEngineId[] = ['claude-code', 'codex', 'gemini-cli']

/** Whether a screen lists this engine. `current` keeps an agent's own engine listed even when it's hidden. */
export const engineListed = (id: ExternalEngineId, current?: string): boolean =>
  SHOW_OTHER_ENGINES || MAIN_ENGINES.includes(id) || id === current
