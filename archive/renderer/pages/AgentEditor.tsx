import { useEffect, useState } from 'react'
import type { Agent, AgentInput, AgentKind, EngineId, EngineStatus, ProviderId, Shape, Skill, Tone, WriteMode } from '@shared/types'
import { ENGINE_NAMES } from '@shared/engines'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { HeadPicker } from '../components/HeadPicker'
import { MODEL_SUGGESTIONS } from '@shared/models'
import { getDefaultModel } from '../defaultModel'
import { getCurrentProject } from '../currentProject'

/** Kept here too for older imports; the list lives in shared/models.ts. */
export { MODEL_SUGGESTIONS }

const BLANK: AgentInput = {
  kind: 'agent', name: '', description: '', instructions: '', shape: 'hex', tone: 'lime',
  provider: 'anthropic', model: 'claude-sonnet-5-5', skills: [], schedule: 'manual', engine: 'builtin', writeMode: 'ask', isMascot: false, head: 'smile'
}

interface Props {
  /** For a new one; an existing one keeps its own kind. */
  kind: AgentKind
  agentId?: string
  onDone: (saved: Agent | null) => void
  onCancel: () => void
}

export function AgentEditor({ kind, agentId, onDone, onCancel }: Props): JSX.Element {
  const [form, setForm] = useState<AgentInput & { id?: string }>({ ...BLANK, kind, provider: getDefaultModel()?.provider ?? BLANK.provider, model: getDefaultModel()?.model ?? BLANK.model })
  const [skills, setSkills] = useState<Skill[]>([])
  const [saving, setSaving] = useState(false)
  const [engines, setEngines] = useState<EngineStatus[]>([])

  useEffect(() => {
    void window.tyslin.skills.list().then(setSkills)
    void window.tyslin.engines.list().then(setEngines)
    if (agentId) void window.tyslin.agents.get(agentId).then((a) => a && setForm(a))
    else void window.tyslin.settings.prefs().then((p) => setForm((f) => ({ ...f, writeMode: p.defaultWriteMode })))
  }, [agentId])

  const isAgent = form.kind === 'agent'
  const noun = isAgent ? 'agent' : 'assistant'
  const set = <K extends keyof AgentInput>(k: K, v: AgentInput[K]): void => setForm((f) => ({ ...f, [k]: v }))
  const toggleSkill = (name: string): void =>
    set('skills', form.skills.includes(name) ? form.skills.filter((s) => s !== name) : [...form.skills, name])

  const save = async (): Promise<void> => {
    if (!form.name.trim()) return
    setSaving(true)
    // New ones belong to the project picked in the title bar.
    const saved = await window.tyslin.agents.save({ ...form, name: form.name.trim(), projectId: form.id ? form.projectId : getCurrentProject() })
    setSaving(false)
    onDone(saved)
  }

  const remove = async (): Promise<void> => {
    if (!form.id || form.isMascot) return
    if (!window.confirm(`Delete ${form.name}? Its chats will be deleted too.`)) return
    await window.tyslin.agents.remove(form.id)
    onDone(null)
  }

  return (
    <div className="page">
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onCancel}>
            <Icon name="back" size={14} /> {isAgent ? 'Agents' : 'Assistants'}
          </button>
          <span className="eyebrow">{form.id ? `Edit ${noun}` : `New ${noun}`}</span>
          <h1>{form.id ? form.name || (isAgent ? 'Agent' : 'Assistant') : isAgent ? 'Build an agent' : 'Make an assistant'}</h1>
        </div>
        <div className="row">
          {form.id && !form.isMascot && <button type="button" className="btn" onClick={remove}>Delete</button>}
          <button type="button" className="btn btn-primary" disabled={!form.name.trim() || saving} onClick={save}>
            {saving ? 'Saving…' : `Save ${noun}`}
          </button>
        </div>
      </header>

      <div className="editor">
        <form className="editor-form" onSubmit={(e) => { e.preventDefault(); void save() }}>
          <div className="two">
            <div className="field">
              <label htmlFor="f-name">Name</label>
              <input id="f-name" className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Pitch Coach" />
            </div>
            <div className="field">
              <label htmlFor="f-desc">One-line description</label>
              <input id="f-desc" className="input" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder={`What this ${noun} does`} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="f-ins">Instructions</label>
            <textarea id="f-ins" className="textarea" rows={8} value={form.instructions} onChange={(e) => set('instructions', e.target.value)}
              placeholder={isAgent
                ? 'Describe the job, how the agent should work, and what a good result looks like.'
                : 'Describe the role, the tone, and what a good answer looks like.'} />
          </div>

          {isAgent && <div className="field">
            <label htmlFor="f-engine">Runs on</label>
            <select id="f-engine" className="select" style={{ maxWidth: 420 }} value={form.engine} onChange={(e) => set('engine', e.target.value as EngineId)}>
              <option value="builtin">Tyslin (pick a model below)</option>
              {engines.map((e) => (
                <option key={e.id} value={e.id}>{e.name}{e.resolvedPath ? '' : e.id === 'custom' && !e.command ? ' (set up in Settings)' : ' (not installed)'}</option>
              ))}
            </select>
            {form.engine !== 'builtin' && (() => {
              const e = engines.find((x) => x.id === form.engine)
              return (
                <span className="hint">
                  {ENGINE_NAMES[form.engine]} runs as its own program and uses its own model settings. Your instructions and skills are sent with each message.
                  {e && !e.resolvedPath && <> {e.id === 'custom' && !e.command ? 'Enter its command' : "It isn't installed yet, or Tyslin can't find it"} in Settings → Agent engines.</>}
                  {' '}File edits it asks Tyslin to make go through your review; edits it makes with its own tools can't be reviewed.
                </span>
              )
            })()}
          </div>}

          {form.engine === 'builtin' && <div className="two">
            <div className="field">
              <label htmlFor="f-prov">Provider</label>
              <select id="f-prov" className="select" value={form.provider} onChange={(e) => {
                const p = e.target.value as ProviderId
                setForm((f) => ({ ...f, provider: p, model: MODEL_SUGGESTIONS[p][0] }))
              }}>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Google Gemini</option>
                <option value="ollama">Ollama (local)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-model">Model</label>
              <input id="f-model" className="input mono" list="models" value={form.model} onChange={(e) => set('model', e.target.value)} />
              <datalist id="models">{MODEL_SUGGESTIONS[form.provider].map((m) => <option key={m} value={m} />)}</datalist>
            </div>
          </div>}

          <fieldset className="field" style={{ border: 0, margin: 0, padding: 0 }}>
            <legend className="label" style={{ marginBottom: 8 }}>Skills</legend>
            <div className="row" style={{ gap: 8 }}>
              {skills.map((s) => (
                <button key={s.id} type="button" title={s.description} className={'chip' + (form.skills.includes(s.name) ? ' on' : '')}
                  aria-pressed={form.skills.includes(s.name)} onClick={() => toggleSkill(s.name)}>{s.name}</button>
              ))}
            </div>
          </fieldset>

          {isAgent && <fieldset className="field" style={{ border: 0, margin: 0, padding: 0 }}>
            <legend className="label" style={{ marginBottom: 8 }}>File changes</legend>
            <div className="choices">
              {([
                ['ask', 'Ask before writing files', 'You review a diff and accept or reject each change.'],
                ['direct', 'Write directly', 'Changes go straight to disk in linked project folders.']
              ] as [WriteMode, string, string][]).map(([mode, title, hint]) => (
                <label key={mode} className={'choice' + (form.writeMode === mode ? ' on' : '')}>
                  <input type="radio" name="write-mode" value={mode} checked={form.writeMode === mode} onChange={() => set('writeMode', mode)} />
                  <span><strong>{title}</strong><span className="hint">{hint}</span></span>
                </label>
              ))}
            </div>
            {form.writeMode === 'direct' && (
              <div className="warn" role="note">
                <Icon name="warning" size={14} />
                {form.name || 'This agent'} will change files without asking. Use it only on folders you can restore, such as a git repo.
              </div>
            )}
          </fieldset>}

          {isAgent && <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="f-sched">Schedule</label>
            <select id="f-sched" className="select" value={form.schedule} onChange={(e) => set('schedule', e.target.value)}>
              <option value="manual">Only when I ask</option>
              <option value="Weekdays 08:00">Every weekday morning</option>
              <option value="Mondays 09:00">Every Monday</option>
            </select>
            <span className="hint">Scheduled runs are saved now and will run once the scheduler ships.</span>
          </div>}
        </form>

        <aside className="editor-side" aria-label="Preview">
          <div className="preview">
            <span className="section-label" style={{ alignSelf: 'flex-start', padding: 0 }}>Preview</span>
            <div className="preview-tile"><Avatar shape={form.shape} tone={form.tone} head={form.head} mascot={form.isMascot} size={132} /></div>
            <h2>{form.name || `Your ${noun}`}</h2>
            <p>{form.description || 'A one-line description appears here.'}</p>
          </div>
          {!form.isMascot && (
            <div className="box" style={{ margin: 0 }}>
              <HeadPicker head={form.head ?? null} shape={form.shape} tone={form.tone}
                onHead={(h) => set('head', h)} onShape={(v) => set('shape', v)} onTone={(v) => set('tone', v)} />
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
