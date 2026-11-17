// Stand-in for src/main/db.ts in tests: settings in a Map tests can read and change (globalThis.__tyslinSettings).
const g = globalThis as unknown as { __tyslinSettings?: Map<string, string> }
export const settings: Map<string, string> = (g.__tyslinSettings ??= new Map())

export const getSetting = (key: string): string | null => settings.get(key) ?? null
export const setSetting = (key: string, value: string): void => { settings.set(key, value) }

// Projects and agents for board tests (globalThis.__tyslinDb): set `projects` and `agents` before calling.
const s = (globalThis as unknown as { __tyslinDb?: { projects: { id: string; name: string; folder: string }[]; agents: unknown[] } })
export const store = (s.__tyslinDb ??= { projects: [], agents: [] })
export const getProject = (id: string): { id: string; name: string; folder: string } | null => store.projects.find((p) => p.id === id) ?? null
export const listAgents = (): unknown[] => store.agents
export const listSkills = (): { name: string }[] => []
export const listMcpServers = (): any[] => [...((globalThis as any).__tyslinMcp?.values() ?? [])]
export const mcpServersForAgent = (): unknown[] => []
// Connectors (integrations.ts saveIntegration).
const gm = globalThis as unknown as { __tyslinMcp?: Map<string, any> }
const mcp: Map<string, any> = (gm.__tyslinMcp ??= new Map())
export const getMcpServer = (id: string): any => mcp.get(id) ?? null
export const saveMcpServer = (srv: any): any => { const saved = { createdAt: Date.now(), ...mcp.get(srv.id), ...srv }; mcp.set(srv.id, saved); return saved }
export const setMcpAgents = (id: string, agentIds: string[]): any => { const srv = mcp.get(id); srv.agentIds = [...new Set(agentIds)]; return srv }

// Teams, chats and messages for card-run tests (cards.ts): set `store.agencies` before calling.
type StubSession = { id: string; agentId: string; projectId: string | null; title: string; createdAt: number }
const extra = store as unknown as { agencies?: any[]; sessions?: StubSession[]; messages?: { sessionId: string; role: string; content: string; createdAt: number }[] }
export const getAgency = (id: string): any => (extra.agencies ?? []).find((a) => a.id === id) ?? null
export const listAgencies = (): any[] => extra.agencies ?? []
export const getAgent = (id: string): any => (store.agents as any[]).find((a) => a.id === id) ?? null
export const createSession = (agentId: string, projectId: string | null): StubSession => {
  const sess = { id: `s${(extra.sessions ??= []).length + 1}`, agentId, projectId, title: 'New chat', createdAt: Date.now() }
  extra.sessions.push(sess)
  return sess
}
export const getSession = (id: string): StubSession | null => (extra.sessions ?? []).find((x) => x.id === id) ?? null
export const listSessions = (agentId?: string): StubSession[] => (extra.sessions ?? []).filter((x) => !agentId || x.agentId === agentId)
export const setSessionTitle = (id: string, title: string): void => { const x = getSession(id); if (x) x.title = title }
export const listMessages = (sessionId: string): any[] => (extra.messages ?? []).filter((m) => m.sessionId === sessionId)
export const costForRun = (): null => null
export const listChanges = (): any[] => []
export const listTasks = (): any[] => []
export const monthSpend = (): number => 0
export const getCapHold = (): null => null
export const setCapHold = (): void => {}
export const updateAgency = (): void => {}
export const listChannelMessages = (): any[] => []
export const replyChannelMessage = (): void => {}
