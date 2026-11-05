import { useCallback, useEffect, useState } from 'react'
import type { Agent, AgentKind, AuthStatus, Project, Session } from '@shared/types'
import { Sidebar } from './components/Sidebar'
import { TitleBar } from './components/TitleBar'
import { refreshAppearance } from './appearance'
import { StatusBar } from './components/StatusBar'
import { NewOrgModal } from './components/NewOrgModal'
import { AgentsPage } from './pages/AgentsPage'
import { ChatPage } from './pages/ChatPage'
import { AgentEditor } from './pages/AgentEditor'
import { SkillsPage } from './pages/SkillsPage'
import { SettingsPage, type SettingsTab } from './pages/SettingsPage'
import { HomePage, type StudioArea } from './pages/HomePage'
import { DashboardPage } from './pages/DashboardPage'
import { TasksPage } from './pages/TasksPage'
import { AgentsHub } from './pages/AgentsHub'
import { AgentPage } from './pages/AgentPage'
import { ConnectorsPage } from './pages/ConnectorsPage'
import { MindMapPage } from './pages/MindMapPage'
import { WorkflowsPage } from './pages/WorkflowsPage'
import { CanvasPage } from './pages/CanvasPage'
import { DrivePage } from './pages/DrivePage'
import { CreateAgentModal } from './components/CreateAgentModal'
import { NewProjectModal } from './components/NewProjectModal'
import { LoginScreen } from './components/LoginScreen'
import { Onboarding } from './components/Onboarding'
import { DEFAULT_MODEL_AGENT } from '@shared/models'
import { getDefaultModel, refreshDefaultModel } from './defaultModel'
import { UpdateNotice } from './components/UpdateNotice'
import { ComingSoon } from './pages/ComingSoon'

export type Route =
  | { name: 'home' }
  | { name: 'dashboard' }
  | { name: 'tasks'; newFor?: string }
  | { name: 'agents'; kind: AgentKind }
  | { name: 'chat'; agentId: string; projectId: string | null; sessionId?: string; via?: 'projects' }
  | { name: 'editor'; kind: AgentKind; agentId?: string }
  | { name: 'skills' }
  | { name: 'art' }
  | { name: 'videos' }
  | { name: 'workflows'; open?: { projectId: string; path: string } }
  | { name: 'canvas'; open?: { projectId: string; path: string } }
  | { name: 'mindmap'; open?: { projectId: string; path: string } }
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
  /** null = still checking. */
  const [onboarding, setOnboarding] = useState<boolean | null>(null)

  const refresh = useCallback(async () => {
    const [a, p] = await Promise.all([window.tyslin.agents.list(), window.tyslin.projects.list()])
    setAgents(a)
    setProjects(p)
  }, [])

  const refreshSessions = useCallback(async () => setSessions(await window.tyslin.sessions.list()), [])
  /** New chats with an agent open in its project; `via` keeps the Projects panel when opened from there. */
  const openChat = (agentId: string, projectId: string | null, sessionId?: string, via?: 'projects'): void => {
    // "Default model" chats belong to the Studio assistant.
    if (agentId === DEFAULT_MODEL_AGENT) agentId = getDefaultModel()?.assistantId ?? agentId
    // Chats started elsewhere (Mind mapper, Canvas, Workflows, tasks) show up in the side panel straight away.
    void refreshSessions()
    const a = agents.find((x) => x.id === agentId)
    const pid = !sessionId && projectId === null && a?.kind === 'agent' && !a.isMascot ? a.projectId : projectId
    setRoute({ name: 'chat', agentId, projectId: pid, sessionId, via })
  }
  const [creating, setCreating] = useState(false)
  const you = auth?.account?.name?.split(' ')[0] || 'You'
  // "New agent" from anywhere (Home, the side panel) opens the step-by-step dialog over the agents list.
  useEffect(() => {
    if (route.name === 'editor' && route.kind === 'agent' && !route.agentId) {
      setCreating(true)
      setRoute({ name: 'agents', kind: 'agent' })
    }
  }, [route])

  useEffect(() => {
    void refresh()
    void refreshSessions()
    void refreshAppearance()
    void window.tyslin.auth.status().then(setAuth)
    void window.tyslin.onboarding.status().then((s) => setOnboarding(s.needed))
  }, [refresh, refreshSessions])

  // Scheduled tasks start chats on their own; keep the sidebar's chat list current.
  useEffect(() => window.tyslin.tasks.onChanged(() => void refreshSessions()), [refreshSessions])

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

  // Wait for the account and setup checks so the app never flashes before the sign-in or setup screen.
  if (!auth || onboarding === null) return <div className="app"><div className="titlebar" /></div>
  // Sign-in is required only in builds that include a Google client; self-built copies without one open straight in.
  if (auth.configured && !auth.account) {
    return (
      <div className="app">
        <div className="titlebar" />
        <LoginScreen onSignedIn={(s) => { setAuth(s); setRoute({ name: 'home' }) }} />
      </div>
    )
  }
  // First run on this computer: name the organization and Default project, add keys, pick the default model.
  if (onboarding) {
    return (
      <div className="app">
        <div className="titlebar" />
        <Onboarding firstName={auth.account?.name?.split(' ')[0]} onDone={() => {
          setOnboarding(false)
          setRoute({ name: 'home' })
          void refresh()
          void refreshDefaultModel()
        }} />
      </div>
    )
  }

  return (
    <div className="app">
      <TitleBar
        route={route}
        agents={agents}
        projects={projects}
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
        {route.name === 'agents' && route.kind === 'agent' && (
          <AgentsHub
            agents={agents}
            projects={projects}
            you={you}
            onOpen={(a) => setRoute({ name: 'editor', kind: a.kind, agentId: a.id })}
            onChat={(a) => openChat(a.id, null, sessions.find((s) => s.agentId === a.id)?.id)}
            onNew={() => setCreating(true)}
            onNewProject={() => setNewProject(true)}
            onChanged={() => void refresh()}
          />
        )}
        {route.name === 'agents' && route.kind === 'assistant' && (
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
        {route.name === 'editor' && route.kind === 'agent' && route.agentId && (
          <AgentPage
            key={route.agentId}
            agentId={route.agentId}
            agents={agents}
            projects={projects}
            sessions={sessions}
            onBack={() => setRoute({ name: 'agents', kind: 'agent' })}
            onChat={(a) => openChat(a.id, null, sessions.find((s) => s.agentId === a.id)?.id)}
            onTask={(a) => setRoute({ name: 'tasks', newFor: a.id })}
            onOpenChat={openChat}
            onOrgChart={() => { try { localStorage.setItem('agents:view', 'org') } catch { /* fine */ } setRoute({ name: 'agents', kind: 'agent' }) }}
            onConnectors={() => setRoute({ name: 'connectors' })}
            onChanged={() => void refresh()}
            onDeleted={() => { void Promise.all([refresh(), refreshSessions()]); setRoute({ name: 'agents', kind: 'agent' }) }}
          />
        )}
        {route.name === 'editor' && route.kind === 'assistant' && (
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
        {route.name === 'tasks' && <TasksPage key={route.newFor ?? 'tasks'} agents={agents} projects={projects} onOpenChat={openChat} newFor={route.newFor} />}
        {route.name === 'art' && (
          <ComingSoon title="Art" icon="art" text="Make images with your agents: pick a model that draws, describe what you need, and keep the results with your projects." />
        )}
        {route.name === 'videos' && (
          <ComingSoon title="Videos" icon="video" text="Make and edit short videos with your agents: describe the clip, pick a model that makes video, and keep the results with your projects." />
        )}
        {route.name === 'workflows' && <WorkflowsPage key={route.open?.path ?? 'workflows'} agents={agents} projects={projects} onOpenChat={openChat} initial={route.open} />}
        {route.name === 'canvas' && <CanvasPage key={route.open?.path ?? 'canvas'} agents={agents} projects={projects} onOpenChat={openChat} initial={route.open} />}
        {route.name === 'mindmap' && <MindMapPage key={route.open?.path ?? 'mindmap'} agents={agents} projects={projects} onOpenChat={openChat} initial={route.open} />}
        {route.name === 'drive' && <DrivePage projects={projects} onNewProject={() => setNewProject(true)} onOpenIn={(screen, projectId, path) => setRoute({ name: screen, open: { projectId, path } } as Route)} />}
        {route.name === 'knowledge' && (
          <ComingSoon title="Knowledge base" icon="knowledge" text="Collect documents, notes and links your agents and assistants can search, so their answers come from your own material." />
        )}
        {route.name === 'connectors' && (
          <ConnectorsPage agents={agents} onOpenAgent={(a) => setRoute({ name: 'editor', kind: a.kind, agentId: a.id })} onChanged={() => void refresh()} />
        )}
        {route.name === 'skills' && <SkillsPage agents={agents} onAgentsChanged={() => void refresh()} />}
        {route.name === 'settings' && <SettingsPage key={route.tab ?? 'models'} initialTab={route.tab} onAuthChange={setAuth} />}
      </main>
      </div>
      <StatusBar route={route} agents={agents} sessions={sessions} onNavigate={setRoute} onOpenChat={openChat} onNewOrg={() => setNewOrg(true)} />
      <div className="update-float">
        <UpdateNotice />
      </div>
      {creating && (
        <CreateAgentModal
          agents={agents}
          projects={projects}
          onClose={() => setCreating(false)}
          onCreated={() => void refresh()}
          onChat={(a) => { setCreating(false); openChat(a.id, null) }}
          onTask={(a) => { setCreating(false); setRoute({ name: 'tasks', newFor: a.id }) }}
          onOpen={(a) => { setCreating(false); setRoute({ name: 'editor', kind: 'agent', agentId: a.id }) }}
          onAskBuilder={() => { setCreating(false); const b = agents.find((x) => x.isMascot); if (b) openChat(b.id, null) }}
        />
      )}
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
