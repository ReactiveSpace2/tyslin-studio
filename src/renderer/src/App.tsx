import { useCallback, useEffect, useState } from 'react'
import type { Agent, Project } from '@shared/types'
import { Sidebar } from './components/Sidebar'
import { AgentsPage } from './pages/AgentsPage'
import { ChatPage } from './pages/ChatPage'
import { AgentEditor } from './pages/AgentEditor'
import { SkillsPage } from './pages/SkillsPage'
import { SettingsPage } from './pages/SettingsPage'
import { NewProjectModal } from './components/NewProjectModal'

export type Route =
  | { name: 'agents' }
  | { name: 'chat'; agentId: string; projectId: string | null }
  | { name: 'editor'; agentId?: string }
  | { name: 'skills' }
  | { name: 'settings' }

export default function App(): JSX.Element {
  const [route, setRoute] = useState<Route>({ name: 'agents' })
  const [agents, setAgents] = useState<Agent[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [newProject, setNewProject] = useState(false)

  const refresh = useCallback(async () => {
    const [a, p] = await Promise.all([window.tyslin.agents.list(), window.tyslin.projects.list()])
    setAgents(a)
    setProjects(p)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const builder = agents.find((a) => a.isMascot) ?? agents[0]

  return (
    <div className="app">
      <Sidebar
        route={route}
        projects={projects}
        onNavigate={setRoute}
        onOpenProject={(p) => builder && setRoute({ name: 'chat', agentId: builder.id, projectId: p.id })}
        onNewProject={() => setNewProject(true)}
      />
      <main className="main">
        {route.name === 'agents' && (
          <AgentsPage
            agents={agents}
            onChat={(a) => setRoute({ name: 'chat', agentId: a.id, projectId: null })}
            onEdit={(a) => setRoute({ name: 'editor', agentId: a.id })}
            onNew={() => setRoute({ name: 'editor' })}
          />
        )}
        {route.name === 'chat' && (
          <ChatPage
            key={route.agentId + (route.projectId ?? '')}
            agentId={route.agentId}
            projectId={route.projectId}
            agents={agents}
            projects={projects}
            onSwitch={(agentId, projectId) => setRoute({ name: 'chat', agentId, projectId })}
            onSettings={() => setRoute({ name: 'settings' })}
          />
        )}
        {route.name === 'editor' && (
          <AgentEditor
            key={route.agentId ?? 'new'}
            agentId={route.agentId}
            onDone={async (saved) => {
              await refresh()
              setRoute(saved ? { name: 'chat', agentId: saved.id, projectId: null } : { name: 'agents' })
            }}
            onCancel={() => setRoute({ name: 'agents' })}
          />
        )}
        {route.name === 'skills' && <SkillsPage agents={agents} onAgentsChanged={() => void refresh()} />}
        {route.name === 'settings' && <SettingsPage />}
      </main>
      {newProject && (
        <NewProjectModal
          onClose={() => setNewProject(false)}
          onCreated={async (p) => {
            setNewProject(false)
            await refresh()
            if (builder) setRoute({ name: 'chat', agentId: builder.id, projectId: p.id })
          }}
        />
      )}
    </div>
  )
}
