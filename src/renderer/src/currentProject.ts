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
/** Agencies open as tabs in the title bar, in order. Remembered per organization. */
let tabs: string[] = []
const tabsKey = (): string => `tyslin:agencyTabs:${orgId}`
const saveTabs = (): void => { try { localStorage.setItem(tabsKey(), JSON.stringify(tabs)) } catch { /* not remembered */ } }

export async function initCurrentProject(): Promise<string> {
  const [orgs, projects, def] = await Promise.all([window.tyslin.orgs.list(), window.tyslin.projects.list(), window.tyslin.studio.defaultProject()])
  orgId = orgs.find((o) => o.current)?.id ?? 'default'
  let saved: string | null = null
  try { saved = localStorage.getItem(key()) } catch { /* storage off: use the default */ }
  defaultId = def.id
  current = saved && projects.some((p) => p.id === saved) ? saved : def.id
  try { tabs = (JSON.parse(localStorage.getItem(tabsKey()) ?? '[]') as string[]).filter((id) => id !== def.id && projects.some((p) => p.id === id)) } catch { tabs = [] }
  if (current !== def.id && !tabs.includes(current)) tabs.push(current)
  subs.forEach((f) => f())
  return current
}

export function getDefaultProjectId(): string | null {
  return defaultId
}

/** After a project is deleted: its tab closes and the Default project is selected. */
export function forgetProject(id: string): void {
  if (tabs.includes(id)) { tabs = tabs.filter((t) => t !== id); saveTabs() }
  if (current === id && defaultId) setCurrentProject(defaultId)
  subs.forEach((f) => f())
}

/** Opens an agency in a tab (or switches to its tab) and makes it the current one. */
export function openAgencyTab(id: string): void {
  if (id !== defaultId && !tabs.includes(id)) { tabs = [...tabs, id]; saveTabs() }
  setCurrentProject(id)
  subs.forEach((f) => f())
}

/** Closes a tab; when it was the current one, the tab beside it (or the Default project) takes over. Returns the new current id. */
export function closeAgencyTab(id: string): string | null {
  const i = tabs.indexOf(id)
  if (i < 0) return current
  tabs = tabs.filter((t) => t !== id)
  saveTabs()
  if (current === id) setCurrentProject(tabs[Math.min(i, tabs.length - 1)] ?? defaultId ?? '')
  subs.forEach((f) => f())
  return current
}

export function useAgencyTabs(): string[] {
  useCurrentProject()
  return tabs
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
