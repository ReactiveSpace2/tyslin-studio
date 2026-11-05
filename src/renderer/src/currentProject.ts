import { useEffect, useState } from 'react'

/**
 * The project picked in the title bar. Mind mapper, Automation, Canvas, Kanban, Drive and the Agents org chart
 * work in it. There is always one: the Default project until something else is picked. Remembered per
 * organization on this computer.
 */
let current: string | null = null
let orgId = ''
const subs = new Set<() => void>()
const key = (): string => `tyslin:project:${orgId}`

export async function initCurrentProject(): Promise<string> {
  const [orgs, projects, def] = await Promise.all([window.tyslin.orgs.list(), window.tyslin.projects.list(), window.tyslin.studio.defaultProject()])
  orgId = orgs.find((o) => o.current)?.id ?? 'default'
  let saved: string | null = null
  try { saved = localStorage.getItem(key()) } catch { /* storage off: use the default */ }
  current = saved && projects.some((p) => p.id === saved) ? saved : def.id
  subs.forEach((f) => f())
  return current
}

export function getCurrentProject(): string | null {
  return current
}

export function setCurrentProject(id: string): void {
  if (!id || id === current) return
  current = id
  try { localStorage.setItem(key(), id) } catch { /* not remembered */ }
  subs.forEach((f) => f())
}

export function useCurrentProject(): [string | null, (id: string) => void] {
  const [, tick] = useState(0)
  useEffect(() => {
    const f = (): void => tick((n) => n + 1)
    subs.add(f)
    return () => { subs.delete(f) }
  }, [])
  return [current, setCurrentProject]
}
