import { useEffect, useState } from 'react'
import type { DefaultModel } from '@shared/types'
import { PROVIDER_NAME } from '@shared/models'

/**
 * The default model, shared by the status bar, the agent pickers and Settings. Call
 * `refreshDefaultModel()` after changing keys or the default so every view follows.
 */
let current: DefaultModel | null = null
const subs = new Set<() => void>()

export async function refreshDefaultModel(): Promise<DefaultModel> {
  current = (await window.tyslin.settings.get()).defaultModel
  subs.forEach((f) => f())
  return current
}

export function getDefaultModel(): DefaultModel | null {
  return current
}

export function useDefaultModel(): DefaultModel | null {
  const [, tick] = useState(0)
  useEffect(() => {
    const f = (): void => tick((n) => n + 1)
    subs.add(f)
    if (!current) void refreshDefaultModel()
    return () => { subs.delete(f) }
  }, [])
  return current
}

export const modelLabel = (d: Pick<DefaultModel, 'provider' | 'model'>): string => `${PROVIDER_NAME[d.provider]} · ${d.model}`
