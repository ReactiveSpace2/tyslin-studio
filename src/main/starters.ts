import type { Agent, StarterInfo } from '@shared/types'
import { DEFAULT_HEADS } from '@shared/heads'
import { BUILT_IN_AGENTS, BUILT_IN_ASSISTANTS } from './seedAgents'
import * as db from './db'
import { defaultModel } from './defaultModel'

/**
 * The starter agents and assistants as a library: "New agent" and "New assistant" add a copy of one to the
 * selected project. New projects start empty. Agents on an external engine keep their engine; the rest use
 * the default model.
 */
const templates = (): typeof BUILT_IN_AGENTS => [...BUILT_IN_AGENTS.filter((a) => !a.isMascot), ...BUILT_IN_ASSISTANTS]

export function listStarters(): StarterInfo[] {
  return templates().map((t) => ({
    kind: t.kind, name: t.name, description: t.description, head: DEFAULT_HEADS[t.name] ?? null,
    shape: t.shape, tone: t.tone, engine: t.engine, skills: t.skills
  }))
}

export function addStarter(name: string, projectId: string): Agent {
  const t = templates().find((x) => x.name === name)
  if (!t) throw new Error('That starter does not exist.')
  const project = db.getProject(projectId)
  if (!project) throw new Error('That project no longer exists.')
  const defaultId = db.getSetting('project:default')
  const taken = db.listAgents().some((a) => a.name === t.name && a.kind === t.kind && (a.projectId ?? (a.kind === 'assistant' ? defaultId : null)) === projectId)
  if (taken) throw new Error(`${t.name} is already in ${project.name}.`)
  const m = defaultModel()
  const external = t.engine && t.engine !== 'builtin'
  return db.saveAgent({
    ...t,
    provider: external ? t.provider : m.provider, model: external ? t.model : m.model,
    head: DEFAULT_HEADS[t.name] ?? null, projectId, leadId: null,
    writeMode: t.kind === 'agent' ? db.getPrefs().defaultWriteMode : 'ask'
  })
}
