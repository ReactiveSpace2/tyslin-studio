import type { DefaultModel, ProviderId } from '@shared/types'
import { MODEL_SUGGESTIONS, PROVIDER_ORDER } from '@shared/models'
import * as db from './db'
import { getSecret } from './secrets'

/**
 * The default model: chosen during first-run setup or in Settings → Models, kept per computer, shown in the
 * status bar. Every Lead runs on it. (The per-organization Studio assistant that used to carry it was retired
 * on 10 Nov 2026; its rows may still exist and are never listed.)
 */

const ready = (p: ProviderId): boolean => p === 'ollama' || !!getSecret(p)

export function defaultModel(): DefaultModel {
  const p = db.getPrefs()
  if (p.defaultProvider && p.defaultModel) return { provider: p.defaultProvider, model: p.defaultModel, chosen: true, ready: ready(p.defaultProvider) }
  // Nothing chosen yet: the first provider with a key, else Claude (which then asks for a key).
  const provider = PROVIDER_ORDER.find((x) => x !== 'ollama' && ready(x)) ?? 'anthropic'
  return { provider, model: MODEL_SUGGESTIONS[provider][0], chosen: false, ready: ready(provider) }
}
