import { useState } from 'react'
import type { KeyProvider, ProviderId, ProviderSettings } from '@shared/types'
import { MODEL_SUGGESTIONS, PROVIDER_NAME } from '@shared/models'
import { refreshDefaultModel } from '../defaultModel'

/** Providers with an API key, with where to get one. Used by onboarding and Settings → Models. */
export const KEY_PROVIDERS: { id: KeyProvider; label: string; placeholder: string; flag: keyof ProviderSettings; getKey: string }[] = [
  { id: 'anthropic', label: 'Claude (Anthropic)', placeholder: 'sk-ant-…', flag: 'anthropicKeySet', getKey: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', label: 'ChatGPT (OpenAI)', placeholder: 'sk-…', flag: 'openaiKeySet', getKey: 'https://platform.openai.com/api-keys' },
  { id: 'gemini', label: 'Gemini (Google)', placeholder: 'From Google AI Studio', flag: 'geminiKeySet', getKey: 'https://aistudio.google.com/apikey' }
]

const hasKey = (s: ProviderSettings | null, p: ProviderId): boolean =>
  p === 'ollama' || !!(s && s[KEY_PROVIDERS.find((k) => k.id === p)!.flag])

/** One row per provider: a password field and Save (Enter saves; no <form>, so it can sit inside one). Keys are encrypted in main and never come back to the window. */
export function ModelKeys({ settings, onSaved }: { settings: ProviderSettings | null; onSaved: (label: string) => void | Promise<void> }): JSX.Element {
  const [keys, setKeys] = useState<Record<KeyProvider, string>>({ anthropic: '', openai: '', gemini: '' })
  const [busy, setBusy] = useState<KeyProvider | null>(null)
  const save = async (id: KeyProvider, label: string): Promise<void> => {
    if (!keys[id].trim()) return
    setBusy(id)
    try {
      await window.tyslin.settings.setKey(id, keys[id])
      setKeys((v) => ({ ...v, [id]: '' }))
      await refreshDefaultModel()
      await onSaved(label)
    } finally { setBusy(null) }
  }
  return (
    <div className="model-keys">
      {KEY_PROVIDERS.map((k) => {
        const saved = !!settings?.[k.flag]
        return (
          <div className="field" key={k.id}>
            <div className="model-key-head">
              <label htmlFor={'k-' + k.id}>{k.label}</label>
              {saved ? <span className="model-key-saved">Key saved</span> : <a href={k.getKey} target="_blank" rel="noreferrer" className="hint">Get a key</a>}
            </div>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input id={'k-' + k.id} type="password" className="input mono" autoComplete="off" placeholder={saved ? '•••••••• saved (type to replace)' : k.placeholder}
                value={keys[k.id]} onChange={(e) => setKeys((v) => ({ ...v, [k.id]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save(k.id, k.label) } }} />
              <button type="button" className="btn btn-primary" disabled={!keys[k.id].trim() || busy === k.id} onClick={() => void save(k.id, k.label)}>{busy === k.id ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Provider and model for the default model. Providers without a key are marked; Ollama needs none. */
export function DefaultModelPicker({ settings, value, onChange, idPrefix = 'dm' }: {
  settings: ProviderSettings | null
  value: { provider: ProviderId; model: string }
  onChange: (v: { provider: ProviderId; model: string }) => void
  idPrefix?: string
}): JSX.Element {
  const providers: ProviderId[] = ['anthropic', 'openai', 'gemini', 'ollama']
  return (
    <div className="dm-picker">
      <div className="field">
        <label htmlFor={idPrefix + '-prov'}>Provider</label>
        <select id={idPrefix + '-prov'} className="select" value={value.provider}
          onChange={(e) => { const p = e.target.value as ProviderId; onChange({ provider: p, model: MODEL_SUGGESTIONS[p][0] }) }}>
          {providers.map((p) => (
            <option key={p} value={p}>{PROVIDER_NAME[p]}{p === 'ollama' ? ' (on this computer)' : hasKey(settings, p) ? '' : ' (no key yet)'}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={idPrefix + '-model'}>Model</label>
        <input id={idPrefix + '-model'} className="input mono" list={idPrefix + '-models'} value={value.model} spellCheck={false}
          onChange={(e) => onChange({ ...value, model: e.target.value })} />
        <datalist id={idPrefix + '-models'}>{MODEL_SUGGESTIONS[value.provider].map((m) => <option key={m} value={m} />)}</datalist>
      </div>
      {!hasKey(settings, value.provider) && <p className="hint account-error dm-note">Add a {PROVIDER_NAME[value.provider]} key above, or this model can't answer.</p>}
    </div>
  )
}
