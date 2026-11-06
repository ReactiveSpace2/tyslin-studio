import type { Agent, Project } from '@shared/types'

/**
 * Screens-first agencies: until the agencies table exists, each project is shown as an agency. Its Lead is
 * the top agent in the project (the one with the most reports), and every other agent there is a worker.
 */
export interface AgencyView {
  project: Project
  lead: Agent | null
  workers: Agent[]
  paused: boolean
}

export function agencyOf(project: Project, agents: Agent[]): AgencyView {
  const team = agents.filter((a) => a.kind === 'agent' && !a.isMascot && a.projectId === project.id)
  const ids = new Set(team.map((a) => a.id))
  const reports = (id: string): number => team.filter((a) => a.leadId === id).length
  const tops = team.filter((a) => !a.leadId || !ids.has(a.leadId))
  const lead = [...tops].sort((a, b) => reports(b.id) - reports(a.id))[0] ?? null
  return { project, lead, workers: team.filter((a) => a.id !== lead?.id), paused: !!lead?.paused }
}

export const agencyStatus = (v: AgencyView): { label: string; tone: 'on' | 'off' | 'idle' } =>
  !v.lead ? { label: 'No Lead yet', tone: 'idle' } : v.paused ? { label: 'Paused', tone: 'off' } : { label: 'Ready', tone: 'on' }
