export type Shape = 'block' | 'round' | 'hex' | 'pill'
export type Tone = 'lime' | 'ink' | 'paper'
export type ProviderId = 'anthropic' | 'openai' | 'ollama'

export interface Agent {
  id: string
  name: string
  description: string
  instructions: string
  shape: Shape
  tone: Tone
  provider: ProviderId
  model: string
  skills: string[]
  schedule: string
  isMascot: boolean
  createdAt: number
  updatedAt: number
}

export type AgentInput = Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>

export interface Project {
  id: string
  name: string
  folder: string | null
  createdAt: number
}

export interface Session {
  id: string
  agentId: string
  projectId: string | null
  title: string
  createdAt: number
  updatedAt: number
}

export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

export interface Skill {
  id: string
  name: string
  description: string
  body: string
}

export interface ProviderSettings {
  anthropicKeySet: boolean
  openaiKeySet: boolean
  ollamaUrl: string
}

export interface StreamEvent {
  sessionId: string
  type: 'delta' | 'done' | 'error'
  text?: string
  error?: string
}

export interface TyslinApi {
  agents: {
    list(): Promise<Agent[]>
    get(id: string): Promise<Agent | null>
    save(input: AgentInput & { id?: string }): Promise<Agent>
    remove(id: string): Promise<void>
  }
  projects: {
    list(): Promise<Project[]>
    create(name: string, folder: string | null): Promise<Project>
    pickFolder(): Promise<string | null>
    files(projectId: string): Promise<string[]>
  }
  sessions: {
    list(agentId?: string): Promise<Session[]>
    create(agentId: string, projectId: string | null): Promise<Session>
    messages(sessionId: string): Promise<Message[]>
    send(sessionId: string, text: string): Promise<void>
    onStream(cb: (e: StreamEvent) => void): () => void
  }
  skills: {
    list(): Promise<Skill[]>
  }
  settings: {
    get(): Promise<ProviderSettings>
    setKey(provider: 'anthropic' | 'openai', key: string): Promise<void>
    setOllamaUrl(url: string): Promise<void>
  }
}
