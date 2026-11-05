import { useEffect, useState } from 'react'
import type { OnboardingStatus, ProviderId, ProviderSettings } from '@shared/types'
import { PROVIDER_NAME } from '@shared/models'
import logo from '../assets/logo-mark.png'
import { refreshDefaultModel } from '../defaultModel'
import { DefaultModelPicker, ModelKeys } from './ModelSetup'

const STEPS = ['Organization', 'Default project', 'Models'] as const

/**
 * First-run setup, shown once per computer after sign-in (or on first launch in builds without sign-in):
 * the organization's name, the Default project's name, model keys and the default model.
 */
export function Onboarding({ firstName, onDone }: { firstName?: string; onDone: () => void }): JSX.Element {
  const [status, setStatus] = useState<OnboardingStatus | null>(null)
  const [settings, setSettings] = useState<ProviderSettings | null>(null)
  const [step, setStep] = useState(0)
  const [org, setOrg] = useState('')
  const [project, setProject] = useState('')
  const [pick, setPick] = useState<{ provider: ProviderId; model: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSettings = async (): Promise<ProviderSettings> => {
    const s = await window.tyslin.settings.get()
    setSettings(s)
    return s
  }
  useEffect(() => {
    void window.tyslin.onboarding.status().then((st) => { setStatus(st); setOrg(st.orgName); setProject(st.projectName) })
    void loadSettings().then((s) => setPick({ provider: s.defaultModel.provider, model: s.defaultModel.model }))
  }, [])

  const hasKey = (p: ProviderId): boolean => p === 'ollama' || !!settings?.[`${p}KeySet` as 'anthropicKeySet']
  const anyKey = !!settings && (settings.anthropicKeySet || settings.openaiKeySet || settings.geminiKeySet)

  /** After saving a key: when the picked provider still has none, move the default onto the provider just saved. */
  const keySaved = async (): Promise<void> => {
    const s = await loadSettings()
    if (pick && !(pick.provider === 'ollama' || s[`${pick.provider}KeySet` as 'anthropicKeySet'])) {
      setPick({ provider: s.defaultModel.provider, model: s.defaultModel.model })
    }
  }

  const finish = async (): Promise<void> => {
    if (!pick) return
    setBusy(true)
    setError(null)
    try {
      await window.tyslin.onboarding.finish({ orgName: org.trim(), projectName: project.trim(), defaultProvider: pick.provider, defaultModel: pick.model.trim() })
      await refreshDefaultModel()
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
      setBusy(false)
    }
  }

  const canNext = step === 0 ? !!org.trim() : step === 1 ? !!project.trim() : !!pick?.model.trim()
  const next = (): void => { if (canNext) { if (step < STEPS.length - 1) setStep(step + 1); else void finish() } }

  if (!status) return <main className="login" />

  return (
    <main className="login onboard">
      <form className="login-card onboard-card" onSubmit={(e) => { e.preventDefault(); next() }} aria-labelledby="onboard-h">
        <div className="onboard-top">
          <img src={logo} alt="" width={44} height={44} className="onboard-logo" />
          <div>
            <span className="eyebrow">Set up · step {step + 1} of {STEPS.length}</span>
            <p className="onboard-welcome">Welcome{firstName ? `, ${firstName}` : ''}</p>
          </div>
        </div>
        <ol className="onboard-steps" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
              <span className="onboard-dot" aria-hidden="true">{i + 1}</span>{s}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <section className="onboard-body">
            <h1 id="onboard-h">Name your organization</h1>
            <p className="hint">Your agents, assistants, projects and chats live in it. You can add more organizations later from the status bar.</p>
            <div className="field">
              <label htmlFor="ob-org">Organization name</label>
              <input id="ob-org" className="input" autoFocus maxLength={60} value={org} onChange={(e) => setOrg(e.target.value)} placeholder="e.g. ReactiveSpace" />
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="onboard-body">
            <h1 id="onboard-h">Name your default project</h1>
            <p className="hint">Mind maps, workflows, Canvas documents and Drive files go here when no other project is chosen.</p>
            <div className="field">
              <label htmlFor="ob-project">Project name</label>
              <input id="ob-project" className="input" autoFocus maxLength={80} value={project} onChange={(e) => setProject(e.target.value)} placeholder="e.g. Launch" />
            </div>
            <p className="hint mono onboard-path">
              {status.projectFolder
                ? `Its folder stays at ${status.projectFolder}`
                : `Folder: Documents/Tyslin Studio/${org.trim() || '…'}/${project.trim() || '…'}`}
            </p>
          </section>
        )}

        {step === 2 && pick && (
          <section className="onboard-body">
            <h1 id="onboard-h">Add your model keys</h1>
            <p className="hint">Add a key for each provider you use. Keys are encrypted on this computer and only ever go to their own provider.</p>
            <ModelKeys settings={settings} onSaved={keySaved} />
            <h2 className="onboard-sub">Default model</h2>
            <p className="hint">Used by Mind mapper, Canvas and Workflows, and shown in the status bar. You can change it any time in Settings → Models.</p>
            <DefaultModelPicker settings={settings} value={pick} onChange={setPick} idPrefix="ob-dm" />
            {!anyKey && pick.provider !== 'ollama' && <p className="hint">No key yet? You can finish now and add one later in Settings → Models.</p>}
          </section>
        )}

        {error && <p className="login-error" role="alert">{error}</p>}
        <div className="onboard-actions">
          {step > 0 ? <button type="button" className="btn" onClick={() => setStep(step - 1)} disabled={busy}>Back</button> : <span />}
          <button type="submit" className="btn btn-primary" disabled={!canNext || busy}>
            {step < STEPS.length - 1 ? 'Continue' : busy ? 'Saving…' : pick && !hasKey(pick.provider) ? `Finish without a ${PROVIDER_NAME[pick.provider]} key` : 'Finish'}
          </button>
        </div>
      </form>
    </main>
  )
}
