import { useCallback, useEffect, useRef, useState } from 'react'
import type { Agency, Agent, AuthStatus, Project, Session } from '@shared/types'
import { TitleBar } from './components/TitleBar'
import { refreshAppearance } from './appearance'
import { StatusBar } from './components/StatusBar'
import { NewOrgModal } from './components/NewOrgModal'
import { ChatPage } from './pages/ChatPage'
import { SkillsPage } from './pages/SkillsPage'
import { SettingsPage, type SettingsTab } from './pages/SettingsPage'
import { InboxPage } from './pages/InboxPage'
import { OrgHome } from './pages/OrgHome'
import { AgenciesPage } from './pages/AgenciesPage'
import { AgencyPage } from './pages/AgencyPage'
import { agencyOf, type AgencyView } from './agencies'
import { AgencyChannelBar } from './components/AgencyChannelBar'
import { AgencyNav } from './components/AgencyNav'
import { Toolbar } from './components/Toolbar'
import { WorkspaceBar } from './components/WorkspaceBar'
import { AgentPage } from './pages/AgentPage'
import { ConnectorsPage } from './pages/ConnectorsPage'
import { KanbanPage } from './pages/KanbanPage'
import { DrivePage } from './pages/DrivePage'
import { CreateAgentModal } from './components/CreateAgentModal'
import { LoginScreen } from './components/LoginScreen'
import { AgencyWizard } from './components/AgencyWizard'
import { DEFAULT_MODEL_AGENT } from '@shared/models'
import { getDefaultModel, refreshDefaultModel } from './defaultModel'
import { closeAgencyTab, initCurrentProject, openAgencyTab, setCurrentProject, useCurrentProject } from './currentProject'
import { UpdateNotice } from './components/UpdateNotice'

/**
 * Screens: Home (the organization), Agencies (list, one agency, the New agency wizard), and inside an
 * agency tab its Kanban, Channel, Skills and Drive; chats and agent pages open from there. Settings.
 */
export type Route =
  | { name: 'home'; focus?: 'activity' }
  | { name: 'agencies' }
  | { name: 'agency'; id: string; tab: 'org' | 'chat' | 'edit'; /** Lead chat: the message to open. */ focus?: string }
  | { name: 'newAgency'; templateId?: string }
  | { name: 'chat'; agentId: string; projectId: string | null; sessionId?: string }
  | { name: 'editor'; agentId: string }
  | { name: 'kanban'; open?: { projectId: string; path: string } }
  | { name: 'drive' }
  | { name: 'connectors' }
  | { name: 'skills' }
  | { name: 'settings'; tab?: SettingsTab }

export default function App(): JSX.Element {
  const [route, setRoute] = useState<Route>({ name: 'home' })
  const [agents, setAgents] = useState<Agent[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [agencyRows, setAgencyRows] = useState<Agency[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  /** Unread Lead messages by agency id: counts on the agency tabs and on each agency's Lead chat. */
  const [unreadBy, setUnreadBy] = useState<Record<string, number>>({})
  const countUnread = (): void => {
    void window.tyslin.channels.list().then((ms) => {
      const c: Record<string, number> = {}
      for (const m of ms) if (!m.readAt) c[m.agencyId] = (c[m.agencyId] ?? 0) + 1
      setUnreadBy(c)
    })
  }
  const agencyRowsRef = useRef<Agency[]>([])
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  /** null = still checking. */
  const [onboarding, setOnboarding] = useState<boolean | null>(null)
  const [orgName, setOrgName] = useState('')
  const [newOrg, setNewOrg] = useState(false)
  /** "Add a worker": the step-by-step agent wizard, in the active agency. */
  const [addingWorker, setAddingWorker] = useState(false)

  const refresh = useCallback(async () => {
    const [a, p, g] = await Promise.all([window.tyslin.agents.list(), window.tyslin.projects.list(), window.tyslin.agencies.list()])
    setAgents(a)
    setProjects(p)
    setAgencyRows(g)
  }, [])
  const refreshSessions = useCallback(async () => setSessions(await window.tyslin.sessions.list()), [])

  const openChat = (agentId: string, projectId: string | null, sessionId?: string): void => {
    // "Default model" chats belong to the Studio assistant.
    if (agentId === DEFAULT_MODEL_AGENT) agentId = getDefaultModel()?.assistantId ?? agentId
    void refreshSessions()
    const a = agents.find((x) => x.id === agentId)
    const pid = !sessionId && projectId === null && a?.kind === 'agent' && !a.isMascot ? a.projectId : projectId
    setRoute({ name: 'chat', agentId, projectId: pid, sessionId })
  }
  const you = auth?.account?.name?.split(' ')[0] || 'You'

  useEffect(() => {
    void refresh()
    void refreshSessions()
    void refreshAppearance()
    void window.tyslin.auth.status().then(setAuth)
    void window.tyslin.onboarding.status().then((s) => setOnboarding(s.needed))
    void window.tyslin.orgs.list().then((o) => setOrgName(o.find((x) => x.current)?.name ?? ''))
  }, [refresh, refreshSessions])
  // Scheduled tasks start chats on their own; keep the chat list current.
  useEffect(() => window.tyslin.tasks.onChanged(() => void refreshSessions()), [refreshSessions])

  // The agency in the active tab is the current project. The Default project holds files for screens
  // without an agency; it isn't an agency itself.
  const [currentProject] = useCurrentProject()
  useEffect(() => { if (auth && onboarding === false) void initCurrentProject() }, [auth, onboarding, projects.length])
  // Unread counts follow new messages, replies and reads; a clicked desktop notification opens that agency's Lead chat.
  useEffect(() => {
    countUnread()
    const offMsg = window.tyslin.channels.onMessage(countUnread)
    const offOpen = window.tyslin.channels.onOpen((id) => {
      void window.tyslin.channels.list().then((ms) => {
        const a = agencyRowsRef.current.find((x) => x.id === ms.find((m) => m.id === id)?.agencyId)
        if (a) { openAgencyTab(a.projectId); setRoute({ name: 'agency', id: a.projectId, tab: 'chat', focus: id }) }
      })
    })
    const t = setInterval(countUnread, 15_000)
    return () => { offMsg(); offOpen(); clearInterval(t) }
  }, [orgName])
  const agencies = agencyRows.map((a) => agencyOf(a, projects, agents)).filter((v): v is AgencyView => !!v)
  agencyRowsRef.current = agencyRows
  const unreadByProject: Record<string, number> = Object.fromEntries(agencyRows.map((a) => [a.projectId, unreadBy[a.id] ?? 0]))
  const viewFor = (projectId: string | null): AgencyView | null => agencies.find((v) => v.project.id === projectId) ?? null
  /** The agency in the active tab (its project is the current one). */
  const activeView = viewFor(currentProject)
  const activeAgency = activeView?.project.id ?? null
  const activeProject = activeView?.project ?? null
  const openAgency = (id: string, tab: 'org' | 'chat' | 'edit' = 'org'): void => { openAgencyTab(id); setRoute({ name: 'agency', id, tab }) }
  /** A tab: Kanban, Drive, Channel and Skills stay on their screen for the new agency; anything else opens its overview. */
  const selectAgency = (id: string): void => {
    if (route.name === 'kanban' || route.name === 'drive' || route.name === 'connectors' || route.name === 'skills') return openAgencyTab(id)
    openAgency(id)
  }
  const closeAgency = (id: string): void => {
    const next = closeAgencyTab(id)
    if (route.name === 'agency' && route.id === id) setRoute(next && viewFor(next) ? { name: 'agency', id: next, tab: 'org' } : { name: 'home' })
  }
  /** Which screens show the agency sidebar. */
  const agencyNavOn = !!activeAgency && (['kanban', 'drive', 'connectors', 'skills'].includes(route.name) || (route.name === 'agency' && route.id === activeAgency))
  /** The agency page of the agent's agency (or the list). */
  const backFromAgent = (a?: Agent): void => {
    const id = a?.projectId && viewFor(a.projectId) ? a.projectId : activeAgency
    if (id) openAgency(id); else setRoute({ name: 'agencies' })
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
  // First run on this computer: the agency setup wizard (organization, agency, adapter, model, skills, board, channel).
  if (onboarding) {
    return (
      <div className="app">
        <div className="titlebar" />
        <AgencyWizard firstRun firstName={auth.account?.name?.split(' ')[0]} onDone={(projectId) => {
          setOnboarding(false)
          // The tab store loads once setup is done; open the new agency's tab after it, not before.
          void Promise.all([refresh(), initCurrentProject()]).then(() => { if (projectId) openAgency(projectId); else setRoute({ name: 'home' }) })
          void refreshDefaultModel()
        }} />
      </div>
    )
  }

  return (
    <div className="app">
      <TitleBar route={route} agents={agents} projects={projects} onHome={() => setRoute({ name: 'home' })} />
      <Toolbar
        route={route}
        onNavigate={setRoute}
        account={auth.account}
        canSignOut={auth.configured && !!auth.account}
        onProfile={() => setRoute({ name: 'settings', tab: 'account' })}
        onSignOut={() => { void window.tyslin.auth.signOut().then(setAuth) }}
      />
      <WorkspaceBar
        projects={agencies.map((v) => v.project)}
        unread={unreadByProject}
        onNewOrg={() => setNewOrg(true)}
        onNavigate={(r) => { if (r.name === 'agency') openAgencyTab(r.id); setRoute(r) }}
        onSelectAgency={selectAgency}
        onCloseAgency={closeAgency}
        onNewAgency={() => setRoute({ name: 'newAgency' })}
      />
      <div className="app-body">
        {agencyNavOn && activeAgency && (
          <AgencyNav agencyId={activeAgency} name={activeProject?.name ?? 'Agency'} route={route} unread={unreadByProject[activeAgency] ?? 0}
            onNavigate={(r) => { if (r.name === 'agency') openAgencyTab(r.id); setRoute(r) }} />
        )}
        <main className="main">
          {route.name === 'home' && (
            <OrgHome
              you={you}
              orgName={orgName}
              agencies={agencies}
              agents={agents}
              projects={projects}
              sessions={sessions}
              focus={route.focus}
              onOpenAgency={(id) => openAgency(id)}
              onAllAgencies={() => setRoute({ name: 'agencies' })}
              onNewAgency={(templateId) => setRoute({ name: 'newAgency', templateId })}
              onOpenChat={openChat}
            />
          )}
          {route.name === 'agencies' && (
            <AgenciesPage
              agencies={agencies}
              onOpen={(id) => openAgency(id)}
              onBoard={(id) => { openAgencyTab(id); setRoute({ name: 'kanban' }) }}
              onEdit={(id) => openAgency(id, 'edit')}
              onNew={() => setRoute({ name: 'newAgency' })}
            />
          )}
          {route.name === 'agency' && (() => {
            const v = viewFor(route.id)
            if (!v) return null
            const p = v.project
            if (route.tab === 'chat') {
              return (
                <InboxPage
                  key={p.id}
                  agency={v.agency}
                  agencies={agencyRows}
                  agents={agents}
                  focusId={route.focus}
                  onOpenBoard={(id) => { openAgencyTab(id); setRoute({ name: 'kanban' }) }}
                  onOpenChannel={(id) => { openAgencyTab(id); setRoute({ name: 'connectors' }) }}
                  onCountChange={countUnread}
                />
              )
            }
            return (
              <AgencyPage
                key={p.id + route.tab + v.agency.updatedAt}
                view={v}
                tab={route.tab}
                you={you}
                onTab={(tab) => setRoute({ name: 'agency', id: p.id, tab })}
                onBoard={() => { openAgencyTab(p.id); setRoute({ name: 'kanban' }) }}
                onRun={(lead) => { void window.tyslin.agencies.plan(v.agency.id).then((sid) => openChat(lead.id, p.id, sid)).catch((err) => window.alert(err instanceof Error ? err.message.replace(/^.*Error: /, '') : String(err))) }}
                onOpenAgent={(a) => setRoute({ name: 'editor', agentId: a.id })}
                onAddWorker={() => { openAgencyTab(p.id); setAddingWorker(true) }}
                onDrive={() => { openAgencyTab(p.id); setRoute({ name: 'drive' }) }}
                onBack={() => setRoute({ name: 'agencies' })}
                onChanged={() => void refresh()}
                onDeleted={() => { closeAgencyTab(p.id); void refresh(); setRoute({ name: 'agencies' }) }}
              />
            )
          })()}
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
            <AgentPage
              key={route.agentId}
              agentId={route.agentId}
              agents={agents}
              projects={projects}
              sessions={sessions}
              onBack={() => backFromAgent(agents.find((a) => a.id === route.agentId))}
              onChat={(a) => openChat(a.id, null, sessions.find((s) => s.agentId === a.id)?.id)}
              onTask={(a) => backFromAgent(a)}
              onOpenChat={openChat}
              onOrgChart={() => backFromAgent(agents.find((a) => a.id === route.agentId))}
              onConnectors={() => setRoute({ name: 'connectors' })}
              onChanged={() => void refresh()}
              onDeleted={() => { void Promise.all([refresh(), refreshSessions()]); setRoute(activeAgency ? { name: 'agency', id: activeAgency, tab: 'org' } : { name: 'agencies' }) }}
            />
          )}
          {route.name === 'kanban' && <KanbanPage key={`${currentProject}:${activeProject?.name ?? ''}:${route.open?.path ?? activeView?.agency.boardPath ?? 'kanban'}`} agents={agents} projects={projects} onOpenChat={openChat}
            initial={route.open ?? (activeView ? { projectId: activeView.project.id, path: activeView.agency.boardPath } : undefined)} agencyId={activeView?.agency.id} leadName={activeView?.lead?.name} />}
          {route.name === 'drive' && <DrivePage projects={projects} onOpenIn={(_screen, projectId, path) => { openAgencyTab(projectId); setRoute({ name: 'kanban', open: { projectId, path } }) }} />}
          {route.name === 'connectors' && (
            <ConnectorsPage
              header={activeView ? <AgencyChannelBar agency={activeView.agency} lead={activeView.lead} onChanged={() => void refresh()} /> : undefined}
              agents={agents} onOpenAgent={(a) => setRoute({ name: 'editor', agentId: a.id })} onChanged={() => void refresh()} />
          )}
          {route.name === 'skills' && <SkillsPage key={activeView?.agency.id ?? 'none'} agents={agents} team={activeView?.lead ? { name: activeView.project.name, members: [activeView.lead, ...activeView.workers] } : activeView ? { name: activeView.project.name, members: activeView.workers } : undefined} onAgentsChanged={() => void refresh()} />}
          {route.name === 'settings' && <SettingsPage key={route.tab ?? 'models'} initialTab={route.tab} onAuthChange={setAuth} />}
        </main>
      </div>
      <StatusBar route={route} agents={agents} sessions={sessions} onNavigate={setRoute} onOpenChat={openChat} />
      <div className="update-float">
        <UpdateNotice />
      </div>
      {addingWorker && (
        <CreateAgentModal
          agents={agents}
          projects={projects}
          onClose={() => setAddingWorker(false)}
          onCreated={() => void refresh()}
          onChat={(a) => { setAddingWorker(false); openChat(a.id, null) }}
          onTask={(a) => { setAddingWorker(false); backFromAgent(a) }}
          onOpen={(a) => { setAddingWorker(false); setRoute({ name: 'editor', agentId: a.id }) }}
          onAskBuilder={() => { setAddingWorker(false); const b = agents.find((x) => x.isMascot); if (b) openChat(b.id, null) }}
        />
      )}
      {route.name === 'newAgency' && (
        <AgencyWizard
          firstRun={false}
          first={agencies.length === 0}
          templateId={route.templateId}
          firstName={you !== 'You' ? you : undefined}
          onCancel={() => setRoute({ name: 'agencies' })}
          onDone={(projectId) => { void refresh().then(() => { if (projectId) openAgency(projectId); else setRoute({ name: 'agencies' }) }) }}
        />
      )}
      {newOrg && <NewOrgModal onClose={() => setNewOrg(false)} />}
    </div>
  )
}
