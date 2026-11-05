import { useEffect, useState } from 'react'
import type { AppInfo, EngineStatus, ProviderSettings } from '@shared/types'
import logo from '../assets/logo-horizontal.png'
import mark from '../assets/logo-mark.png'
import wordmarkWhite from '../assets/wordmark-white.png'
import mascot from '../assets/mascot-standing.png'
import { Icon } from '../components/Icon'
import { Mark, MARKS, type MarkKey } from '../components/RunsOnBadge'

export type StudioArea = 'agents' | 'assistants' | 'projects' | 'skills'
  | 'art' | 'videos' | 'workflows' | 'canvas' | 'mindmap' | 'drive' | 'knowledge' | 'connectors'

interface Props {
  agentCount: number
  assistantCount: number
  projectCount: number
  onOpen: (area: StudioArea) => void
  onNewAgent: () => void
  onSettings: (tab: 'models' | 'engines') => void
}

type IconName = Parameters<typeof Icon>[0]['name']

/** Areas that work today, then the ones still to come (same order as the sidebar). */
const READY_AREAS: [StudioArea, IconName, string, string][] = [
  ['agents', 'agents', 'Agents', 'Do work in your project folders with tools'],
  ['assistants', 'chat', 'Assistants', 'A prompt and a model for quick chats'],
  ['projects', 'folder', 'Projects', 'Folders on disk your agents work in'],
  ['skills', 'skills', 'Skills', 'Reusable instructions for any agent']
]
const SOON_AREAS: [StudioArea, IconName, string, string][] = [
  ['art', 'art', 'Art', 'Make images with your agents'],
  ['videos', 'video', 'Videos', 'Make and edit short videos'],
  ['workflows', 'workflow', 'Workflows', 'Chain agents into steps'],
  ['canvas', 'canvas', 'Canvas', 'Draft and edit side by side'],
  ['mindmap', 'mindmap', 'Mind mapper', 'Turn topics into mind maps'],
  ['drive', 'drive', 'Drive', 'Files and storage in one place'],
  ['knowledge', 'knowledge', 'Knowledge base', 'Your material, searchable'],
  ['connectors', 'connectors', 'Connectors', 'Email, calendars, docs and more']
]

function AreaTile({ icon, name, description, status, ready, onOpen }: {
  icon: IconName; name: string; description: string; status: string; ready: boolean; onOpen: () => void
}): JSX.Element {
  return (
    <button type="button" className="support-tile" onClick={onOpen} aria-label={`${name}: ${status}`}>
      <span className="area-icon" aria-hidden="true"><Icon name={icon} size={20} /></span>
      <span className="support-text">
        <strong>{name}</strong>
        <span>{description}</span>
      </span>
      <span className={'badge' + (ready ? ' green' : '')}>{status}</span>
    </button>
  )
}

const MODEL_INFO: [MarkKey, string][] = [
  ['anthropic', 'Claude models by Anthropic'],
  ['openai', 'GPT models by OpenAI'],
  ['gemini', 'Gemini models by Google'],
  ['ollama', 'Open models on this computer']
]

interface Tile {
  id: MarkKey
  description: string
  ready: boolean
  status: string
}

function SupportTile({ tile, onOpen }: { tile: Tile; onOpen: () => void }): JSX.Element {
  return (
    <button type="button" className="support-tile" onClick={onOpen} aria-label={`${MARKS[tile.id].label}: ${tile.status}`}>
      <Mark id={tile.id} size={40} />
      <span className="support-text">
        <strong>{MARKS[tile.id].label}</strong>
        <span>{tile.description}</span>
      </span>
      <span className={'badge' + (tile.ready ? ' green' : '')}>{tile.status}</span>
    </button>
  )
}

export function HomePage({ agentCount, assistantCount, projectCount, onOpen, onNewAgent, onSettings }: Props): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [keys, setKeys] = useState<ProviderSettings | null>(null)
  const [engines, setEngines] = useState<EngineStatus[]>([])
  const [skillCount, setSkillCount] = useState(0)

  useEffect(() => {
    void window.tyslin.app.info().then(setInfo)
    void window.tyslin.settings.get().then(setKeys)
    void window.tyslin.engines.list().then(setEngines)
    void window.tyslin.skills.list().then((s) => setSkillCount(s.length))
  }, [])

  const keySet: Record<string, boolean | undefined> = {
    anthropic: keys?.anthropicKeySet, openai: keys?.openaiKeySet, gemini: keys?.geminiKeySet
  }
  const models: Tile[] = MODEL_INFO.map(([id, description]) => {
    if (id === 'ollama') return { id, description, ready: true, status: 'Local' }
    const ready = !!keySet[id]
    return { id, description, ready, status: ready ? 'Ready' : 'Add key' }
  })
  const counts: Record<string, number> = { agents: agentCount, assistants: assistantCount, projects: projectCount, skills: skillCount }
  const external: Tile[] = engines.map((e) => ({
    id: e.id,
    description: e.description,
    ready: !!e.resolvedPath,
    status: e.resolvedPath ? 'Installed' : e.id === 'custom' && !e.command ? 'Not set up' : 'Not installed'
  }))

  return (
    <div className="page home">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-intro">
          <img src={logo} alt="Tyslin" className="home-logo light-only" />
          <span className="home-logo-dark dark-only">
            <img src={mark} alt="Tyslin" />
            <img src={wordmarkWhite} alt="" />
          </span>
          <div className="row" style={{ gap: 8 }}>
            <span className="badge green mono">v{info?.version ?? '…'}</span>
            <span className="badge mono">Beta</span>
          </div>
          <h1 id="home-title">Tyslin Studio</h1>
          <p className="home-tagline">Every agent you run. One studio.</p>
          <p className="lead">
            Agents do the work in your project folders: give each one a job, instructions and skills, run it on the model you
            choose or on an agent you already use, and review every change before it touches your files. Assistants are there
            for quick chats, from writing to translating.
          </p>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => onOpen('agents')}>
              <Icon name="agents" /> {agentCount ? `Open your ${agentCount} agents` : 'Open agents'}
            </button>
            <button type="button" className="btn" onClick={() => onOpen('assistants')}><Icon name="chat" size={14} /> Open assistants</button>
            <button type="button" className="btn" onClick={onNewAgent}><Icon name="plus" size={12} /> Build an agent</button>
          </div>
        </div>
        <img src={mascot} alt="The Tyslin robot mascot standing" className="home-mascot" />
      </section>

      <section className="home-section" aria-labelledby="studio-h">
        <div className="home-section-head">
          <h2 id="studio-h">Your studio</h2>
          <p className="hint">Everything in the sidebar, in one place.</p>
        </div>
        <div className="support-grid">
          {READY_AREAS.map(([id, icon, name, description]) => (
            <AreaTile key={id} icon={icon} name={name} description={description} ready
              status={id === 'projects' && !counts[id] ? 'Add one' : String(counts[id] ?? 0)} onOpen={() => onOpen(id)} />
          ))}
        </div>
        <div className="home-section-head" style={{ marginTop: 6 }}>
          <h3 id="soon-h" className="section-label" style={{ padding: 0, margin: 0 }}>Coming soon</h3>
        </div>
        <div className="support-grid" aria-labelledby="soon-h">
          {SOON_AREAS.map(([id, icon, name, description]) => (
            <AreaTile key={id} icon={icon} name={name} description={description} ready={false} status="Soon" onOpen={() => onOpen(id)} />
          ))}
        </div>
      </section>

      <section className="home-section" aria-labelledby="models-h">
        <div className="home-section-head">
          <h2 id="models-h">Models</h2>
          <p className="hint">Agents and assistants call these directly with your own key.</p>
        </div>
        <div className="support-grid">
          {models.map((t) => <SupportTile key={t.id} tile={t} onOpen={() => onSettings('models')} />)}
        </div>
      </section>

      <section className="home-section" aria-labelledby="engines-h">
        <div className="home-section-head">
          <h2 id="engines-h">Agent engines</h2>
          <p className="hint">Run any of your agents on one of these instead. Tyslin starts them over the Agent Client Protocol.</p>
        </div>
        <div className="support-grid">
          {external.map((t) => <SupportTile key={t.id} tile={t} onOpen={() => onSettings('engines')} />)}
        </div>
      </section>
    </div>
  )
}
