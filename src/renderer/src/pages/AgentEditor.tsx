import { useEffect, useState } from 'react'
import type { Agent, AgentInput, ProviderId, Shape, Skill, Tone } from '@shared/types'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'

const MODEL_SUGGESTIONS: Record<ProviderId, string[]> = {
  anthropic: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'],
  openai: ['gpt-4o', 'gpt-4o-mini'],
  ollama: ['llama3.1', 'qwen2.5', 'mistral']
}

const BLANK: AgentInput = {
  name: '', description: '', instructions: '', shape: 'hex', tone: 'lime',
  provider: 'anthropic', model: 'claude-sonnet-5-5', skills: [], schedule: 'manual', isMascot: false
}

interface Props {
  agentId?: string
  onDone: (saved: Agent | null) => void
  onCancel: () => void
}

export function AgentEditor({ agentId, onDone, onCancel }: Props): JSX.Element {
  const [form, setForm] = useState<AgentInput & { id?: string }>(BLANK)
  const [skills, setSkills] = useState<Skill[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void window.tyslin.skills.list().then(setSkills)
    if (agentId) void window.tyslin.agents.get(agentId).then((a) => a && setForm(a))
  }, [agentId])

  const set = <K extends keyof AgentInput>(k: K, v: AgentInput[K]): void => setForm((f) => ({ ...f, [k]: v }))
  const toggleSkill = (name: string): void =>
    set('skills', form.skills.includes(name) ? form.skills.filter((s) => s !== name) : [...form.skills, name])

  const save = async (): Promise<void> => {
    if (!form.name.trim()) return
    setSaving(true)
    const saved = await window.tyslin.agents.save({ ...form, name: form.name.trim() })
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
            <Icon name="back" size={14} /> Agents
          </button>
          <span className="eyebrow">{form.id ? 'Edit agent' : 'New agent'}</span>
          <h1>{form.id ? form.name || 'Agent' : 'Build an agent'}</h1>
        </div>
        <div className="row">
          {form.id && !form.isMascot && <button type="button" className="btn" onClick={remove}>Delete</button>}
          <button type="button" className="btn btn-primary" disabled={!form.name.trim() || saving} onClick={save}>
            {saving ? 'Saving…' : 'Save agent'}
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
              <input id="f-desc" className="input" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What this agent does" />
            </div>
          </div>

          <div className="field">
            <label htmlFor="f-ins">Instructions</label>
            <textarea id="f-ins" className="textarea" rows={8} value={form.instructions} onChange={(e) => set('instructions', e.target.value)}
              placeholder="Describe the job, how the agent should work, and what a good result looks like." />
          </div>

          <div className="two">
            <div className="field">
              <label htmlFor="f-prov">Provider</label>
              <select id="f-prov" className="select" value={form.provider} onChange={(e) => {
                const p = e.target.value as ProviderId
                setForm((f) => ({ ...f, provider: p, model: MODEL_SUGGESTIONS[p][0] }))
              }}>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI</option>
                <option value="ollama">Ollama (local)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-model">Model</label>
              <input id="f-model" className="input mono" list="models" value={form.model} onChange={(e) => set('model', e.target.value)} />
              <datalist id="models">{MODEL_SUGGESTIONS[form.provider].map((m) => <option key={m} value={m} />)}</datalist>
            </div>
          </div>

          <fieldset className="field" style={{ border: 0, margin: 0, padding: 0 }}>
            <legend className="label" style={{ marginBottom: 8 }}>Skills</legend>
            <div className="row" style={{ gap: 8 }}>
              {skills.map((s) => (
                <button key={s.id} type="button" title={s.description} className={'chip' + (form.skills.includes(s.name) ? ' on' : '')}
                  aria-pressed={form.skills.includes(s.name)} onClick={() => toggleSkill(s.name)}>{s.name}</button>
              ))}
            </div>
          </fieldset>

          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="f-sched">Schedule</label>
            <select id="f-sched" className="select" value={form.schedule} onChange={(e) => set('schedule', e.target.value)}>
              <option value="manual">Only when I ask</option>
              <option value="Weekdays 08:00">Every weekday morning</option>
              <option value="Mondays 09:00">Every Monday</option>
            </select>
            <span className="hint">Scheduled runs are saved now and will run once the scheduler ships.</span>
          </div>
        </form>

        <aside className="editor-side" aria-label="Preview">
          <div className="preview">
            <span className="section-label" style={{ alignSelf: 'flex-start', padding: 0 }}>Preview</span>
            <div className="preview-tile"><Avatar shape={form.shape} tone={form.tone} mascot={form.isMascot} size={132} /></div>
            <h2>{form.name || 'Your agent'}</h2>
            <p>{form.description || 'A one-line description appears here.'}</p>
          </div>
          {!form.isMascot && (
            <fieldset className="box" style={{ margin: 0 }}>
              <legend className="label" style={{ padding: '0 6px', fontSize: 13, fontWeight: 600 }}>Character</legend>
              <div className="picker">
                {(['block', 'round', 'hex', 'pill'] as Shape[]).map((s) => (
                  <button key={s} type="button" className={'pick' + (form.shape === s ? ' on' : '')} aria-pressed={form.shape === s} onClick={() => set('shape', s)}>
                    <Avatar shape={s} tone={form.tone} size={30} />
                  </button>
                ))}
              </div>
              <div className="picker three">
                {([['lime', '#7DB800'], ['ink', '#0F0F0D'], ['paper', '#FFFFFF']] as [Tone, string][]).map(([t, c]) => (
                  <button key={t} type="button" className={'pick' + (form.tone === t ? ' on' : '')} aria-pressed={form.tone === t} onClick={() => set('tone', t)}>
                    <span className="swatch" style={{ background: c }} />{t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
        </aside>
      </div>
    </div>
  )
}
