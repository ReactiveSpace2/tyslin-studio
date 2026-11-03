import type { EngineId } from './types'

/** Display names, shared by main and the UI. */
export const ENGINE_NAMES: Record<EngineId, string> = {
  builtin: 'Tyslin', goose: 'Goose', hermes: 'Hermes', zeroclaw: 'ZeroClaw', openclaw: 'OpenClaw', custom: 'Custom ACP agent'
}
