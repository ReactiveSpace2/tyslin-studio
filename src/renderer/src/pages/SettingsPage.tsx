import { useEffect, useState } from 'react'
import type { ProviderSettings } from '@shared/types'
import stacked from '../assets/logo-stacked.png'

export function SettingsPage(): JSX.Element {
  const [s, setS] = useState<ProviderSettings | null>(null)
  const [anthropic, setAnthropic] = useState('')
  const [openai, setOpenai] = useState('')
  const [ollama, setOllama] = useState('')
  const [saved, setSaved] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    const v = await window.tyslin.settings.get()
    setS(v)
    setOllama(v.ollamaUrl)
  }
  useEffect(() => { void load() }, [])

  const flash = (msg: string): void => {
    setSaved(msg)
    setTimeout(() => setSaved(null), 2500)
  }

  return (
    <div className="page">
      <header style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="eyebrow">Settings</span>
        <h1>Model providers</h1>
        <p className="lead">Keys are encrypted with your system keychain and never leave this computer except to call the provider.</p>
      </header>
      <div className="settings">
        <div className="box">
          <div className="field">
            <label htmlFor="k-anthropic">Anthropic API key</label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input id="k-anthropic" type="password" className="input mono" placeholder={s?.anthropicKeySet ? '•••••••• saved' : 'sk-ant-…'} value={anthropic} onChange={(e) => setAnthropic(e.target.value)} />
              <button type="button" className="btn btn-primary" disabled={!anthropic} onClick={async () => { await window.tyslin.settings.setKey('anthropic', anthropic); setAnthropic(''); await load(); flash('Anthropic key saved') }}>Save</button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="k-openai">OpenAI API key</label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input id="k-openai" type="password" className="input mono" placeholder={s?.openaiKeySet ? '•••••••• saved' : 'sk-…'} value={openai} onChange={(e) => setOpenai(e.target.value)} />
              <button type="button" className="btn btn-primary" disabled={!openai} onClick={async () => { await window.tyslin.settings.setKey('openai', openai); setOpenai(''); await load(); flash('OpenAI key saved') }}>Save</button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="k-ollama">Ollama URL (local models)</label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input id="k-ollama" className="input mono" value={ollama} onChange={(e) => setOllama(e.target.value)} />
              <button type="button" className="btn" onClick={async () => { await window.tyslin.settings.setOllamaUrl(ollama); flash('Ollama URL saved') }}>Save</button>
            </div>
          </div>
          {saved && <span className="ok" role="status">{saved}</span>}
        </div>
        <div className="box" style={{ alignItems: 'center', textAlign: 'center' }}>
          <img src={stacked} alt="Tyslin" style={{ width: 120 }} />
          <span className="hint">Tyslin AI · a ReactiveSpace product · tyslin.ai</span>
        </div>
      </div>
    </div>
  )
}
