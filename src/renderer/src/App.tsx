import { useCallback, useEffect, useRef, useState } from 'react'
import type { Agency, Agent, AuthStatus, Project, Session } from '@shared/types'
import { TopBar } from './components/TopBar'
import { WorkspaceBar } from './components/WorkspaceBar'
import { AgencyNav } from './components/AgencyNav'
import { refreshAppearance } from './appearance'
import { StatusBar } from './components/StatusBar'
import { NewOrgModal } from './components/NewOrgModal'
import { ChatPage } from './pages/ChatPage'
import { SkillsPage } from './pages/SkillsPage'
import { IntegrationsPage } from './pages/IntegrationsPage'
import { MemoryPage } from './pages/MemoryPage'
import { SettingsPage, type SettingsTab } from './pages/SettingsPage'
import { OrgHome } from './pages/OrgHome'
import { AgenciesPage } from './pages/AgenciesPage'
import { AgencyPage } from './pages/AgencyPage'
import { LivePage } from './pages/LivePage'
import { agencyOf, type AgencyView } from './agencies'
import { AgencyChannelBar } from './components/AgencyChannelBar'
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
import { needsYou } from './components/LeadChannel'
import { cn } from '@/lib/utils'

/**
 * Screens: Home (the organization), Agencies (list, one agency, the New agency wizard), and inside an
 * agency tab its Kanban, Channel, Skills and Drive; chats and agent pages open from there. Settings.
 */
export type Route =
  | { name: 'home'; focus?: 'activity' }
  | { name: 'agencies' }
  | { name: 'agency'; id: string; tab: 'org' | 'live' | 'chat' | 'edit'; /** Inbox: the message to open. */ focus?: string }
  | { name: 'newAgency'; templateId?: string }
  | { name: 'chat'; agentId: string; projectId: string | null; sessionId?: string; /** A Lead message to scroll to. */ focus?: string }
  | { name: 'editor'; agentId: string }
  | { name: 'kanban'; open?: { projectId: string; path: string } }
  | { name: 'drive' }
  | { name: 'connectors' }
  | { name: 'skills' }
  | { name: 'integrations' }
  | { name: 'memory' }
  | { name: 'settings'; tab?: SettingsTab }

export default function App(): JSX.Element {
  const [route, setRoute] = useState<Route>({ name: 'home' })
  const [agents, setAgents] = useState<Agent[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [agencyRows, setAgencyRows] = useState<Agency[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  /** Questions and reviews waiting on you, by agency id: counts on the agency tabs and on each agency's Chat. */
  const [unreadBy, setUnreadBy] = useState<Record<string, number>>({})
  const countUnread = (): void => {
    void window.tyslin.channels.list().then((ms) => {
      const c: Record<string, number> = {}
      // What waits on you: unanswered questions and reviews (shown on the agency tab and the Chat item).
      for (const m of ms) if (needsYou(m)) c[m.agencyId] = (c[m.agencyId] ?? 0) + 1
      setUnreadBy(c)
    })
  }
  const agencyRowsRef = useRef<Agency[]>([])
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  /** null = still checking. */
  const [onboarding, setOnboarding] = useState<boolean | null>(null)
  const [orgName, setOrgName] = useState('')
  const [newOrg, setNewOrg] = useState(false)
  const [mac, setMac] = useState(false)
  useEffect(() => { void window.tyslin.app.info().then((i) => setMac(i.platform.startsWith('darwin'))) }, [])
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
    // An agent's chat is in its project; fall back to it whenever no project was given.
    const pid = projectId === null && a?.kind === 'agent' && !a.isMascot ? a.projectId : projectId
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
  // Counts follow new messages and replies; a clicked desktop notification opens that agency's Lead chat at the message.
  useEffect(() => {
    countUnread()
    const offMsg = window.tyslin.channels.onMessage(countUnread)
    const offOpen = window.tyslin.channels.onOpen((id) => {
      void window.tyslin.channels.list().then((ms) => {
        const a = agencyRowsRef.current.find((x) => x.id === ms.find((m) => m.id === id)?.agencyId)
        if (!a) return
        openAgencyTab(a.projectId)
        // The Lead's chat is the agency's conversation: open it at that message.
        setRoute(a.leadId ? { name: 'chat', agentId: a.leadId, projectId: a.projectId, focus: id } : { name: 'agency', id: a.projectId, tab: 'org' })
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
  /** A chat screen. For an agency's Lead it is the agency's one conversation: Lead messages, board, channel. */
  const renderChat = (r: { agentId: string; projectId: string | null; sessionId?: string; focus?: string }): JSX.Element => {
    const v = viewFor(r.projectId)
    const lead = v && v.lead?.id === r.agentId ? v : null
    return (
      <ChatPage
        key={r.agentId + (r.projectId ?? '')}
        agentId={r.agentId}
        projectId={r.projectId}
        sessionId={r.sessionId}
        agents={agents}
        projects={projects}
        onSwitch={(agentId, projectId) => openChat(agentId, projectId)}
        onSessionChange={(id) => setRoute((cur) => (cur.name === 'chat' && cur.sessionId !== id ? { ...cur, sessionId: id } : cur))}
        onSessionsChanged={() => void refreshSessions()}
        onSettings={() => setRoute({ name: 'settings' })}
        onOpenDrive={activeView ? () => { openAgencyTab(activeView.project.id); setRoute({ name: 'drive' }) } : undefined}
        agency={lead?.agency ?? null}
        focus={r.focus}
        onCountChange={countUnread}
        onOpenKanban={lead ? () => { openAgencyTab(lead.project.id); setRoute({ name: 'kanban' }) } : undefined}
        onChannelSetup={lead ? () => { openAgencyTab(lead.project.id); setRoute({ name: 'connectors' }) } : undefined}
        onAgencyChanged={() => void refresh()}
      />
    )
  }
  const openAgency = (id: string, tab: 'org' | 'chat' | 'edit' = 'org'): void => { openAgencyTab(id); setRoute({ name: 'agency', id, tab }) }
  /** A tab: Kanban, Drive, Channel and Skills stay on their screen for the new agency; anything else opens its overview. */
  const selectAgency = (id: string): void => {
    if (route.name === 'kanban' || route.name === 'drive' || route.name === 'connectors' || route.name === 'skills' || route.name === 'integrations' || route.name === 'memory') return openAgencyTab(id)
    openAgency(id)
  }
  const closeAgency = (id: string): void => {
    const next = closeAgencyTab(id)
    if (route.name === 'agency' && route.id === id) setRoute(next && viewFor(next) ? { name: 'agency', id: next, tab: 'org' } : { name: 'home' })
  }
  /** Which screens show the agency sidebar. */
  const agencyNavOn = !!activeAgency && (['kanban', 'drive', 'connectors', 'skills', 'integrations', 'memory'].includes(route.name) || (route.name === 'agency' && route.id === activeAgency)
    // A chat with one of this agency's agents keeps the agency sidebar.
    || (route.name === 'chat' && (route.projectId === activeAgency || agents.find((a) => a.id === route.agentId)?.projectId === activeAgency))
    // So does an agent's page.
    || (route.name === 'editor' && agents.find((a) => a.id === route.agentId)?.projectId === activeAgency))
  /** The agency page of the agent's agency (or the list). */
  const backFromAgent = (a?: Agent): void => {
    const id = a?.projectId && viewFor(a.projectId) ? a.projectId : activeAgency
    if (id) openAgency(id); else setRoute({ name: 'agencies' })
  }

  // Wait for the account and setup checks so the app never flashes before the sign-in or setup screen.
  if (!auth || onboarding === null) return <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground"><div className="drag-region h-12 flex-none border-b border-border bg-background" /></div>
  // Sign-in is required only in builds that include a Google client; self-built copies without one open straight in.
  if (auth.configured && !auth.account) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <div className="drag-region h-12 flex-none border-b border-border bg-background" />
        <LoginScreen onSignedIn={(s) => { setAuth(s); setRoute({ name: 'home' }) }} />
      </div>
    )
  }
  // First run on this computer: the agency setup wizard (organization, agency, adapter, model, skills, board, channel).
  if (onboarding) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <div className="drag-region h-12 flex-none border-b border-border bg-background" />
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
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Design A (8 Nov 2026): one top bar (logo, Home / Agencies / Settings, search, Help, profile), the organization and
          open agencies as underlined tabs under it, and inside an agency its sections beside the screen as an inset card. */}
      <TopBar
        route={route}
        agents={agents}
        projects={projects}
        agencies={agencies}
        mac={mac}
        account={auth.account}
        canSignOut={auth.configured && !!auth.account}
        onNavigate={setRoute}
        onOpenAgency={(id) => openAgency(id)}
        onOpenChat={(agentId, projectId) => { if (projectId) openAgencyTab(projectId); openChat(agentId, projectId) }}
        onNewAgency={() => setRoute({ name: 'newAgency' })}
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
      <div className={cn('flex min-h-0 flex-1', agencyNavOn && activeAgency && 'bg-panel')}>
        {agencyNavOn && activeAgency && (
          <AgencyNav agencyId={activeAgency} name={activeProject?.name ?? 'Agency'} route={route} unread={unreadByProject[activeAgency] ?? 0} leadId={activeView?.lead?.id ?? null}
            onNavigate={(r) => { if (r.name === 'agency') openAgencyTab(r.id); setRoute(r) }} />
        )}
        <main className={cn('min-w-0 flex-1 overflow-y-auto', agencyNavOn && activeAgency && 'my-2 mr-2 rounded-xl border border-border bg-background shadow-sm')}>
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
            if (route.tab === 'live') {
              return (
                <LivePage key={p.id} view={v} you={you}
                  onBoard={() => { openAgencyTab(p.id); setRoute({ name: 'kanban' }) }}
                  onInbox={() => setRoute({ name: 'agency', id: p.id, tab: 'chat' })} />
              )
            }
            if (route.tab === 'chat') {
              // Chat is the Lead's chat; an agency without a Lead has no one to talk to yet.
              if (v.lead) return renderChat({ agentId: v.lead.id, projectId: p.id, focus: route.focus })
              return (
                <div className="flex flex-col gap-2 px-10 pt-8 pb-12 text-foreground">
                  <h1 className="text-[22px] font-semibold tracking-tight">No Lead yet</h1>
                  <p className="text-sm text-muted-foreground">{p.name} has no Lead to talk to. Add one on the Overview.</p>
                </div>
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
                onLive={() => setRoute({ name: 'agency', id: p.id, tab: 'live' })}
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
          {route.name === 'chat' && renderChat(route)}
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
              inAgency={agencyNavOn}
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
          {route.name === 'memory' && (activeView
            ? <MemoryPage key={activeView.agency.id} agencyId={activeView.agency.id} agencyName={activeView.project.name} agents={agents} />
            : <div className="flex max-w-[1280px] flex-col gap-6 px-10 pt-8 pb-12"><p className="text-xs text-muted-foreground">Open an agency to see its memory.</p></div>)}
          {route.name === 'integrations' && <IntegrationsPage key={activeView?.agency.id ?? 'none'} agents={agents} templateId={activeView?.agency.templateId} team={activeView ? { name: activeView.project.name, members: activeView.lead ? [activeView.lead, ...activeView.workers] : activeView.workers } : undefined} />}
          {route.name === 'settings' && <SettingsPage key={route.tab ?? 'models'} initialTab={route.tab} onAuthChange={setAuth} />}
        </main>
      </div>
      <StatusBar route={route} agents={agents} sessions={sessions} onNavigate={setRoute} onOpenChat={openChat} />
      <div className="pointer-events-none fixed bottom-11 left-20 z-20 w-60 [&>*]:pointer-events-auto [&>*]:shadow-[0_4px_16px_var(--shadow)]">
        <UpdateNotice />
      </div>
      {addingWorker && (
        <CreateAgentModal
          agents={agents}
          projects={projects}
          agency={activeView ? { id: activeView.agency.id, projectId: activeView.project.id, leadId: activeView.lead?.id ?? null } : undefined}
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
