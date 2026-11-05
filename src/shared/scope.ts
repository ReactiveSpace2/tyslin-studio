import type { Agent } from './types'

/**
 * Projects are workspaces: each agent and assistant belongs to one, and only shows up and runs there.
 * - An agent with no project is "not in a project yet" (the org chart's tray): it can be added to one.
 * - An assistant with no project belongs to the Default project (assistants made before projects scoped them).
 * - Builder (the mascot) and the Studio assistant (runs "Default model") help in every project.
 */
export function workspaceOf(a: Pick<Agent, 'kind' | 'projectId' | 'isMascot'>, defaultProjectId: string | null): string | null | 'all' {
  if (a.isMascot) return 'all'
  if (a.kind === 'assistant') return a.projectId ?? defaultProjectId
  return a.projectId
}

/** Whether an agent or assistant is part of the given project's workspace (helpers count everywhere). */
export function inWorkspace(a: Pick<Agent, 'id' | 'kind' | 'projectId' | 'isMascot'>, projectId: string | null, defaultProjectId: string | null, studioId?: string | null): boolean {
  if (studioId && a.id === studioId) return true
  const w = workspaceOf(a, defaultProjectId)
  return w === 'all' || (!!projectId && w === projectId)
}
