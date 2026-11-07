import { useEffect, useState } from 'react'
import type { Agent, McpServerInfo, McpServerInput } from '@shared/types'
import { MCP_PRESETS, type McpPreset } from '@shared/mcpPresets'
import { ENGINE_NAMES } from '@shared/engines'
import { Avatar } from '../components/Avatar'
import { runsOnLabel } from '../components/RunsOnBadge'
import { Icon } from '../components/Icon'

interface Props {
  agents: Agent[]
  /** The open agency: its agents get a switch per integration. */
  team?: { name: string; members: Agent[] }
}

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const initials = (s: string): string => s.replace(/[^a-z0-9]/gi, '').slice(0, 2).replace(/^./, (c) => c.toUpperCase()) || '··'
const titleOf = (s: McpServerInfo): string => MCP_PRESETS.find((p) => p.id === s.preset)?.title ?? s.name
const canUse = (a: Agent): boolean => a.engine !== 'builtin'
const ADAPTERS = [ENGINE_NAMES['claude-code'], ENGINE_NAMES.codex, ENGINE_NAMES['gemini-cli'], ENGINE_NAMES.goose].join(', ')

type Draft = { id?: string; preset: McpPreset | null; name: string; transport: 'http' | 'stdio'; url: string; commandLine: string; token: string; headers: string; env: string; keepSecrets: boolean }
const blank = (preset: McpPreset | null): Draft => ({ preset, name: preset?.name ?? '', transport: 'http', url: '', commandLine: '', token: '', headers: '', env: '', keepSecrets: false })

/**
 * Integrations: MCP servers agents use as tools (GitHub, Linear, Stripe, or any server the user adds). Added once per
 * organization, switched on per agent. Works for agents on external adapters; built-in-model agents are marked.
 */
export function IntegrationsPage({ agents, team }: Props): JSX.Element {
  const [list, setList] = useState<McpServerInfo[] | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = async (): Promise<void> => setList(await window.tyslin.integrations.list())
  useEffect(() => { void load() }, [])
  const replace = (s: McpServerInfo): void => setList((l) => (l ?? []).some((x) => x.id === s.id) ? l!.map((x) => (x.id === s.id ? s : x)) : [...(l ?? []), s])

  const save = async (): Promise<void> => {
    if (!draft) return
    setBusy(true)
    setError('')
    try {
      const input: McpServerInput = {
        id: draft.id, name: draft.name, preset: draft.preset?.id ?? '', transport: draft.preset ? 'http' : draft.transport,
        url: draft.url, commandLine: draft.commandLine,
        token: draft.preset && !(draft.keepSecrets && !draft.token.trim()) ? draft.token : undefined,
        headers: !draft.preset && !(draft.keepSecrets && !draft.headers.trim()) ? draft.headers : undefined,
        env: !draft.preset && !(draft.keepSecrets && !draft.env.trim()) ? draft.env : undefined,
        // A new integration starts on for the agency's agents that can use it.
        agentIds: draft.id ? undefined : (team?.members ?? []).filter(canUse).map((a) => a.id)
      }
      const saved = await window.tyslin.integrations.save(input)
      replace(saved)
      setDraft(null)
      void test(saved.id)
    } catch (err) { setError(errText(err)) } finally { setBusy(false) }
  }
  const test = async (id: string): Promise<void> => {
    setTesting(id)
    try { replace(await window.tyslin.integrations.test(id)) } finally { setTesting(null) }
  }
  const remove = async (s: McpServerInfo): Promise<void> => {
    if (!window.confirm(`Remove ${titleOf(s)}? Agents stop using it and its saved token is deleted.`)) return
    await window.tyslin.integrations.remove(s.id)
    setList((l) => (l ?? []).filter((x) => x.id !== s.id))
  }
  const toggle = async (s: McpServerInfo, a: Agent): Promise<void> => {
    const ids = s.agentIds.includes(a.id) ? s.agentIds.filter((x) => x !== a.id) : [...s.agentIds, a.id]
    replace(await window.tyslin.integrations.setAgents(s.id, ids))
  }
  const edit = (s: McpServerInfo): void => {
    setError('')
    setDraft({ ...blank(MCP_PRESETS.find((p) => p.id === s.preset) ?? null), id: s.id, name: s.name, transport: s.transport, url: s.url,
      commandLine: [s.command, ...s.args].map((x) => (/\s/.test(x) ? `"${x}"` : x)).join(' '), keepSecrets: s.secretNames.length > 0 })
  }

  const added = new Set((list ?? []).map((s) => s.preset).filter(Boolean))

  return (
    <div className="page integrations">
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="eyebrow">{team ? team.name : 'Organization'}</span>
          <h1>Integrations</h1>
          <p className="hint" style={{ margin: 0, maxWidth: 680 }}>
            Give your agents tools from the apps you use, through MCP servers. Tokens are encrypted on this computer and only go to that app's server.
            Agents on {ADAPTERS} can use them.
          </p>
        </div>
      </header>

      {draft && (
        <section className="box int-form" aria-labelledby="int-form-h">
          <div className="box-head">
            <h2 id="int-form-h">{draft.id ? `Edit ${draft.preset?.title ?? draft.name}` : draft.preset ? `Connect ${draft.preset.title}` : 'Add an MCP server'}</h2>
            <p className="hint">{draft.preset ? <>{draft.preset.line} <a href={draft.preset.docsUrl} target="_blank" rel="noreferrer">Setup guide</a></> : 'Any MCP server: a remote address, or a command that runs on this computer.'}</p>
          </div>
          {draft.preset ? (
            <div className="field">
              <div className="model-key-head">
                <label htmlFor="int-token">{draft.preset.tokenLabel}</label>
                <a href={draft.preset.tokenUrl} target="_blank" rel="noreferrer" className="hint">Create one</a>
              </div>
              <input id="int-token" type="password" className="input mono" autoComplete="off" autoFocus value={draft.token}
                placeholder={draft.keepSecrets ? '•••••••• saved (type to replace)' : draft.preset.tokenPlaceholder} onChange={(e) => setDraft({ ...draft, token: e.target.value })} />
              <span className="hint">{draft.preset.tokenHint}</span>
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="int-name">Name</label>
                <input id="int-name" className="input mono" value={draft.name} placeholder="e.g. deepwiki" autoFocus onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                <span className="hint">Your agents see its tools under this name. Lowercase letters, digits and dashes.</span>
              </div>
              <div className="seg" role="radiogroup" aria-label="How the server runs">
                <button type="button" role="radio" aria-checked={draft.transport === 'http'} className={draft.transport === 'http' ? 'on' : ''} onClick={() => setDraft({ ...draft, transport: 'http' })}>Remote address</button>
                <button type="button" role="radio" aria-checked={draft.transport === 'stdio'} className={draft.transport === 'stdio' ? 'on' : ''} onClick={() => setDraft({ ...draft, transport: 'stdio' })}>Command on this computer</button>
              </div>
              {draft.transport === 'http' ? (
                <>
                  <div className="field">
                    <label htmlFor="int-url">Server address</label>
                    <input id="int-url" className="input mono" value={draft.url} placeholder="https://example.com/mcp" onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="int-headers">Headers <span className="hint">(optional, one per line)</span></label>
                    <textarea id="int-headers" className="input textarea mono" rows={2} value={draft.headers} spellCheck={false}
                      placeholder={draft.keepSecrets ? 'Saved. Type to replace all headers.' : 'Authorization: Bearer your-token'} onChange={(e) => setDraft({ ...draft, headers: e.target.value })} />
                  </div>
                </>
              ) : (
                <>
                  <div className="field">
                    <label htmlFor="int-cmd">Command</label>
                    <input id="int-cmd" className="input mono" value={draft.commandLine} placeholder="npx -y some-mcp-server" spellCheck={false} onChange={(e) => setDraft({ ...draft, commandLine: e.target.value })} />
                    <span className="hint">Runs with your user account each time an agent starts. Only add commands from sources you trust.</span>
                  </div>
                  <div className="field">
                    <label htmlFor="int-env">Environment variables <span className="hint">(optional, one per line)</span></label>
                    <textarea id="int-env" className="input textarea mono" rows={2} value={draft.env} spellCheck={false}
                      placeholder={draft.keepSecrets ? 'Saved. Type to replace all variables.' : 'API_TOKEN=your-token'} onChange={(e) => setDraft({ ...draft, env: e.target.value })} />
                  </div>
                </>
              )}
            </>
          )}
          {error && <p className="hint account-error" role="alert">{error}</p>}
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : draft.id ? 'Save and test' : 'Connect and test'}</button>
            <button type="button" className="btn" onClick={() => { setDraft(null); setError('') }}>Cancel</button>
          </div>
        </section>
      )}

      {list && list.length > 0 && (
        <section className="int-list" aria-label="Connected integrations">
          {list.map((s) => {
            const t = s.lastTest
            const users = agents.filter((a) => s.agentIds.includes(a.id))
            return (
              <article key={s.id} className={'box int-card' + (t?.ok ? ' on' : '')} aria-labelledby={'int-' + s.id}>
                <div className="int-head">
                  <span className="runs-on tone-ink int-tile" aria-hidden="true">{initials(titleOf(s))}</span>
                  <div className="int-title">
                    <h2 id={'int-' + s.id}>{titleOf(s)}</h2>
                    <span className="mono hint int-addr">{s.transport === 'http' ? s.url : [s.command, ...s.args].join(' ')}</span>
                  </div>
                  {testing === s.id ? <span className="status-pill working">Testing…</span>
                    : !t ? <span className="status-pill">Not tested</span>
                    : t.ok ? <span className="status-pill ready">Working · {t.tools?.length ?? 0} tools</span>
                    : <span className="status-pill failed">Not working</span>}
                </div>
                {t && !t.ok && testing !== s.id && <p className="hint account-error" role="alert">{t.error}</p>}
                {t?.ok && t.tools && t.tools.length > 0 && (
                  <details className="int-tools">
                    <summary className="hint">Tools it gives your agents</summary>
                    <div className="int-tool-list">{t.tools.map((n) => <span key={n} className="chip">{n}</span>)}</div>
                  </details>
                )}
                {team ? (
                  <div className="sk-users">
                    <span className="hint">Who uses it in {team.name}</span>
                    <div className="sk-agents">
                      {team.members.map((a) => {
                        const on = s.agentIds.includes(a.id)
                        const ok = canUse(a)
                        return (
                          <div key={a.id} className={'card sk-agent' + (on && ok ? ' on' : '')}>
                            <span className="sk-agent-top">
                              <Avatar shape={a.shape} tone={a.tone} head={a.head} mascot={a.isMascot} size={32} />
                              <button type="button" role="switch" aria-checked={on && ok} aria-label={`${a.name} uses ${titleOf(s)}`} disabled={!ok}
                                className={'switch' + (on && ok ? ' on' : '')} onClick={() => void toggle(s, a)} />
                            </span>
                            <strong>{a.name}</strong>
                            <span className="mono hint">{ok ? runsOnLabel(a) : 'Built-in model: not yet'}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="hint" style={{ margin: 0 }}>{users.length ? `Used by ${users.map((a) => a.name).join(', ')}.` : 'Not used by any agent yet. Open an agency to switch it on for its agents.'}</p>
                )}
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" className="btn" disabled={testing === s.id} onClick={() => void test(s.id)}>Test</button>
                  <button type="button" className="btn btn-ghost" onClick={() => edit(s)}>Edit</button>
                  <button type="button" className="btn btn-ghost" onClick={() => void remove(s)}>Remove</button>
                </div>
              </article>
            )
          })}
        </section>
      )}

      <section aria-labelledby="int-add-h" className="int-add">
        <h2 id="int-add-h" className="int-add-h">{list && list.length ? 'Add another' : 'Add your first integration'}</h2>
        <div className="int-presets">
          {MCP_PRESETS.map((p) => (
            <button key={p.id} type="button" className="card int-preset" disabled={added.has(p.id)} onClick={() => { setError(''); setDraft(blank(p)) }}>
              <span className="runs-on tone-ink int-tile" aria-hidden="true">{initials(p.title)}</span>
              <strong>{p.title}</strong>
              <span className="hint">{p.line}</span>
              <span className="int-preset-foot mono">{added.has(p.id) ? 'Connected' : `Needs ${p.tokenLabel.toLowerCase()}`}</span>
            </button>
          ))}
          <button type="button" className="card int-preset int-custom" onClick={() => { setError(''); setDraft(blank(null)) }}>
            <span className="runs-on tone-paper int-tile" aria-hidden="true"><Icon name="plus" size={16} /></span>
            <strong>Any MCP server</strong>
            <span className="hint">A remote address or a local command, with its own headers or variables.</span>
            <span className="int-preset-foot mono">Custom</span>
          </button>
        </div>
      </section>
    </div>
  )
}
