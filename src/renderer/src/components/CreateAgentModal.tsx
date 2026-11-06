import { useEffect, useMemo, useState } from 'react'
import type { Agent, AgentInput, AgentTestResult, EngineStatus, ExternalEngineId, Project, ProviderId, ProviderSettings, Shape, Skill, Tone } from '@shared/types'
import { MODEL_SUGGESTIONS } from '@shared/models'
import { getDefaultModel } from '../defaultModel'
import { getCurrentProject } from '../currentProject'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import { Mark, MARKS } from './RunsOnBadge'
import { HeadPicker } from './HeadPicker'

interface Props {
  agents: Agent[]
  projects: Project[]
  onClose: () => void
  /** Saved: refresh lists. */
  onCreated: (a: Agent) => void
  onChat: (a: Agent) => void
  onTask: (a: Agent) => void
  onOpen: (a: Agent) => void
  onAskBuilder: () => void
}

const STEPS = ['Basics', 'Runs on', 'Instructions', 'Skills', 'Access', 'Test & finish'] as const
const TONES: [Tone, string, string][] = [['lime', 'Lime', '#7DB800'], ['ink', 'Ink', '#0F0F0D'], ['paper', 'Paper', '#FFFFFF']]
const MODELS: { id: ProviderId; note: string }[] = [
  { id: 'anthropic', note: 'Anthropic' }, { id: 'openai', note: 'GPT models' }, { id: 'gemini', note: 'Google' }, { id: 'ollama', note: 'On this computer' }
]

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))

/** New agent in six short steps, with a real test before it is created. */
export function CreateAgentModal({ agents, projects, onClose, onCreated, onChat, onTask, onOpen, onAskBuilder }: Props): JSX.Element {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<AgentInput>({
    kind: 'agent', name: '', description: '', instructions: '', shape: 'hex', tone: 'lime',
    // New agents start on the default model.
    provider: getDefaultModel()?.provider ?? 'anthropic', model: getDefaultModel()?.model ?? 'claude-sonnet-5-5',
    skills: [], schedule: 'manual', engine: 'builtin', writeMode: 'ask', isMascot: false,
    projectId: getCurrentProject(), leadId: null, tools: { read: true, write: true }, channels: { telegram: false }, head: 'smile'
  })
  const [keys, setKeys] = useState<ProviderSettings | null>(null)
  const [engines, setEngines] = useState<EngineStatus[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [skillQ, setSkillQ] = useState('')
  const [test, setTest] = useState<AgentTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [created, setCreated] = useState<Agent | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.tyslin.settings.get().then(setKeys)
    void window.tyslin.engines.list().then(setEngines)
    void window.tyslin.skills.list().then(setSkills)
    void window.tyslin.settings.prefs().then((p) => setForm((f) => ({ ...f, writeMode: p.defaultWriteMode })))
  }, [])

  const set = <K extends keyof AgentInput>(k: K, v: AgentInput[K]): void => { setForm((f) => ({ ...f, [k]: v })); setTest(null) }
  const keySet = (p: ProviderId): boolean => p === 'ollama' || !!(keys && { anthropic: keys.anthropicKeySet, openai: keys.openaiKeySet, gemini: keys.geminiKeySet }[p as 'anthropic'])
  const team = agents.filter((a) => a.kind === 'agent' && !a.isMascot && form.projectId && a.projectId === form.projectId)
  const shownSkills = useMemo(() => {
    const q = skillQ.toLowerCase()
    return [...skills]
      .filter((s) => !q || (s.name + ' ' + s.description).toLowerCase().includes(q))
      .sort((a, b) => Number(form.skills.includes(b.name)) - Number(form.skills.includes(a.name)))
      .slice(0, 60)
  }, [skills, skillQ, form.skills])

  const runTest = async (): Promise<void> => {
    setTesting(true)
    setTest(await window.tyslin.agents.test({ ...form, name: form.name.trim() || 'Agent' }))
    setTesting(false)
  }
  const create = async (): Promise<void> => {
    setError(null)
    try {
      const a = await window.tyslin.agents.save({ ...form, name: form.name.trim(), description: form.description.trim() })
      setCreated(a)
      onCreated(a)
    } catch (e) {
      setError(errorText(e))
    }
  }

  const canNext = step !== 0 || !!form.name.trim()
  const runsOnName = form.engine === 'builtin' ? `${MARKS[form.provider].label} · ${form.model}` : MARKS[form.engine as ExternalEngineId].label

  return (
    <div className="backdrop" role="dialog" aria-modal="true" aria-labelledby="ca-title" onClick={onClose}>
      <div className="modal wizard" onClick={(e) => e.stopPropagation()}>
        <div className="wz-head">
          <strong id="ca-title">New agent</strong>
          <button type="button" className="btn icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>
        <div className="wz-body">
          <nav className="wz-steps" aria-label="Steps">
            {STEPS.map((label, i) => (
              <button key={label} type="button" className={'wz-step' + (i === step ? ' on' : i < step ? ' done' : '')} aria-current={i === step ? 'step' : undefined}
                disabled={!!created || (i > 0 && !form.name.trim())} onClick={() => setStep(i)}>
                <span className="n">{i < step ? <Icon name="check" size={12} /> : i + 1}</span>{label}
              </button>
            ))}
          </nav>
          <div className="wz-pane">
            {step === 0 && (
              <>
                <div className="wz-namerow">
                  <div className="preview-tile small"><Avatar shape={form.shape} tone={form.tone} head={form.head} size={64} /></div>
                  <div className="field" style={{ flex: 1 }}>
                    <label htmlFor="ca-name">Name</label>
                    <input id="ca-name" className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Pitch Coach" autoFocus />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="ca-job">One-line job</label>
                  <input id="ca-job" className="input" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What this agent does, in a sentence" />
                </div>
                <HeadPicker head={form.head ?? null} shape={form.shape} tone={form.tone}
                  onHead={(h) => set('head', h)} onShape={(v) => set('shape', v)} onTone={(v) => set('tone', v)} />
                <div className="wz-builder">
                  <Avatar shape="round" tone="paper" mascot size={34} />
                  <span>Not sure what to write? Describe the job to Builder and it drafts the name, instructions and skills.</span>
                  <button type="button" className="btn" onClick={onAskBuilder}>Ask Builder</button>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <span className="section-label" style={{ padding: 0 }}>Tyslin models · your key</span>
                <div className="wz-grid">
                  {MODELS.map((m) => {
                    const on = form.engine === 'builtin' && form.provider === m.id
                    const ready = keySet(m.id)
                    return (
                      <button key={m.id} type="button" className={'wz-card' + (on ? ' on' : '')} aria-pressed={on}
                        onClick={() => setForm((f) => ({ ...f, engine: 'builtin', provider: m.id, model: f.provider === m.id ? f.model : MODEL_SUGGESTIONS[m.id][0] }))}>
                        <span className="wz-card-top"><Mark id={m.id} size={26} /><strong>{MARKS[m.id].label}</strong></span>
                        <span className="hint">{m.note}</span>
                        <span className={'badge' + (ready ? ' green' : '')}>{m.id === 'ollama' ? 'Local' : ready ? 'Ready' : 'Add key in Settings'}</span>
                      </button>
                    )
                  })}
                </div>
                <span className="section-label" style={{ padding: 0 }}>Agent engines · run an agent you install</span>
                <div className="wz-grid">
                  {engines.map((e) => {
                    const on = form.engine === e.id
                    const ready = !!e.resolvedPath
                    return (
                      <button key={e.id} type="button" className={'wz-card' + (on ? ' on' : '')} aria-pressed={on} onClick={() => set('engine', e.id)}>
                        <span className="wz-card-top"><Mark id={e.id} size={26} /><strong>{e.name}</strong></span>
                        <span className="hint">{e.description}</span>
                        <span className={'badge' + (ready ? ' green' : '')}>{ready ? 'Installed' : e.id === 'custom' && !e.command ? 'Set up in Settings' : 'Install in Settings'}</span>
                      </button>
                    )
                  })}
                </div>
                {form.engine === 'builtin' && (
                  <div className="field" style={{ maxWidth: 360 }}>
                    <label htmlFor="ca-model">Model</label>
                    <input id="ca-model" className="input mono" list="ca-models" value={form.model} onChange={(e) => set('model', e.target.value)} />
                    <datalist id="ca-models">{MODEL_SUGGESTIONS[form.provider].map((m) => <option key={m} value={m} />)}</datalist>
                  </div>
                )}
              </>
            )}

            {step === 2 && (
              <div className="field">
                <label htmlFor="ca-ins">Instructions</label>
                <textarea id="ca-ins" className="textarea mono" rows={13} value={form.instructions} onChange={(e) => set('instructions', e.target.value)}
                  placeholder="Describe the job, how the agent should work, and what a good result looks like." />
                <span className="hint">Your guidelines for every agent (Settings → Agents) and its team in the project are added after these.</span>
              </div>
            )}

            {step === 3 && (
              <>
                <input className="input" type="search" placeholder={`Search ${skills.length} skills`} aria-label="Search skills" value={skillQ} onChange={(e) => setSkillQ(e.target.value)} />
                <div className="row" style={{ gap: 8 }}>
                  {shownSkills.map((s) => {
                    const on = form.skills.includes(s.name)
                    return (
                      <button key={s.id} type="button" title={s.description} className={'chip' + (on ? ' on' : '')} aria-pressed={on}
                        onClick={() => set('skills', on ? form.skills.filter((x) => x !== s.name) : [...form.skills, s.name])}>{s.name}</button>
                    )
                  })}
                </div>
                <span className="hint">{form.skills.length} attached. Each attached skill is added to every message, so keep to the ones the job needs.</span>
              </>
            )}

            {step === 4 && (
              <>
                <div className="two">
                  <div className="field">
                    <label htmlFor="ca-proj">Project</label>
                    <select id="ca-proj" className="select" value={form.projectId ?? ''} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value || null, leadId: null }))}>
                      <option value="">No project yet</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <span className="hint">An agent works in one project. Its chats open there.</span>
                  </div>
                  <div className="field">
                    <label htmlFor="ca-lead">Reports to</label>
                    <select id="ca-lead" className="select" value={form.leadId ?? ''} disabled={!form.projectId} onChange={(e) => set('leadId', e.target.value || null)}>
                      <option value="">You</option>
                      {team.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <span className="hint">Shown on the project's org chart.</span>
                  </div>
                </div>
                <span className="section-label" style={{ padding: 0 }}>File changes</span>
                <div className="choices">
                  {([['ask', 'Ask before writing', 'You review each change as a diff.'], ['direct', 'Write directly', 'Only for folders you can restore.']] as const).map(([m, title, hint]) => (
                    <label key={m} className={'choice' + (form.writeMode === m ? ' on' : '')}>
                      <input type="radio" name="ca-write" checked={form.writeMode === m} onChange={() => set('writeMode', m)} />
                      <span><strong>{title}</strong><span className="hint">{hint}</span></span>
                    </label>
                  ))}
                </div>
                <span className="section-label" style={{ padding: 0 }}>What it can do in the project</span>
                <div className="two">
                  <ToggleRow name="Read project files" desc="List and read files in its project folder." on={form.tools?.read ?? true}
                    onChange={(v) => set('tools', { read: v, write: v ? form.tools?.write ?? true : false })} />
                  <ToggleRow name="Change project files" desc={form.writeMode === 'ask' ? 'Each change waits for your review.' : 'Written straight to disk.'} on={form.tools?.write ?? true}
                    disabled={!(form.tools?.read ?? true)} onChange={(v) => set('tools', { read: form.tools?.read ?? true, write: v })} />
                </div>
                {form.engine !== 'builtin' && <span className="hint">Agent engines can also run commands with their own tools; they ask you first, in chat or on Telegram.</span>}
              </>
            )}

            {step === 5 && (
              <>
                <div className="wz-test">
                  <span className="wz-test-ic" aria-hidden="true"><Icon name="play" size={14} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>Test {form.name.trim() || 'your agent'}</strong>
                    <div className="hint">{test ? (test.ok ? `Answered in ${(test.ms / 1000).toFixed(1)} s: ${test.detail}` : test.detail) : `Sends one short message to ${runsOnName}.`}</div>
                  </div>
                  {test && <span className={test.ok ? 'ok' : 'account-error hint'}>{test.ok ? 'Working' : 'Failed'}</span>}
                  <button type="button" className="btn" onClick={() => void runTest()} disabled={testing}>{testing ? 'Testing…' : test ? 'Test again' : 'Run test'}</button>
                </div>
                {created ? (
                  <div className="wz-ready">
                    <strong>{created.name} is ready</strong>
                    <div className="kv">
                      <span>Runs on</span><span>{runsOnName}</span>
                      <span>Project</span><span>{projects.find((p) => p.id === created.projectId)?.name ?? 'No project yet'}{created.leadId ? ` · reports to ${agents.find((a) => a.id === created.leadId)?.name}` : ' · reports to You'}</span>
                      <span>Skills</span><span>{created.skills.length} attached</span>
                      <span>File changes</span><span>{created.writeMode === 'ask' ? 'Ask before writing' : 'Write directly'}</span>
                    </div>
                    <div className="row">
                      <button type="button" className="btn btn-lime" onClick={() => onChat(created)}>Start a chat</button>
                      <button type="button" className="btn" onClick={() => onTask(created)}>Give it a task</button>
                      <button type="button" className="btn" onClick={() => onOpen(created)}>Open agent page</button>
                    </div>
                  </div>
                ) : (
                  <p className="hint">You can create it without a test and set up keys or engines later; it will show "Needs setup" until then.</p>
                )}
                {error && <p className="hint account-error" role="alert">{error}</p>}
              </>
            )}
          </div>
        </div>
        <div className="wz-foot">
          <button type="button" className="btn" onClick={onClose}>{created ? 'Close' : 'Cancel'}</button>
          {!created && (
            <div className="row">
              {step > 0 && <button type="button" className="btn" onClick={() => setStep(step - 1)}>Back</button>}
              {step < STEPS.length - 1
                ? <button type="button" className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>{step === 4 ? 'Test & finish' : 'Next'}</button>
                : <button type="button" className="btn btn-primary" disabled={!form.name.trim()} onClick={() => void create()}>Create agent</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ToggleRow({ name, desc, on, disabled, onChange }: { name: string; desc: string; on: boolean; disabled?: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <div className="toggle-row">
      <span><strong>{name}</strong><span className="hint">{desc}</span></span>
      <button type="button" role="switch" aria-checked={on} aria-label={name} className={'switch' + (on ? ' on' : '')} disabled={disabled} onClick={() => onChange(!on)} />
    </div>
  )
}
