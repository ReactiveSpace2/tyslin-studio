import { useCallback, useEffect, useRef, useState } from 'react'
import type { Agency, Agent, AuthStatus, ChannelMessage, DashboardStats, Project, Session } from '@shared/types'
import { refreshAppearance } from './appearance'
import { agencyOf, type AgencyView } from './agencies'
import { getActiveAgency, initActiveAgency, setActiveAgency, useActiveAgency } from './activeAgency'
import { refreshDefaultModel } from './defaultModel'
import { needsYou } from './task/ChannelCard'
import { AppSidebar } from './shell/AppSidebar'
import { SiteHeader } from './shell/SiteHeader'
import { SearchDialog } from './shell/SearchDialog'
import { StatusBar } from './components/StatusBar'
import { UpdateNotice } from './components/UpdateNotice'
import { LoginScreen } from './components/LoginScreen'
import { FirstRun } from './pages/FirstRun'
import { NewAgencyDialog } from './agency/NewAgencyDialog'
import { TaskPage } from './pages/TaskPage'
import { HomePage } from './pages/HomePage'
import { AgenciesPage } from './pages/AgenciesPage'
import { AgencyPage } from './pages/AgencyPage'
import { AgentEditor } from './pages/AgentEditor'
import { FilesPage } from './pages/FilesPage'
import { confirmLeave } from './files/leaveGuard'
import { ScheduledPage } from './pages/ScheduledPage'
import { SettingsPage, type SettingsTab } from './pages/SettingsPage'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

/**
 * Three places: Home (start a task, what needs you), a Task (a chat with an agency's Lead, or one worker)
 * and an Agency (its goals, team, skills, connectors, channel, memory and schedule). Everything else is a
 * dialog, a tab or a panel. The left column is the same everywhere (AppSidebar).
 */
export type AgencyTab = 'goals' | 'team' | 'skills' | 'connectors' | 'channel' | 'memory' | 'schedule' | 'budget' | `page:${string}`
export type Route =
  | { name: 'home' }
  | { name: 'task'; sessionId: string; agentId: string; /** A Lead message to scroll to. */ focus?: string }
  | { name: 'agencies' }
  | { name: 'agency'; id: string; tab: AgencyTab; /** Memory: the file to open. */ focus?: string }
  | { name: 'agent'; agencyId: string; /** null = a new worker. */ agentId: string | null }
  | { name: 'files'; agencyId?: string; dir?: string }
  | { name: 'scheduled'; focus?: string }
  | { name: 'settings'; tab?: SettingsTab }

export default function App(): JSX.Element {
  const [route, setRouteNow] = useState<Route>({ name: 'home' })
  const routeRef = useRef(route)
  routeRef.current = route
  /** Leaving Files with unsaved tabs asks first (files/leaveGuard.ts); every other move is immediate. */
  const setRoute = useCallback((r: Route): void => {
    if (routeRef.current.name !== 'files') { setRouteNow(r); return }
    void confirmLeave().then((ok) => { if (ok) setRouteNow(r) })
  }, [])
  const [agents, setAgents] = useState<Agent[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [agencyRows, setAgencyRows] = useState<Agency[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [channelMsgs, setChannelMsgs] = useState<ChannelMessage[]>([])
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  /** null = still checking. */
  const [onboarding, setOnboarding] = useState<boolean | null>(null)
  const [orgName, setOrgName] = useState('')
  const [mac, setMac] = useState(false)
  const [search, setSearch] = useState(false)
  const [newAgency, setNewAgency] = useState<{ templateId?: string } | null>(null)
  /** What the open screen puts in the window's header (a task's title menu and panel switches). */
  const [headerSlot, setHeaderSlot] = useState<JSX.Element | null>(null)
  /** Text another screen wants in Home's box ("New task with this file"). */
  const [draft, setDraft] = useState('')
  const agencyRowsRef = useRef<Agency[]>([])
  const [activeAgency] = useActiveAgency()

  useEffect(() => { void window.tyslin.app.info().then((i) => setMac(i.platform.startsWith('darwin'))) }, [])

  const refresh = useCallback(async () => {
    const [a, p, g] = await Promise.all([window.tyslin.agents.list(), window.tyslin.projects.list(), window.tyslin.agencies.list()])
    setAgents(a)
    setProjects(p)
    setAgencyRows(g)
  }, [])
  const refreshSessions = useCallback(async () => setSessions(await window.tyslin.sessions.list()), [])
  const refreshRunning = useCallback(async () => setRunningIds(new Set(await window.tyslin.sessions.running())), [])
  const refreshChannel = useCallback(() => { void window.tyslin.channels.list().then(setChannelMsgs) }, [])
  // File changes and plans waiting on you (QA, 10 Nov 2026: Home said "Nothing needs you" while a plan waited).
  const [waiting, setWaiting] = useState<Pick<DashboardStats, 'reviews' | 'plans' | 'budgetAlerts' | 'creditFailures'>>({ reviews: [], plans: [], budgetAlerts: [], creditFailures: [] })
  const refreshWaiting = useCallback(() => { void window.tyslin.app.dashboard().then((d) => setWaiting({ reviews: d.reviews, plans: d.plans, budgetAlerts: d.budgetAlerts, creditFailures: d.creditFailures })).catch(() => undefined) }, [])
  useEffect(() => {
    refreshWaiting()
    const offBoard = window.tyslin.cards.onBoardChanged(refreshWaiting)
    const offRun = window.tyslin.sessions.onEvent((e) => { if (e.type === 'approval_needed' || e.type === 'run_finished' || e.type === 'run_error') refreshWaiting() })
    const t = setInterval(refreshWaiting, 15_000)
    return () => { offBoard(); offRun(); clearInterval(t) }
  }, [refreshWaiting, orgName, route])

  useEffect(() => {
    void refresh()
    void refreshSessions()
    void refreshRunning()
    void refreshAppearance()
    void window.tyslin.auth.status().then(setAuth)
    void window.tyslin.onboarding.status().then((s) => setOnboarding(s.needed))
    void window.tyslin.orgs.list().then((o) => setOrgName(o.find((x) => x.current)?.name ?? ''))
  }, [refresh, refreshSessions, refreshRunning])
  // Scheduled tasks and card runs start chats on their own; keep the list and the running dots current.
  useEffect(() => window.tyslin.tasks.onChanged(() => void refreshSessions()), [refreshSessions])
  useEffect(() => window.tyslin.sessions.onEvent((e) => {
    if (e.type === 'run_started') { setRunningIds((s) => new Set(s).add(e.sessionId)); void refreshSessions() }
    if (e.type === 'run_finished' || e.type === 'run_error') { setRunningIds((s) => { const n = new Set(s); n.delete(e.sessionId); return n }); void refreshSessions() }
  }), [refreshSessions])
  // Questions and reviews waiting on you; a clicked desktop notification opens that agency's task at the message.
  useEffect(() => {
    refreshChannel()
    const offMsg = window.tyslin.channels.onMessage(refreshChannel)
    const offOpen = window.tyslin.channels.onOpen((id) => {
      void window.tyslin.channels.list().then((ms) => {
        setChannelMsgs(ms)
        const m = ms.find((x) => x.id === id)
        const a = agencyRowsRef.current.find((x) => x.id === m?.agencyId)
        if (!a) return
        void refreshSessions().then(() => {
          setActiveAgency(a.id)
          const lead = a.leadId
          const s = lead ? latestSession(lead) : null
          setRoute(s && lead ? { name: 'task', sessionId: s.id, agentId: lead, focus: id } : { name: 'agency', id: a.id, tab: 'team' })
        })
      })
    })
    const t = setInterval(refreshChannel, 15_000)
    return () => { offMsg(); offOpen(); clearInterval(t) }
  }, [orgName])

  const agencies = agencyRows.map((a) => agencyOf(a, projects, agents)).filter((v): v is AgencyView => !!v)
  agencyRowsRef.current = agencyRows
  const viewById = (id: string | null): AgencyView | null => agencies.find((v) => v.agency.id === id) ?? null
  const viewByProject = (projectId: string | null): AgencyView | null => agencies.find((v) => v.project.id === projectId) ?? null
  const activeView = viewById(activeAgency)
  const sessionsRef = useRef<Session[]>([])
  sessionsRef.current = sessions
  const latestSession = (agentId: string): Session | null =>
    [...sessionsRef.current].filter((s) => s.agentId === agentId).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
  // The active agency: the remembered one, else the first; follows creation and deletion.
  useEffect(() => {
    if (!agencyRows.length) { setActiveAgency(null); return }
    const ids = agencyRows.map((a) => a.id)
    if (!getActiveAgency() || !ids.includes(getActiveAgency()!)) initActiveAgency(orgName, ids)
  }, [agencyRows, orgName])

  const memberIds = (v: AgencyView): Set<string> => new Set([v.lead, ...v.workers].filter((a): a is Agent => !!a).map((a) => a.id))
  /** Reviews of this agency's chats that no channel message stands for, plus a plan waiting for approval. */
  const waitingFor = (v: AgencyView): number => {
    const ids = memberIds(v)
    const reviewed = new Set(channelMsgs.filter((m) => m.agencyId === v.agency.id && m.kind === 'review' && needsYou(m)).map((m) => m.cardId))
    const reviews = waiting.reviews.filter((r) => ids.has(r.agentId)).length
    return (reviewed.size ? Math.max(0, reviews - reviewed.size) : reviews) + (waiting.plans.some((p) => p.agencyId === v.agency.id) ? 1 : 0)
  }
  // What needs you, counted on each agency's newest Lead task (messages are per agency, not per chat).
  const needsYouBySession: Record<string, number> = {}
  for (const v of agencies) {
    if (!v.lead) continue
    const s = latestSession(v.lead.id)
    if (!s) continue
    const n = channelMsgs.filter((m) => m.agencyId === v.agency.id && needsYou(m)).length + waitingFor(v)
    if (n) needsYouBySession[s.id] = n
  }

  const runningByAgency: Record<string, number> = {}
  const needsYouByAgency: Record<string, number> = {}
  for (const v of agencies) {
    const ids = new Set([v.lead, ...v.workers].filter((a): a is Agent => !!a).map((a) => a.id))
    runningByAgency[v.agency.id] = sessions.filter((s) => runningIds.has(s.id) && ids.has(s.agentId)).length
    needsYouByAgency[v.agency.id] = channelMsgs.filter((m) => m.agencyId === v.agency.id && needsYou(m)).length + waitingFor(v)
  }
  const you = auth?.account?.name?.split(' ')[0] || 'You'
  const openAgency = (id: string, tab: AgencyTab = 'team'): void => { setActiveAgency(id); setRoute({ name: 'agency', id, tab }) }
  const openTask = (sessionId: string, agentId: string, focus?: string): void => {
    const a = agents.find((x) => x.id === agentId)
    const v = a ? viewById(a.agency) ?? viewByProject(a.projectId) : null
    if (v) setActiveAgency(v.agency.id)
    setRoute({ name: 'task', sessionId, agentId, focus })
    // Agents' models and engines can change elsewhere (Settings, the editor, a switch of the default model); the
    // task's composer and permission cards show the current ones (10 Nov 2026).
    void refresh()
  }
  /** Opens an agent's newest chat, or a fresh one. (Until the Task page replaces ChatPage.) */
  const openChat = (agentId: string, projectId: string | null, sessionId?: string): void => {
    const s = sessionId ? sessionsRef.current.find((x) => x.id === sessionId) ?? null : latestSession(agentId)
    if (s) return openTask(s.id, agentId)
    void window.tyslin.sessions.create(agentId, projectId).then((created) => { void refreshSessions(); openTask(created.id, agentId) })
  }
  const openAgencyByProject = (projectId: string, tab: AgencyTab = 'team'): void => { const v = viewByProject(projectId); if (v) openAgency(v.agency.id, tab) }
  /** A new task: a chat with the agency's Lead. The task opens first, so it is listening when the reply starts. */
  const startTask = async (agencyId: string, text: string, attachmentIds: string[], known?: { leadId: string; projectId: string }): Promise<void> => {
    // `known` comes from first-run setup, where this render's agency list doesn't hold the new agency yet
    // (QA, 10 Nov 2026: the first task was dropped with "This agency has no Lead yet").
    const v = viewById(agencyId)
    const leadId = known?.leadId ?? v?.lead?.id
    const projectId = known?.projectId ?? v?.project.id
    if (!leadId || !projectId) throw new Error('This agency has no Lead yet.')
    const s = await window.tyslin.sessions.create(leadId, projectId)
    setSessions((list) => [s, ...list])
    openTask(s.id, leadId)
    try {
      await window.tyslin.sessions.send(s.id, text, attachmentIds)
    } catch (e) {
      // Nothing was saved (no key, paused…): drop the empty chat and show the reason on Home.
      setSessions((list) => list.filter((x) => x.id !== s.id))
      setRoute({ name: 'home' })
      throw e
    } finally {
      void refreshSessions()
    }
  }

  // Ctrl/Cmd+K opens Search on every screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) { e.preventDefault(); setSearch((o) => !o) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
  // First run on this computer: organization, first agency, model, first task.
  if (onboarding) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <FirstRun firstName={auth.account?.name?.split(' ')[0]} onDone={(projectId, firstTask) => {
          setOnboarding(false)
          void Promise.all([refresh(), refreshSessions(), refreshDefaultModel()]).then(async () => {
            const g = await window.tyslin.agencies.list()
            const a = g.find((x) => x.projectId === projectId)
            if (!a) { setRoute({ name: 'home' }); return }
            setActiveAgency(a.id)
            if (firstTask && a.leadId) {
              try { await startTask(a.id, firstTask, [], { leadId: a.leadId, projectId: a.projectId }) } catch (e) {
                // Keep what they typed and the reason: Home's composer gets the text back.
                setDraft(firstTask); setRoute({ name: 'home' }); console.warn('First task not started:', e)
              }
            } else setRoute({ name: 'home' })
          })
        }} />
      </div>
    )
  }

  const screen = (): JSX.Element | null => {
    switch (route.name) {
      case 'home':
        return (
          <HomePage you={you} agencies={agencies} agents={agents} sessions={sessions} channelMessages={channelMsgs} waiting={waiting} runningIds={runningIds}
            activeAgency={activeAgency} onActiveAgency={setActiveAgency} onStartTask={startTask} onOpenTask={openTask} draft={draft} onDraftUsed={() => setDraft('')}
            onOpenAgency={(id, tab) => openAgency(id, tab)} onOpenAgent={(agencyId, agentId) => setRoute({ name: 'agent', agencyId, agentId })}
            onNewAgency={() => setNewAgency({})} onSettings={() => setRoute({ name: 'settings', tab: 'models' })} />
        )
      case 'agencies':
        return <AgenciesPage agencies={agencies} runningByAgency={runningByAgency} needsYouByAgency={needsYouByAgency} onOpen={(id) => openAgency(id)} onNew={(templateId) => setNewAgency({ templateId })} onSettings={() => setRoute({ name: 'settings', tab: 'models' })} />
      case 'agency': {
        const v = viewById(route.id)
        if (!v) return null
        return (
          <AgencyPage key={v.agency.id} view={v} agencies={agencies} agents={agents} tab={route.tab} you={you} focus={route.focus}
            onTab={(tab) => setRoute({ name: 'agency', id: v.agency.id, tab })} onPick={(id) => openAgency(id, route.tab)}
            onNewAgency={() => setNewAgency({})} onNewTask={() => { setActiveAgency(v.agency.id); setRoute({ name: 'home' }) }}
            onOpenAgent={(a) => setRoute({ name: 'agent', agencyId: v.agency.id, agentId: a.id })}
            onAddWorker={() => setRoute({ name: 'agent', agencyId: v.agency.id, agentId: null })}
            onOpenTask={(sid, aid) => { void refreshSessions().then(() => openTask(sid, aid)) }}
            onChanged={() => void refresh()}
            onDeleted={() => { void refresh(); setRoute({ name: 'agencies' }) }} />
        )
      }
      case 'task': {
        const a = agents.find((x) => x.id === route.agentId)
        if (!a) return <div className="p-8 text-sm text-muted-foreground">That task's agent is gone.</div>
        const v = viewById(a.agency) ?? viewByProject(a.projectId)
        return (
          <TaskPage key={route.sessionId} sessionId={route.sessionId} agent={a} view={v} sessions={sessions} focus={route.focus} setHeader={setHeaderSlot}
            onSessionsChanged={() => { void refreshSessions(); refreshChannel() }}
            onOpenAgency={() => { if (v) openAgency(v.agency.id) }}
            onOpenAgent={(x) => { if (v) setRoute({ name: 'agent', agencyId: v.agency.id, agentId: x.id }) }}
            onConnectors={() => { if (v) openAgency(v.agency.id, 'connectors') }}
            onFiles={() => setRoute({ name: 'files', agencyId: v?.agency.id })}
            onSettings={() => setRoute({ name: 'settings', tab: 'models' })}
            onTalkTo={(x) => openChat(x.id, v?.project.id ?? x.projectId)}
            onBackToLead={v?.lead && v.lead.id !== a.id ? () => openChat(v.lead!.id, v.project.id) : null}
            onDeleted={() => { void refreshSessions(); setRoute({ name: 'home' }) }} />
        )
      }
      case 'agent': {
        const v = viewById(route.agencyId)
        if (!v) return null
        const a = route.agentId ? agents.find((x) => x.id === route.agentId) ?? null : null
        if (route.agentId && !a) return <div className="p-8 text-sm text-muted-foreground">That agent is gone.</div>
        return (
          <AgentEditor key={route.agentId ?? 'new'} view={v} agent={a} agents={agents}
            onSaved={() => { void refresh(); openAgency(v.agency.id) }}
            onDeleted={() => { void Promise.all([refresh(), refreshSessions()]); openAgency(v.agency.id) }}
            onBack={() => openAgency(v.agency.id)}
            onMemory={() => setRoute({ name: 'agency', id: v.agency.id, tab: 'memory', focus: route.agentId ?? 'agency' })} />
        )
      }
      case 'files':
        return <FilesPage agencies={agencies} agencyId={route.agencyId ?? activeAgency} onAgency={(id) => { setActiveAgency(id); setRouteNow({ name: 'files', agencyId: id }) }} initialDir={route.dir}
          setHeader={setHeaderSlot} onOpenTask={(sid, aid) => { void refreshSessions().then(() => openTask(sid, aid)) }}
          onOpenMemory={(id) => setRoute({ name: 'agency', id, tab: 'memory', focus: 'agency' })}
          onNewTaskWith={(id, path) => { void confirmLeave().then((ok) => { if (!ok) return; setActiveAgency(id); setRouteNow({ name: 'home' }); setDraft(`Look at ${path} and `) }) }} onNewAgency={() => setNewAgency({})} />
      case 'scheduled':
        return <ScheduledPage agencies={agencies} onOpenTask={(sid, aid) => { void refreshSessions().then(() => openTask(sid, aid)) }} />
      case 'settings':
        return <SettingsPage key={route.tab ?? 'models'} initialTab={route.tab} agencies={agencies} activeAgency={activeAgency} orgName={orgName} onAuthChange={setAuth} onChanged={() => void refresh()} />
    }
  }
  const TITLE: Partial<Record<Route['name'], string>> = { home: 'Home', agencies: 'Agencies', files: 'Files', scheduled: 'Scheduled', settings: 'Settings' }
  const title = route.name === 'task' ? (sessions.find((x) => x.id === route.sessionId)?.title || 'Task')
    : route.name === 'agency' ? viewById(route.id)?.agency.name ?? 'Agency'
    : route.name === 'agent' ? agents.find((x) => x.id === route.agentId)?.name ?? 'Agent'
    : TITLE[route.name] ?? ''
  document.title = title ? `${title} · Tyslin Studio` : 'Tyslin Studio'

  return (
    <SidebarProvider className="h-screen min-h-0 overflow-hidden bg-background text-foreground">
      <AppSidebar route={route} mac={mac} agencies={agencies} agents={agents} sessions={sessions} runningIds={runningIds} needsYouBySession={needsYouBySession}
        account={auth.account} canSignOut={auth.configured && !!auth.account}
        onNavigate={(r) => { if (r.name === 'agency') setActiveAgency(r.id); setRoute(r) }}
        onSearch={() => setSearch(true)} onSettings={() => setRoute({ name: 'settings' })}
        onSignOut={() => { void window.tyslin.auth.signOut().then(setAuth) }} />
      <SidebarInset className="min-h-0 overflow-hidden">
        <SiteHeader mac={mac} title={headerSlot ?? <span className="truncate text-[15px] font-medium">{title}</span>} />
        <div className="min-h-0 flex-1 overflow-y-auto">{screen()}</div>
        <StatusBar route={route} agents={agents} sessions={sessions} onNavigate={setRoute} onOpenChat={openChat} />
      </SidebarInset>
      <div className="pointer-events-none fixed bottom-11 left-[calc(var(--sidebar-width)+1rem)] z-20 w-60 [&>*]:pointer-events-auto [&>*]:shadow-[0_4px_16px_var(--shadow)]">
        <UpdateNotice />
      </div>
      <SearchDialog open={search} onOpenChange={setSearch} agencies={agencies} agents={agents} sessions={sessions} runningIds={runningIds} needsYouBySession={needsYouBySession}
        onOpenTask={(sid, aid) => openTask(sid, aid)} onOpenAgency={(id) => openAgency(id)} onOpenAgent={(agencyId, agentId) => setRoute({ name: 'agent', agencyId, agentId })}
        onNewTask={() => setRoute({ name: 'home' })} onNewAgency={() => setNewAgency({})} onScheduled={() => setRoute({ name: 'scheduled' })} onSettings={() => setRoute({ name: 'settings' })}
        onHome={() => setRoute({ name: 'home' })} onAgencies={() => setRoute({ name: 'agencies' })} onFiles={() => setRoute({ name: 'files' })} />
      {newAgency && (
        <NewAgencyDialog templateId={newAgency.templateId} onClose={() => setNewAgency(null)}
          onCreated={(projectId) => { setNewAgency(null); void refresh().then(() => { const v = viewByProject(projectId); if (v) openAgency(v.agency.id); else setRoute({ name: 'agencies' }) }) }} />
      )}
    </SidebarProvider>
  )
}
