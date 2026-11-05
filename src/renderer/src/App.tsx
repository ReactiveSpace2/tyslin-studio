import { useCallback, useEffect, useState } from 'react'
import type { Agent, AgentKind, AuthStatus, Project, Session } from '@shared/types'
import { Sidebar } from './components/Sidebar'
import { TitleBar } from './components/TitleBar'
import { NewOrgModal } from './components/NewOrgModal'
import { AgentsPage } from './pages/AgentsPage'
import { ChatPage } from './pages/ChatPage'
import { AgentEditor } from './pages/AgentEditor'
import { SkillsPage } from './pages/SkillsPage'
import { SettingsPage, type SettingsTab } from './pages/SettingsPage'
import { HomePage, type StudioArea } from './pages/HomePage'
import { DashboardPage } from './pages/DashboardPage'
import { NewProjectModal } from './components/NewProjectModal'
import { LoginScreen } from './components/LoginScreen'
import { UpdateNotice } from './components/UpdateNotice'
import { ComingSoon } from './pages/ComingSoon'

export type Route =
  | { name: 'home' }
  | { name: 'dashboard' }
  | { name: 'agents'; kind: AgentKind }
  | { name: 'chat'; agentId: string; projectId: string | null; sessionId?: string }
  | { name: 'editor'; kind: AgentKind; agentId?: string }
  | { name: 'skills' }
  | { name: 'art' }
  | { name: 'videos' }
  | { name: 'workflows' }
  | { name: 'canvas' }
  | { name: 'mindmap' }
  | { name: 'drive' }
  | { name: 'knowledge' }
  | { name: 'connectors' }
  | { name: 'settings'; tab?: SettingsTab }

export default function App(): JSX.Element {
  const [route, setRoute] = useState<Route>({ name: 'home' })
  const [agents, setAgents] = useState<Agent[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [newProject, setNewProject] = useState(false)
  const [auth, setAuth] = useState<AuthStatus | null>(null)

  const refresh = useCallback(async () => {
    const [a, p] = await Promise.all([window.tyslin.agents.list(), window.tyslin.projects.list()])
    setAgents(a)
    setProjects(p)
  }, [])

  const refreshSessions = useCallback(async () => setSessions(await window.tyslin.sessions.list()), [])
  const openChat = (agentId: string, projectId: string | null, sessionId?: string): void =>
    setRoute({ name: 'chat', agentId, projectId, sessionId })

  useEffect(() => {
    void refresh()
    void refreshSessions()
    void window.tyslin.auth.status().then(setAuth)
  }, [refresh, refreshSessions])

  const builder = agents.find((a) => a.isMascot) ?? agents[0]
  const [newOrg, setNewOrg] = useState(false)

  /** Home's area tiles go where the matching sidebar button goes. */
  const openArea = (area: StudioArea): void => {
    if (area === 'agents') return setRoute({ name: 'agents', kind: 'agent' })
    if (area === 'assistants') return setRoute({ name: 'agents', kind: 'assistant' })
    if (area === 'projects') {
      const last = sessions.find((s) => s.projectId && projects.some((p) => p.id === s.projectId))
      if (last) return openChat(last.agentId, last.projectId, last.id)
      if (projects[0] && builder) return openChat(builder.id, projects[0].id)
      return setNewProject(true)
    }
    setRoute({ name: area } as Route)
  }

  // Wait for the account check so the app never flashes before the sign-in screen.
  if (!auth) return <div className="app"><div className="titlebar" /></div>
  // Sign-in is required only in builds that include a Google client; self-built copies without one open straight in.
  if (auth.configured && !auth.account) {
    return (
      <div className="app">
        <div className="titlebar" />
        <LoginScreen onSignedIn={(s) => { setAuth(s); setRoute({ name: 'home' }) }} />
      </div>
    )
  }

  return (
    <div className="app">
      <TitleBar
        route={route}
        agents={agents}
        projects={projects}
        onNewOrg={() => setNewOrg(true)}
      />
      <div className="app-body">
      <Sidebar
        route={route}
        agents={agents}
        projects={projects}
        sessions={sessions}
        onNavigate={setRoute}
        onOpenChat={openChat}
        onNewProject={() => setNewProject(true)}
      />
      <main className="main">
        {route.name === 'home' && (
          <HomePage
            agentCount={agents.filter((a) => a.kind === 'agent').length}
            assistantCount={agents.filter((a) => a.kind === 'assistant').length}
            projectCount={projects.length}
            onOpen={openArea}
            onNewAgent={() => setRoute({ name: 'editor', kind: 'agent' })}
            onSettings={(tab) => setRoute({ name: 'settings', tab })}
          />
        )}
        {route.name === 'agents' && (
          <AgentsPage
            key={route.kind}
            kind={route.kind}
            agents={agents.filter((a) => a.kind === route.kind)}
            onChat={(a) => openChat(a.id, null, sessions.find((s) => s.agentId === a.id && !s.projectId)?.id)}
            onEdit={(a) => setRoute({ name: 'editor', kind: a.kind, agentId: a.id })}
            onNew={() => setRoute({ name: 'editor', kind: route.kind })}
          />
        )}
        {route.name === 'chat' && (
          <ChatPage
            key={route.agentId + (route.projectId ?? '')}
            agentId={route.agentId}
            projectId={route.projectId}
            sessionId={route.sessionId}
            agents={agents}
            projects={projects}
            onSwitch={(agentId, projectId) => openChat(agentId, projectId)}
            onSessionChange={(id) => setRoute((r) => (r.name === 'chat' && r.sessionId !== id ? { ...r, sessionId: id } : r))}
            onSessionsChanged={() => void refreshSessions()}
            onSettings={() => setRoute({ name: 'settings' })}
          />
        )}
        {route.name === 'editor' && (
          <AgentEditor
            key={route.agentId ?? 'new-' + route.kind}
            kind={route.kind}
            agentId={route.agentId}
            onDone={async (saved) => {
              await Promise.all([refresh(), refreshSessions()])
              setRoute(saved ? { name: 'chat', agentId: saved.id, projectId: null } : { name: 'agents', kind: route.kind })
            }}
            onCancel={() => setRoute({ name: 'agents', kind: route.kind })}
          />
        )}
        {route.name === 'dashboard' && (
          <DashboardPage agents={agents} projects={projects} sessions={sessions} onOpenChat={openChat} />
        )}
        {route.name === 'art' && (
          <ComingSoon title="Art" icon="art" text="Make images with your agents: pick a model that draws, describe what you need, and keep the results with your projects." />
        )}
        {route.name === 'videos' && (
          <ComingSoon title="Videos" icon="video" text="Make and edit short videos with your agents: describe the clip, pick a model that makes video, and keep the results with your projects." />
        )}
        {route.name === 'workflows' && (
          <ComingSoon title="Workflows" icon="workflow" text="Chain agents into steps that hand work to each other, then run the whole flow by hand, on a schedule or when something changes." />
        )}
        {route.name === 'canvas' && (
          <ComingSoon title="Canvas" icon="canvas" text="A shared page where you and your agents draft, rearrange and edit documents, notes and code side by side." />
        )}
        {route.name === 'mindmap' && (
          <ComingSoon title="Mind mapper" icon="mindmap" text="Turn a topic, a chat or a document into a mind map you can expand, edit and hand to an agent." />
        )}
        {route.name === 'drive' && (
          <ComingSoon title="Drive" icon="drive" text="Keep the files your agents use and make in one place: upload documents, connect storage you already have, and share files between agents and projects." />
        )}
        {route.name === 'knowledge' && (
          <ComingSoon title="Knowledge base" icon="knowledge" text="Collect documents, notes and links your agents and assistants can search, so their answers come from your own material." />
        )}
        {route.name === 'connectors' && (
          <ComingSoon title="Connectors" icon="connectors" text="Connect your agents to the apps you already use, such as email, calendars and docs, so they can read and act on real work." />
        )}
        {route.name === 'skills' && <SkillsPage agents={agents} onAgentsChanged={() => void refresh()} />}
        {route.name === 'settings' && <SettingsPage key={route.tab ?? 'models'} initialTab={route.tab} onAuthChange={setAuth} />}
      </main>
      </div>
      <div className="update-float">
        <UpdateNotice />
      </div>
      {newOrg && <NewOrgModal onClose={() => setNewOrg(false)} />}
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
