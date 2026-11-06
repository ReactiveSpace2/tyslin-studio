import type { Agency, Agent, Project } from '@shared/types'

/** An agency with its project, Lead and workers resolved from the agents list. */
export interface AgencyView {
  agency: Agency
  project: Project
  lead: Agent | null
  workers: Agent[]
  paused: boolean
}

export function agencyOf(agency: Agency, projects: Project[], agents: Agent[]): AgencyView | null {
  const project = projects.find((p) => p.id === agency.projectId)
  if (!project) return null
  const team = agents.filter((a) => a.kind === 'agent' && !a.isMascot && (a.agency === agency.id || a.projectId === project.id))
  const lead = (agency.leadId ? team.find((a) => a.id === agency.leadId) : null) ?? team.find((a) => !a.leadId) ?? null
  return { agency, project, lead, workers: team.filter((a) => a.id !== lead?.id), paused: agency.paused }
}

export const agencyStatus = (v: AgencyView): { label: string; tone: 'on' | 'off' | 'idle' } =>
  !v.lead ? { label: 'No Lead yet', tone: 'idle' } : v.paused ? { label: 'Paused', tone: 'off' } : { label: 'Ready', tone: 'on' }
