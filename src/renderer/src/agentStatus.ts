import { useEffect, useState } from 'react'
import type { AgentStatus } from '@shared/types'

/**
 * Live agent statuses (ready, working, needs setup, last run failed, paused), shared by every
 * screen. Refreshed when a reply starts or ends, and every 20 seconds for keys and engine installs.
 */
let current = new Map<string, AgentStatus>()
const listeners = new Set<(m: Map<string, AgentStatus>) => void>()
let started = false

export function refreshStatuses(): void {
  void window.tyslin.agents.statuses().then((list) => {
    current = new Map(list.map((s) => [s.agentId, s]))
    for (const l of listeners) l(current)
  })
}

function start(): void {
  if (started) return
  started = true
  refreshStatuses()
  window.tyslin.sessions.onEvent((e) => {
    if (e.type === 'run_started' || e.type === 'run_finished' || e.type === 'run_error') refreshStatuses()
  })
  setInterval(refreshStatuses, 20_000)
}

export function useAgentStatuses(): Map<string, AgentStatus> {
  const [m, setM] = useState(current)
  useEffect(() => {
    start()
    listeners.add(setM)
    setM(current)
    return () => { listeners.delete(setM) }
  }, [])
  return m
}

export const STATUS_LABEL: Record<AgentStatus['state'], string> = {
  ready: 'Ready', working: 'Working', setup: 'Needs setup', failed: 'Last run failed', paused: 'Paused'
}
