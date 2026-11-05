import { useEffect, useState } from 'react'
import type { Agent } from '@shared/types'
import { inWorkspace } from '@shared/scope'
import { useDefaultModel } from './defaultModel'

/**
 * The project picked in the title bar. Mind mapper, Automation, Canvas, Kanban, Drive and the Agents org chart
 * work in it. There is always one: the Default project until something else is picked. Remembered per
 * organization on this computer.
 */
let current: string | null = null
let defaultId: string | null = null
let orgId = ''
const subs = new Set<() => void>()
const key = (): string => `tyslin:project:${orgId}`

export async function initCurrentProject(): Promise<string> {
  const [orgs, projects, def] = await Promise.all([window.tyslin.orgs.list(), window.tyslin.projects.list(), window.tyslin.studio.defaultProject()])
  orgId = orgs.find((o) => o.current)?.id ?? 'default'
  let saved: string | null = null
  try { saved = localStorage.getItem(key()) } catch { /* storage off: use the default */ }
  defaultId = def.id
  current = saved && projects.some((p) => p.id === saved) ? saved : def.id
  subs.forEach((f) => f())
  return current
}

export function getDefaultProjectId(): string | null {
  return defaultId
}

/** After a project is deleted: back to the Default project. */
export function forgetProject(id: string): void {
  if (current === id && defaultId) setCurrentProject(defaultId)
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

/**
 * Whether an agent or assistant belongs to the selected project's workspace (shared/scope.ts).
 * Lists, pickers and pages use it so another project's agents never show up.
 */
export function useInWorkspace(): (a: Agent) => boolean {
  const [projectId] = useCurrentProject()
  const dm = useDefaultModel()
  return (a: Agent) => inWorkspace(a, projectId, defaultId, dm?.assistantId)
}

/**
 * What lists show for the selected project: its own agents and assistants only. Builder and the Studio
 * helper still work everywhere (Ask Builder, "Default model") but aren't listed, so a new project starts empty.
 */
export function useListed(): (a: Agent) => boolean {
  const [projectId] = useCurrentProject()
  const dm = useDefaultModel()
  return (a: Agent) => !a.isMascot && a.id !== dm?.assistantId && inWorkspace(a, projectId, defaultId, dm?.assistantId)
}
