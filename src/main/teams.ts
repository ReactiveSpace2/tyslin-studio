import { mkdirSync } from 'fs'
import { join } from 'path'
import type { Agent, TeamCreateInput, TeamCreateResult, TeamsStatus } from '@shared/types'
import { TEAM_TEMPLATES, teamById } from '@shared/teams'
import { nextRunAfter } from '@shared/schedule'
import * as db from './db'
import { createProjectFolder, defaultProject } from './studio'
import { defaultModel } from './defaultModel'

/**
 * Department teams (shared/teams.ts): one call creates the lead and members as ordinary agents in one
 * project, wired lead → members, with the team's working folders and a scheduled task for the lead.
 * There is only one Engineering team per organization; it lives in the Default project under Atlas.
 */

const STARTER_HEAD_FALLBACK = 'smile'

export function teamsStatus(): TeamsStatus {
  const projects = db.listProjects()
  const inUse = db.teamsInUse()
  return {
    teams: TEAM_TEMPLATES.map((t) => {
      const uses = inUse.filter((u) => u.team === t.id)
      return { id: t.id, projects: uses.map((u) => projects.find((p) => p.id === u.projectId)?.name ?? 'No project') }
    })
  }
}

export function createTeam(input: TeamCreateInput): TeamCreateResult {
  const t = teamById(input.templateId)
  if (!t) throw new Error('That team template does not exist.')
  if (t.id === 'engineering' && db.teamsInUse().some((u) => u.team === 'engineering')) {
    throw new Error('There is already an Engineering team. Open it from the Agents page.')
  }
  const project = input.projectId ? db.getProject(input.projectId) : createProjectFolder(input.newProjectName?.trim() || t.name)
  if (!project) throw new Error('That project no longer exists.')
  if (!project.folder) throw new Error(`${project.name} has no folder, so the team could not work in it. Pick a project with a folder.`)

  const m = defaultModel()
  const writeMode = input.askBeforeWrite === false ? 'direct' : 'ask'
  // In the Default project the lead reports to Atlas when Atlas works there.
  const atlas = db.listAgents().find((a) => a.name === 'Atlas' && a.projectId === project.id && a.kind === 'agent')
  const created: Agent[] = []
  let lead: Agent | null = null
  for (const mem of [...t.members].sort((a, b) => Number(!!b.lead) - Number(!!a.lead))) {
    const a = db.saveAgent({
      kind: 'agent', name: mem.name, description: mem.description, instructions: mem.instructions,
      shape: 'round', tone: 'lime', head: mem.head || STARTER_HEAD_FALLBACK,
      provider: m.provider, model: m.model, skills: mem.skills, schedule: 'manual', engine: 'builtin', writeMode, isMascot: false,
      projectId: project.id, leadId: mem.lead ? atlas?.id ?? null : lead?.id ?? null,
      tools: { read: true, write: mem.write }, channels: { telegram: !!(mem.lead && input.telegramLead) }
    })
    db.setAgentTeam(a.id, t.id)
    if (mem.lead) lead = a
    created.push(a)
  }
  for (const f of t.folders) { try { mkdirSync(join(project.folder, f), { recursive: true }) } catch { /* not fatal */ } }
  let taskId: string | undefined
  if (lead) {
    const enabled = input.onTheirOwn !== false
    taskId = db.saveTask({ name: `${t.task.name}`, prompt: t.task.prompt, agentId: lead.id, projectId: project.id, schedule: t.task.schedule, enabled },
      enabled ? nextRunAfter(t.task.schedule, Date.now()) : null).id
  }
  return { projectId: project.id, projectName: project.name, agentIds: created.map((a) => a.id), leadId: lead?.id ?? null, taskId }
}

/**
 * Fresh installs and new organizations: once setup is done, the Default project gets Atlas (moved in from
 * "No project yet") and the Engineering team under it. Runs once per organization.
 */
export function ensureDefaultTeam(): boolean {
  if (db.getSetting('seed:defaultTeam') !== 'pending' || db.getSetting('onboarded') !== '1') return false
  db.setSetting('seed:defaultTeam', 'done')
  try {
    const project = defaultProject()
    const atlas = db.listAgents().find((a) => a.name === 'Atlas' && a.kind === 'agent')
    if (atlas && !atlas.projectId) db.saveAgent({ ...atlas, projectId: project.id, leadId: null })
    if (!db.teamsInUse().some((u) => u.team === 'engineering')) createTeam({ templateId: 'engineering', projectId: project.id, onTheirOwn: true, askBeforeWrite: true })
    return true
  } catch (e) {
    db.setSetting('seed:defaultTeam', `failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300))
    return false
  }
}
