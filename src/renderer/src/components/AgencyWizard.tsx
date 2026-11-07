import { useEffect, useMemo, useState } from 'react'
import type { ClaudeSkill, EngineStatus, ProviderId, ProviderSettings, SkillPack, TelegramStatus } from '@shared/types'
import {
  AGENCY_ADAPTERS, AGENCY_COLUMNS, AGENCY_TEMPLATES, agentName, planOwner, templateAdapters, templateSummary,
  type AgencyAdapterId, type AgencyMember, type AgencyNotify, type AgencyTemplate
} from '@shared/agencies'
import { PROVIDER_NAME } from '@shared/models'
import { HEAD_SRC } from '../heads'
import { refreshDefaultModel } from '../defaultModel'
import { DefaultModelPicker, ModelKeys } from './ModelSetup'
import { Icon } from './Icon'
import logo from '../assets/logo-mark.png'
import claudeLogo from '../assets/providers/claude.svg'
import geminiLogo from '../assets/providers/gemini.svg'
import hermesLogo from '../assets/providers/hermes.png'
import { Pose } from './Pose'

const STEPS = ['Agency', 'Adapter', 'Model', 'Skills', 'Kanban', 'Channel', 'Review'] as const

const ADAPTER_LOGO: Partial<Record<AgencyAdapterId, string>> = { 'claude-code': claudeLogo, 'gemini-cli': geminiLogo, hermes: hermesLogo }
const CLAUDE_PACK = 'anthropic-skills'

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))

function Head({ id, size = 32 }: { id: string; size?: number }): JSX.Element {
  return <img src={HEAD_SRC[id] ?? HEAD_SRC.smile} alt="" width={size} height={size} className="nt-head" />
}

function AdapterMark({ id, name }: { id: AgencyAdapterId; name: string }): JSX.Element {
  const src = ADAPTER_LOGO[id]
  return src
    ? <span className="aw-mark"><img src={src} alt="" width={26} height={26} /></span>
    : <span className="aw-mark aw-letter mono" aria-hidden="true">{name.slice(0, 2)}</span>
}

interface Draft {
  org: string
  name: string
  description: string
  templateId: string | null
  goal: string
  /** Shared by every agent in the agency (saved once agencies are stored). */
  prompt: string
  plan: string[]
  roster: AgencyMember[]
  /** 'template' = each worker on the engine its template names. */
  adapter: AgencyAdapterId | 'template'
  model: { provider: ProviderId; model: string } | null
  packs: string[]
  autoRun: boolean
  channel: 'telegram' | 'slack' | 'none'
  notify: AgencyNotify
}

/**
 * Agency setup: seven steps that turn a template (or a description) into an agency: a Lead, its workers,
 * skills, a Kanban board and a channel to you. Shown after sign-in on first run.
 */
export function AgencyWizard({ firstName, firstRun, first, templateId, onDone, onCancel }: {
  firstName?: string
  /** The organization has no agencies yet (titles say "your first agency"). */
  first?: boolean
  /** Opens with this template picked (from Home's template grid). */
  templateId?: string
  /** First run asks the organization and shows the key fields; from New agency it doesn't. */
  firstRun: boolean
  /** Created; from New agency, with the new agency's project id. */
  onDone: (projectId?: string) => void
  onCancel?: () => void
}): JSX.Element {
  const [step, setStep] = useState(0)
  const [d, setD] = useState<Draft>({
    org: '', name: '', description: '', templateId: null, goal: '', prompt: '', plan: [], roster: [],
    adapter: 'template', model: null, packs: [], autoRun: false, channel: 'none', notify: 'questions'
  })
  const set = (p: Partial<Draft>): void => setD((v) => ({ ...v, ...p }))
  const [query, setQuery] = useState('')
  const [settings, setSettings] = useState<ProviderSettings | null>(null)
  const [engines, setEngines] = useState<EngineStatus[]>([])
  const [packs, setPacks] = useState<SkillPack[] | null>(null)
  const [catalog, setCatalog] = useState<ClaudeSkill[] | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [skillTab, setSkillTab] = useState<'claude' | 'openai' | 'github'>('claude')
  const [tg, setTg] = useState<TelegramStatus | null>(null)
  const [tgToken, setTgToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSettings = async (): Promise<ProviderSettings> => { const s = await window.tyslin.settings.get(); setSettings(s); return s }
  useEffect(() => {
    void window.tyslin.onboarding.status().then((st) => set({ org: st.orgName }))
    void loadSettings().then((s) => set({ model: { provider: s.defaultModel.provider, model: s.defaultModel.model } }))
    void window.tyslin.engines.list().then(setEngines)
    void window.tyslin.telegram.status().then(setTg)
  }, [])
  // Skills load when that step opens, since they come from GitHub.
  useEffect(() => {
    if (step !== 3 || packs) return
    void window.tyslin.skillPacks.list().then(setPacks).catch(() => setPacks([]))
    void window.tyslin.skillPacks.claudeCatalog().then(setCatalog).catch((e) => setCatalogError(errorText(e)))
  }, [step, packs])

  const pickTemplate = (id: string): void => {
    const t = AGENCY_TEMPLATES.find((x) => x.id === id)
    if (!t) return
    set({
      templateId: id, description: t.tagline, goal: t.goal, plan: t.plan, roster: t.roster, name: d.name.trim() ? d.name : t.name,
      prompt: `${t.tagline} Work in this agency's folder. Keep each change small and send it for review. Write in plain English. Ask before adding a paid service or a new dependency.`
    })
  }
  useEffect(() => { if (templateId) pickTemplate(templateId) }, [templateId])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? AGENCY_TEMPLATES.filter((t) => `${t.name} ${t.tagline}`.toLowerCase().includes(q)) : AGENCY_TEMPLATES
  }, [query])

  const lead = d.roster.find((m) => m.lead)
  const workers = d.roster.filter((m) => !m.lead)
  const template = AGENCY_TEMPLATES.find((t) => t.id === d.templateId) ?? null
  const included = template ? template.skills : []
  const adapterName = (id: AgencyMember['engine'] | 'template'): string => id === 'template' ? 'Template\'s mix' : id === 'builtin' ? 'Default model' : AGENCY_ADAPTERS.find((a) => a.id === id)!.name
  /** What a worker will run on after the Adapter step. */
  const engineFor = (m: AgencyMember): AgencyMember['engine'] => m.lead || d.adapter === 'template' ? m.engine : d.adapter
  const engineOf = (id: string): EngineStatus | undefined => engines.find((e) => e.id === id)
  const togglePack = (id: string): void => set({ packs: d.packs.includes(id) ? d.packs.filter((p) => p !== id) : [...d.packs, id] })
  const folder = `Documents/Tyslin Studio/${d.org.trim() || '…'}/${d.name.trim() || '…'}`

  const keySaved = async (): Promise<void> => {
    const s = await loadSettings()
    if (d.model && !(d.model.provider === 'ollama' || s[`${d.model.provider}KeySet` as 'anthropicKeySet'])) {
      set({ model: { provider: s.defaultModel.provider, model: s.defaultModel.model } })
    }
  }

  const canNext = [
    !!d.name.trim() && (!firstRun || !!d.org.trim()) && (!!d.description.trim() || !!d.templateId),
    true,
    !!d.model?.model.trim(),
    true, true, true, true
  ][step]

  const create = async (): Promise<void> => {
    if (!d.model) return
    setBusy(true); setError(null)
    try {
      if (firstRun) {
        // The organization's name and the default model first; the Default project is only a fallback folder.
        await window.tyslin.onboarding.finish({ orgName: d.org.trim(), projectName: 'Default project', defaultProvider: d.model.provider, defaultModel: d.model.model.trim() })
        await refreshDefaultModel()
      }
      const a = await window.tyslin.agencies.create({
        name: d.name.trim(), templateId: d.templateId, description: d.description.trim(), goal: d.goal.trim(), prompt: d.prompt,
        adapter: d.adapter, packs: d.packs, autoRun: d.autoRun, channel: d.channel, notify: d.notify, budget: null
      })
      onDone(a.projectId)
    } catch (e) {
      setError(errorText(e)); setBusy(false)
    }
  }
  const next = (): void => { if (!canNext) return; if (step < STEPS.length - 1) setStep(step + 1); else void create() }

  return (
    <main className="aw">
      <form className="aw-card" onSubmit={(e) => { e.preventDefault(); next() }} aria-labelledby="aw-h">
        <header className="aw-top">
          <img src={logo} alt="" width={40} height={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="eyebrow">{firstRun ? 'Set up your agency' : 'New agency'} · step {step + 1} of {STEPS.length}</span>
            <p className="onboard-welcome">{firstName ? `Welcome, ${firstName}` : 'Welcome'}</p>
          </div>
          <ol className="aw-dots" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
                <button type="button" title={s} aria-label={`Step ${i + 1}: ${s}`} disabled={i > step || busy} onClick={() => setStep(i)} />
              </li>
            ))}
          </ol>
        </header>

        {step === 0 && (
          <section className="aw-body">
            <h1 id="aw-h">{firstRun || first ? 'Set up your first agency' : 'Set up a new agency'}</h1>
            <p className="hint">You get a Lead and a team of agents with a goal, a plan, a board and a line to you. Start from a template or describe the work.</p>
            <div className="aw-two">
              {firstRun && (
                <div className="field">
                  <label htmlFor="aw-org">Organization</label>
                  <input id="aw-org" className="input" maxLength={60} value={d.org} onChange={(e) => set({ org: e.target.value })} placeholder="e.g. ReactiveSpace" />
                </div>
              )}
              <div className="field">
                <label htmlFor="aw-name">Agency name</label>
                <input id="aw-name" className="input" autoFocus maxLength={80} value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Launch Studio" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="aw-desc">What does this agency do?</label>
              <textarea id="aw-desc" className="input" rows={2} value={d.description} onChange={(e) => set({ description: e.target.value })}
                placeholder="Describe the work in a sentence or two, or start from a template below." />
            </div>
            <div className="field">
              <label htmlFor="aw-goal">Goal</label>
              <input id="aw-goal" className="input" value={d.goal} onChange={(e) => set({ goal: e.target.value })} placeholder="One sentence: what done looks like" />
            </div>
            <div className="field">
              <label htmlFor="aw-prompt">Agency prompt</label>
              <span className="hint">Every agent in this agency follows this, the Lead and the workers. Each agent also keeps its own job instructions.</span>
              <textarea id="aw-prompt" className="input" rows={3} value={d.prompt} onChange={(e) => set({ prompt: e.target.value })}
                placeholder="How this agency works: tools, style, what to ask you before doing." />
            </div>
            <div className="aw-tpl-head">
              <h2 className="onboard-sub" style={{ margin: 0 }}>Start from a template</h2>
              <input className="input aw-search" type="search" placeholder="Search templates" aria-label="Search templates" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="aw-grid" role="radiogroup" aria-label="Templates">
              {shown.map((t) => {
                const l = t.roster.find((m) => m.lead)!
                const on = d.templateId === t.id
                return (
                  <button key={t.id} type="button" role="radio" aria-checked={on} className={'aw-tpl' + (on ? ' on' : '')} onClick={() => pickTemplate(t.id)}>
                    <span className="aw-tpl-top"><Head id={l.head} size={30} /><strong>{t.name}</strong>{on && <span className="aw-check"><Icon name="check" size={12} /></span>}</span>
                    <span className="hint">{t.tagline}</span>
                    <span className="aw-tpl-foot">
                      <span className="mono aw-small">{templateSummary(t)}</span>
                      <span className="aw-runs" aria-label={`Runs on ${templateAdapters(t).map((id) => AGENCY_ADAPTERS.find((a) => a.id === id)!.name).join(', ')}`}>
                        {templateAdapters(t).map((id) => {
                          const a = AGENCY_ADAPTERS.find((x) => x.id === id)!
                          return ADAPTER_LOGO[id]
                            ? <img key={id} src={ADAPTER_LOGO[id]} alt="" title={a.name} width={16} height={16} />
                            : <span key={id} className="aw-runs-letter mono" title={a.name} aria-hidden="true">{a.name.slice(0, 2)}</span>
                        })}
                      </span>
                    </span>
                  </button>
                )
              })}
              {shown.length === 0 && <p className="hint">No template matches. Describe the agency above instead.</p>}
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="aw-body">
            <h1 id="aw-h">How do your agents run?</h1>
            <p className="hint">Your workers run on the agents you already use. Keep the template's mix or put every worker on one; the Lead runs on your default model. You can change any agent later on its page. Goose, ZeroClaw, OpenClaw and custom agents are in Settings → Agent engines.</p>
            <button type="button" role="radio" aria-checked={d.adapter === 'template'} className={'aw-adapter aw-mix' + (d.adapter === 'template' ? ' on' : '')} onClick={() => set({ adapter: 'template' })}>
              <span className="aw-tpl-top"><span className="aw-mark aw-letter mono" aria-hidden="true">Mix</span><span><strong>Use the template's mix</strong><span className="hint" style={{ display: 'block' }}>Recommended</span></span>
                {d.adapter === 'template' && <span className="aw-check"><Icon name="check" size={12} /></span>}</span>
              <span className="hint">{template ? template.roster.filter((m) => !m.lead).map((m) => `${agentName(m)}: ${adapterName(m.engine)}`).join(' · ') : 'Pick a template first; each worker then has an agent named for it.'}</span>
            </button>
            <div className="aw-adapters" role="radiogroup" aria-label="One adapter for every worker">
              {AGENCY_ADAPTERS.map((a) => {
                const e = engineOf(a.id)
                const installed = !!e?.resolvedPath
                const on = d.adapter === a.id
                return (
                  <button key={a.id} type="button" role="radio" aria-checked={on} className={'aw-adapter' + (on ? ' on' : '')} onClick={() => set({ adapter: a.id })}>
                    <span className="aw-tpl-top"><AdapterMark id={a.id} name={a.name} /><span><strong>{a.name}</strong><span className="hint" style={{ display: 'block' }}>{a.by}</span></span>
                      {on && <span className="aw-check"><Icon name="check" size={12} /></span>}</span>
                    <span className="hint">{a.description}</span>
                    <span className="card-foot">
                      <span className={'badge' + (installed ? ' green' : '')}>{installed ? 'Installed' : 'Not installed'}</span>
                      {!installed && <span className="btn btn-sm" aria-hidden="true">Install</span>}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="hint">Install shows you the official command before anything runs. You can finish without installing; agents then wait until it's installed.</p>
          </section>
        )}

        {step === 2 && d.model && (
          <section className="aw-body">
            <h1 id="aw-h">Pick the Lead's model</h1>
            <p className="hint">Your Lead plans and reviews with this model, and it becomes your default. Keys are encrypted on this computer and only go to their own provider. Ollama runs locally and needs no key.</p>
            {firstRun ? <ModelKeys settings={settings} onSaved={keySaved} /> : <p className="hint">Model keys are in Settings → Models.</p>}
            <h2 className="onboard-sub">Lead's model</h2>
            <DefaultModelPicker settings={settings} value={d.model} onChange={(m) => set({ model: m })} idPrefix="aw-dm" />
          </section>
        )}

        {step === 3 && (
          <section className="aw-body">
            <h1 id="aw-h">Skills</h1>
            <p className="hint">Your agents get the skills this kind of work needs, already included. Add packs for more; they install when you create the agency.</p>
            {included.length > 0 && (
              <div className="field"><span className="label">Included with {template?.name}</span>
                <span className="nt-chips">{included.map((s) => <span key={s} className="mono">{s}</span>)}</span>
              </div>
            )}
            <div className="tabs" role="tablist" aria-label="Skill sources">
              {(['claude', 'openai', 'github'] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={skillTab === t} className={skillTab === t ? 'on' : ''} onClick={() => setSkillTab(t)}>
                  {t === 'claude' ? 'Claude' : t === 'openai' ? 'OpenAI' : 'GitHub'}
                </button>
              ))}
            </div>
            {skillTab === 'claude' && (
              catalogError ? <p className="hint account-error" role="alert">Couldn't load Anthropic's skills from GitHub. {catalogError}</p>
                : !catalog ? <p className="hint" role="status">Loading from GitHub…</p>
                  : (
                    <label className={'aw-pack' + (d.packs.includes(CLAUDE_PACK) ? ' on' : '')}>
                      <input type="checkbox" checked={d.packs.includes(CLAUDE_PACK)} onChange={() => togglePack(CLAUDE_PACK)} />
                      <span>
                        <strong>Anthropic's open skills</strong>
                        <span className="hint" style={{ display: 'block' }}>The Apache 2.0 skills from github.com/anthropics/skills. Source-available ones are not installed.</span>
                        <span className="nt-chips" style={{ marginTop: 8 }}>{catalog.filter((c) => c.installable).map((c) => <span key={c.folder} className="mono">{c.name}</span>)}</span>
                      </span>
                    </label>
                  )
            )}
            {skillTab === 'openai' && <p className="hint">OpenAI skills: coming soon.</p>}
            {skillTab === 'github' && (
              !packs ? <p className="hint" role="status">Loading…</p> : (
                <div className="aw-packs">
                  {packs.filter((p) => p.group !== 'claude' && p.featured).map((p) => (
                    <label key={p.id} className={'aw-pack' + (d.packs.includes(p.id) || p.installed ? ' on' : '')}>
                      <input type="checkbox" disabled={p.installed || !p.installable} checked={p.installed || d.packs.includes(p.id)} onChange={() => togglePack(p.id)} />
                      <span>
                        <strong>{p.name}</strong>
                        <span className="mono hint" style={{ display: 'block' }}>{[p.author, p.license || 'no licence'].join(' · ')}{p.installed ? ' · installed' : ''}</span>
                        <span className="hint aw-clamp" style={{ display: 'block' }}>{p.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )
            )}
          </section>
        )}

        {step === 4 && (
          <section className="aw-body">
            <h1 id="aw-h">Where the work lives</h1>
            <p className="hint">You drop a brief in Inbox; the Lead turns it into cards, gives each one an owner and moves them along. Finished work waits in Review for you.</p>
            <div className="aw-board" aria-label="Board preview">
              {AGENCY_COLUMNS.map((c, i) => (
                <div key={c} className="aw-col">
                  <span className="aw-col-h">{c}<span className="mono">{i === 0 ? d.plan.length : 0}</span></span>
                  {i === 0 && d.plan.map((p) => {
                    const m = template ? planOwner(template, p) : undefined
                    return (
                      <div key={p} className="aw-cardp">
                        <span>{p}</span>
                        {m && <span className="aw-owner"><Head id={m.head} size={18} />{agentName(m)}</span>}
                      </div>
                    )
                  })}
                  {i === 0 && d.plan.length === 0 && <span className="hint aw-small">The Lead writes the first cards from your description.</span>}
                </div>
              ))}
            </div>
            <label className="aw-toggle">
              <span><strong>Let the Lead run cards automatically</strong>
                <span className="hint" style={{ display: 'block' }}>{d.autoRun ? 'The Lead plans the cards and starts them with their owners.' : 'The Lead only plans. You start each card when you\'re ready.'}</span></span>
              <input type="checkbox" checked={d.autoRun} onChange={(e) => set({ autoRun: e.target.checked })} />
            </label>
          </section>
        )}

        {step === 5 && (
          <section className="aw-body">
            <h1 id="aw-h">How the Lead talks to you</h1>
            <p className="hint">Your Lead messages you when there's news or a question: briefs, questions, work to review and digests. Only accounts you link can reply. Skip this and set it up later on the agency's Channel tab.</p>
            <div className="aw-adapters aw-three" role="radiogroup" aria-label="Channel">
              {([['telegram', 'Telegram', 'Your own bot; link your account with a one-time code.'], ['slack', 'Slack', 'A bot in your workspace, linked to one channel.'], ['none', 'Not now', 'Set it up later on the Channel tab.']] as const).map(([id, name, desc]) => (
                <button key={id} type="button" role="radio" aria-checked={d.channel === id} className={'aw-adapter' + (d.channel === id ? ' on' : '')} onClick={() => set({ channel: id })}>
                  <span className="aw-tpl-top"><span className="area-icon" aria-hidden="true"><Icon name={id === 'none' ? 'close' : 'chat'} size={16} /></span><strong>{name}</strong>
                    {d.channel === id && <span className="aw-check"><Icon name="check" size={12} /></span>}</span>
                  <span className="hint">{desc}</span>
                  {id === 'telegram' && tg?.connected && <span className="badge green">Connected</span>}
                </button>
              ))}
            </div>

            {d.channel === 'telegram' && tg && (
              <div className="aw-panel">
                <section className="cn-step">
                  <span className={'cn-num' + (tg.connected ? ' done' : '')}>{tg.connected ? <Icon name="check" size={13} /> : 1}</span>
                  <div className="cn-body">
                    <strong>Your bot</strong>
                    <span className="hint">In Telegram, message BotFather, send /newbot and paste the token here. It's stored encrypted on this computer.</span>
                    {tg.connected ? <span className="ok">Connected to {tg.botName ? `@${tg.botName}` : 'your bot'}</span> : (
                      <div className="row">
                        <input className="input" style={{ flex: 1, minWidth: 220 }} type="password" placeholder="Bot token" aria-label="Telegram bot token" value={tgToken} onChange={(e) => setTgToken(e.target.value)} />
                        <button type="button" className="btn btn-primary" disabled={!tgToken.trim() || busy}
                          onClick={() => { setBusy(true); setError(null); void window.tyslin.telegram.setToken(tgToken).then((s) => { setTg(s); setTgToken('') }, (e) => setError(errorText(e))).finally(() => setBusy(false)) }}>
                          Connect
                        </button>
                      </div>
                    )}
                  </div>
                </section>
                <section className={'cn-step' + (tg.connected ? '' : ' off')}>
                  <span className={'cn-num' + (tg.linked.length ? ' done' : '')}>{tg.linked.length ? <Icon name="check" size={13} /> : 2}</span>
                  <div className="cn-body">
                    <strong>Link your account</strong>
                    {tg.linked.map((l) => <span key={l.chatId} className="ok">Linked: {l.name}</span>)}
                    {tg.linkCode
                      ? <div className="cn-code">Send <code className="mono">/start {tg.linkCode}</code> to {tg.botName ? `@${tg.botName}` : 'your bot'}. The code works for 10 minutes.</div>
                      : <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} disabled={!tg.connected} onClick={() => void window.tyslin.telegram.linkCode().then(setTg)}>Get a link code</button>}
                  </div>
                </section>
              </div>
            )}
            {d.channel === 'slack' && (
              <div className="aw-panel">
                <section className="cn-step off">
                  <span className="cn-num">1</span>
                  <div className="cn-body">
                    <strong>Your Slack bot</strong>
                    <span className="hint">Paste the bot token from your Slack app, then link one channel with a one-time code. Do this on the agency's Channel tab once it exists.</span>
                    <input className="input" type="password" placeholder="xoxb-…" aria-label="Slack bot token" disabled />
                  </div>
                </section>
              </div>
            )}
            {d.channel !== 'none' && (
              <fieldset className="aw-notify">
                <legend className="label">What the Lead sends</legend>
                {([['all', 'Everything', 'Briefs, questions, reviews and the daily digest'], ['questions', 'Questions and reviews', 'Only when the Lead needs you'], ['digest', 'Digest only', 'One summary a day']] as const).map(([id, name, desc]) => (
                  <label key={id} className="np-choice">
                    <input type="radio" name="aw-notify" checked={d.notify === id} onChange={() => set({ notify: id })} />
                    <span><strong>{name}</strong><span className="hint">{desc}</span></span>
                  </label>
                ))}
              </fieldset>
            )}
          </section>
        )}

        {step === 6 && (
          <section className="aw-body">
            <Pose pose={2} height={90} className="aw-pose" />
            <h1 id="aw-h">Review and create</h1>
            <p className="hint">{d.goal || d.description}</p>
            <div className="nt-chart aw-chart">
              <div className="nt-you"><span className="nt-u">{(firstName ?? 'Y').slice(0, 1).toUpperCase()}</span><strong>You</strong></div>
              {lead && (
                <>
                  <span className="nt-line" />
                  <div className="nt-person nt-lead"><Head id={lead.head} size={40} /><span><strong>{agentName(lead)}</strong><small>Plans the work, hands out cards and reports to you · {adapterName('builtin')}</small></span></div>
                </>
              )}
              {workers.length > 0 && (
                <>
                  <span className="nt-line" />
                  <div className="nt-members" style={{ gridTemplateColumns: `repeat(${workers.length}, minmax(0, 1fr))` }}>
                    {workers.map((m) => (
                      <div key={m.first} className="nt-person nt-member">
                        <Head id={m.head} size={36} />
                        <strong>{agentName(m)}</strong>
                        <small>{m.job}</small>
                        <span className="mono nt-access">{adapterName(engineFor(m))}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {!lead && <p className="hint" style={{ marginTop: 12 }}>The Lead drafts the roster from your description after it's created.</p>}
            </div>
            <dl className="aw-summary">
              <dt>Folder</dt><dd className="mono">{folder}</dd>
              <dt>Adapter</dt><dd>{adapterName(d.adapter)}{d.adapter !== 'template' && !engineOf(d.adapter)?.resolvedPath ? ' (not installed yet)' : ''}</dd>
              <dt>Lead's model</dt><dd className="mono">{d.model ? `${PROVIDER_NAME[d.model.provider]} · ${d.model.model}` : ''}</dd>
              <dt>Skills</dt><dd>{included.length} included{d.packs.length ? `, ${d.packs.length} pack${d.packs.length > 1 ? 's' : ''} to install` : ''}</dd>
              <dt>Board</dt><dd>{AGENCY_COLUMNS.join(' → ')} · {d.plan.length} cards · {d.autoRun ? 'Lead runs cards' : 'you run cards'}</dd>
              <dt>Channel</dt><dd>{d.channel === 'none' ? 'Not now' : `${d.channel === 'telegram' ? 'Telegram' : 'Slack'} · ${d.notify === 'all' ? 'everything' : d.notify === 'questions' ? 'questions and reviews' : 'digest only'}`}</dd>
              <dt>Lead's task</dt><dd>{template ? `${template.leadTask.schedule.repeat === 'weekly' ? 'Mondays' : 'Weekdays'} at ${template.leadTask.schedule.time}: ${template.leadTask.prompt}` : 'Weekdays at 09:00: plan the Inbox'}</dd>
            </dl>
          </section>
        )}

        {error && <p className="login-error" role="alert">{error}</p>}
        <footer className="onboard-actions aw-actions">
          {step > 0 ? <button type="button" className="btn" onClick={() => setStep(step - 1)} disabled={busy}>Back</button>
            : onCancel ? <button type="button" className="btn" onClick={onCancel} disabled={busy}>Cancel</button> : <span />}
          <span className="hint aw-stepname">{STEPS[step]}</span>
          <button type="submit" className="btn btn-primary" disabled={!canNext || busy}>
            {step < STEPS.length - 1 ? 'Continue' : busy ? 'Creating…' : 'Create agency'}
          </button>
        </footer>
      </form>
    </main>
  )
}
