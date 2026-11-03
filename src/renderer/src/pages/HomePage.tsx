import { useEffect, useState } from 'react'
import type { AppInfo, EngineStatus, ProviderSettings } from '@shared/types'
import logo from '../assets/logo-horizontal.png'
import mascot from '../assets/mascot-standing.png'
import { Icon } from '../components/Icon'
import { Mark, MARKS, type MarkKey } from '../components/RunsOnBadge'

interface Props {
  agentCount: number
  onAgents: () => void
  onNewAgent: () => void
  onSettings: (tab: 'models' | 'engines') => void
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

export function HomePage({ agentCount, onAgents, onNewAgent, onSettings }: Props): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [keys, setKeys] = useState<ProviderSettings | null>(null)
  const [engines, setEngines] = useState<EngineStatus[]>([])

  useEffect(() => {
    void window.tyslin.app.info().then(setInfo)
    void window.tyslin.settings.get().then(setKeys)
    void window.tyslin.engines.list().then(setEngines)
  }, [])

  const keySet: Record<string, boolean | undefined> = {
    anthropic: keys?.anthropicKeySet, openai: keys?.openaiKeySet, gemini: keys?.geminiKeySet
  }
  const models: Tile[] = MODEL_INFO.map(([id, description]) => {
    if (id === 'ollama') return { id, description, ready: true, status: 'Local' }
    const ready = !!keySet[id]
    return { id, description, ready, status: ready ? 'Ready' : 'Add key' }
  })
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
          <img src={logo} alt="Tyslin" className="home-logo" />
          <div className="row" style={{ gap: 8 }}>
            <span className="badge green mono">v{info?.version ?? '…'}</span>
            <span className="badge mono">Beta</span>
          </div>
          <h1 id="home-title">Tyslin Studio</h1>
          <p className="home-tagline">Every agent you run. One studio.</p>
          <p className="lead">
            Build agents with a job, instructions and skills. Run them on the model you choose, or on an agent you already use,
            and review every change before it touches your files.
          </p>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={onAgents}>
              <Icon name="agents" /> {agentCount ? `Open your ${agentCount} agents` : 'Open agents'}
            </button>
            <button type="button" className="btn" onClick={onNewAgent}><Icon name="plus" size={12} /> Build an agent</button>
          </div>
        </div>
        <img src={mascot} alt="The Tyslin robot mascot standing" className="home-mascot" />
      </section>

      <section className="home-section" aria-labelledby="models-h">
        <div className="home-section-head">
          <h2 id="models-h">Models</h2>
          <p className="hint">Built-in agents call these directly with your own key.</p>
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
