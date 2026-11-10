import { useEffect, useState } from 'react'

/**
 * The agency the app is "in": the one Home's composer sends to, Files browses and the Agency screen shows
 * when nothing more specific was asked. Remembered per organization on this computer.
 */
let current: string | null = null
let orgId = 'default'
const subs = new Set<() => void>()
const key = (): string => `tyslin:agency:${orgId}`

/** Picks the remembered agency when it still exists, else the first one. */
export function initActiveAgency(org: string, agencyIds: string[]): string | null {
  orgId = org || 'default'
  let saved: string | null = null
  try { saved = localStorage.getItem(key()) } catch { /* storage off */ }
  current = saved && agencyIds.includes(saved) ? saved : agencyIds[0] ?? null
  subs.forEach((f) => f())
  return current
}

export const getActiveAgency = (): string | null => current

export function setActiveAgency(id: string | null): void {
  if (id === current) return
  current = id
  try { if (id) localStorage.setItem(key(), id); else localStorage.removeItem(key()) } catch { /* not remembered */ }
  subs.forEach((f) => f())
}

export function useActiveAgency(): [string | null, (id: string | null) => void] {
  const [, tick] = useState(0)
  useEffect(() => {
    const f = (): void => tick((n) => n + 1)
    subs.add(f)
    return () => { subs.delete(f) }
  }, [])
  return [current, setActiveAgency]
}
