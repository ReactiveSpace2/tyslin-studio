import { useEffect, useState } from 'react'
import type { Agent, SlackStatus, TelegramNotify, TelegramStatus } from '@shared/types'
import { Avatar } from '../components/Avatar'
import { ToggleRow } from '../components/CreateAgentModal'
import { Icon } from '../components/Icon'

type Channel = 'telegram' | 'slack' | 'discord' | 'whatsapp' | 'email'

interface Props {
  agents: Agent[]
  onOpenAgent: (a: Agent) => void
  onChanged: () => void
  /** Shown at the top: the open agency's Lead and what it sends. */
  header?: React.ReactNode
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))

/**
 * Connectors → Channels: reach your agents from chat apps. Telegram works today (your own bot,
 * polled from this computer, linked accounts only); the others are marked honestly.
 */
export function ConnectorsPage({ agents, onOpenAgent, onChanged, header }: Props): JSX.Element {
  const [pick, setPick] = useState<Channel>('telegram')
  const [tg, setTg] = useState<TelegramStatus | null>(null)
  const [sl, setSl] = useState<SlackStatus | null>(null)
  const [slToken, setSlToken] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = (): void => { void window.tyslin.telegram.status().then(setTg); void window.tyslin.slack.status().then(setSl) }
  useEffect(() => {
    load()
    const t = setInterval(load, 4000) // the linked list changes when you send /start from Telegram
    return () => clearInterval(t)
  }, [])

  const saveToken = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setTg(await window.tyslin.telegram.setToken(token))
      setToken('')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const disconnect = async (): Promise<void> => {
    if (!window.confirm('Disconnect Telegram? Linked accounts are forgotten and agents stop answering there.')) return
    setTg(await window.tyslin.telegram.setToken(''))
  }
  const setNotify = async (p: Partial<TelegramNotify>): Promise<void> => setTg(await window.tyslin.telegram.setNotify(p))
  const saveSlack = async (): Promise<void> => {
    setBusy(true); setError(null)
    try { setSl(await window.tyslin.slack.setToken(slToken)); setSlToken('') } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const disconnectSlack = async (): Promise<void> => {
    if (!window.confirm('Disconnect Slack? Linked channels are forgotten and Leads stop answering there.')) return
    setSl(await window.tyslin.slack.setToken(''))
  }
  const toggleAgent = async (a: Agent): Promise<void> => {
    await window.tyslin.agents.save({ ...a, channels: { ...a.channels, telegram: !a.channels.telegram } })
    onChanged()
  }

  const CHANNELS: [Channel, string, string, string, string][] = [
    ['telegram', 'Telegram', 'Chat, task results and approvals from your phone', tg?.connected ? 'Connected' : 'Set up', tg?.connected ? 'green' : ''],
    ['slack', 'Slack', 'Your agency Leads in one of your channels', sl?.connected ? 'Connected' : 'Set up', sl?.connected ? 'green' : ''],
    ['discord', 'Discord', 'A bot in your server for your agents', 'Coming soon', 'soon'],
    ['whatsapp', 'WhatsApp', 'Needs a public address for messages', 'Hosted plan', 'soon'],
    ['email', 'Email', 'An inbox address for each agent', 'Coming soon', 'soon']
  ]
  const team = agents.filter((a) => a.kind === 'agent' || a.kind === 'assistant')

  return (
    <div className="connectors">
      <div className="cn-list">
        {header}
        <span className="eyebrow">Connectors</span>
        <h1>Channels</h1>
        <p className="lead" style={{ fontSize: 14 }}>Talk to your agents from the chat apps you already use, get task results there and approve file changes on the go. Only accounts you link can message your agents.</p>
        {CHANNELS.map(([id, name, desc, badge, kind]) => (
          <button key={id} type="button" className={'cn-item' + (pick === id ? ' on' : '')} aria-pressed={pick === id} onClick={() => setPick(id)}>
            <span className="area-icon" aria-hidden="true"><Icon name={id === 'email' ? 'file' : 'chat'} size={18} /></span>
            <span style={{ minWidth: 0, flex: 1 }}><strong>{name}</strong><span className="hint" style={{ display: 'block' }}>{desc}</span></span>
            <span className={'badge ' + kind}>{badge}</span>
          </button>
        ))}
      </div>

      <div className="cn-panel">
        {pick === 'telegram' && tg && (
          <>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 22 }}>Telegram</h2>
              {tg.connected && <button type="button" className="btn" onClick={() => void disconnect()}>Disconnect</button>}
            </div>
            {tg.connected && tg.error && <p className="hint account-error" role="alert">Can't reach Telegram right now: {tg.error}</p>}

            <section className="cn-step">
              <span className={'cn-num' + (tg.connected ? ' done' : '')}>{tg.connected ? <Icon name="check" size={13} /> : 1}</span>
              <div className="cn-body">
                <strong>Your bot</strong>
                <span className="hint">In Telegram, message BotFather, send /newbot and follow the steps. Paste the token it gives you. It's stored encrypted on this computer, like your API keys.</span>
                {tg.connected ? <span className="ok">Connected to {tg.botName ? `@${tg.botName}` : 'your bot'}</span> : (
                  <form className="row" onSubmit={(e) => { e.preventDefault(); void saveToken() }}>
                    <input className="input" style={{ flex: 1, minWidth: 260 }} type="password" placeholder="Bot token" aria-label="Telegram bot token" value={token} onChange={(e) => setToken(e.target.value)} />
                    <button type="submit" className="btn btn-primary" disabled={!token.trim() || busy}>{busy ? 'Checking…' : 'Connect'}</button>
                  </form>
                )}
                {error && <span className="hint account-error" role="alert">{error}</span>}
              </div>
            </section>

            <section className={'cn-step' + (tg.connected ? '' : ' off')}>
              <span className={'cn-num' + (tg.linked.length ? ' done' : '')}>{tg.linked.length ? <Icon name="check" size={13} /> : 2}</span>
              <div className="cn-body">
                <strong>Link your account</strong>
                <span className="hint">Only linked accounts can talk to your agents; messages from anyone else are ignored.</span>
                {tg.linked.map((l) => (
                  <div key={l.chatId} className="row"><span className="ok">Linked: {l.name}</span>
                    <button type="button" className="link-btn" onClick={() => void window.tyslin.telegram.unlink(l.chatId).then(setTg)}>Unlink</button></div>
                ))}
                {tg.linkCode ? (
                  <div className="cn-code">Send <code className="mono">/start {tg.linkCode}</code> to {tg.botName ? `@${tg.botName}` : 'your bot'} from your Telegram. The code works for 10 minutes.</div>
                ) : (
                  <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} disabled={!tg.connected} onClick={() => void window.tyslin.telegram.linkCode().then(setTg)}>
                    {tg.linked.length ? 'Link another account' : 'Get a link code'}
                  </button>
                )}
              </div>
            </section>

            <section className={'cn-step' + (tg.connected ? '' : ' off')}>
              <span className="cn-num">3</span>
              <div className="cn-body">
                <strong>Who answers here</strong>
                <span className="hint">Messages go to the first agent on this list; switch with /name (for example /atlas). /agents lists them.</span>
                <div className="ap-list">
                  {team.map((a) => (
                    <div key={a.id} className="toggle-row">
                      <button type="button" className="cn-agent" onClick={() => onOpenAgent(a)}><Avatar shape={a.shape} tone={a.tone} head={a.head} mascot={a.isMascot} size={26} /><strong>{a.name}</strong><span className="hint">/{a.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}</span></button>
                      <button type="button" role="switch" aria-checked={a.channels.telegram} aria-label={`${a.name} answers on Telegram`} className={'switch' + (a.channels.telegram ? ' on' : '')} disabled={!tg.connected} onClick={() => void toggleAgent(a)} />
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className={'cn-step' + (tg.connected ? '' : ' off')}>
              <span className="cn-num">4</span>
              <div className="cn-body">
                <strong>What reaches you</strong>
                <ToggleRow name="Task results" desc="When a scheduled task finishes, with the start of its reply." on={tg.notify.results} disabled={!tg.connected} onChange={(v) => void setNotify({ results: v })} />
                <ToggleRow name="File changes to approve" desc="From any chat or task, with Approve and Reject buttons." on={tg.notify.approvals} disabled={!tg.connected} onChange={(v) => void setNotify({ approvals: v })} />
                <ToggleRow name="Failures" desc="When a scheduled task fails." on={tg.notify.failures} disabled={!tg.connected} onChange={(v) => void setNotify({ failures: v })} />
              </div>
            </section>
            <p className="hint">Agents answer while Tyslin is open on this computer; messages sent while it's closed are picked up when you open it. Each agent keeps one "Telegram" chat in the app, so you can read the whole conversation there.</p>
          </>
        )}
        {pick === 'slack' && sl && (
          <>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 22 }}>Slack</h2>
              {sl.connected && <button type="button" className="btn" onClick={() => void disconnectSlack()}>Disconnect</button>}
            </div>
            {sl.connected && sl.error && <p className="hint account-error" role="alert">Can't reach Slack right now: {sl.error}</p>}
            <section className="cn-step">
              <span className={'cn-num' + (sl.connected ? ' done' : '')}>{sl.connected ? <Icon name="check" size={13} /> : 1}</span>
              <div className="cn-body">
                <strong>Your Slack app</strong>
                <span className="hint">Create an app at api.slack.com/apps, add the bot scopes chat:write, channels:read, groups:read, channels:history and groups:history, install it to your workspace and paste the Bot User OAuth Token. It's stored encrypted on this computer.</span>
                {sl.connected ? <span className="ok">Connected as @{sl.botName}</span> : (
                  <form className="row" onSubmit={(e) => { e.preventDefault(); void saveSlack() }}>
                    <input className="input" style={{ flex: 1, minWidth: 260 }} type="password" placeholder="xoxb-…" aria-label="Slack bot token" value={slToken} onChange={(e) => setSlToken(e.target.value)} />
                    <button type="submit" className="btn btn-primary" disabled={!slToken.trim() || busy}>{busy ? 'Checking…' : 'Connect'}</button>
                  </form>
                )}
                {error && <span className="hint account-error" role="alert">{error}</span>}
              </div>
            </section>
            <section className={'cn-step' + (sl.connected ? '' : ' off')}>
              <span className={'cn-num' + (sl.linked.length ? ' done' : '')}>{sl.linked.length ? <Icon name="check" size={13} /> : 2}</span>
              <div className="cn-body">
                <strong>Link a channel</strong>
                <span className="hint">Invite the bot to the channel (/invite @{sl.botName || 'yourbot'}), then post the code there. Only linked channels can talk to your Leads; everything else is ignored.</span>
                {sl.linked.map((l) => (
                  <div key={l.channelId} className="row"><span className="ok">Linked: #{l.name}</span>
                    <button type="button" className="link-btn" onClick={() => void window.tyslin.slack.unlink(l.channelId).then(setSl)}>Unlink</button></div>
                ))}
                {sl.linkCode ? (
                  <div className="cn-code">Post <code className="mono">tyslin {sl.linkCode}</code> in the channel. The code works for 10 minutes.</div>
                ) : (
                  <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} disabled={!sl.connected} onClick={() => void window.tyslin.slack.linkCode().then(setSl)}>
                    {sl.linked.length ? 'Link another channel' : 'Get a link code'}
                  </button>
                )}
              </div>
            </section>
            <section className={'cn-step' + (sl.connected ? '' : ' off')}>
              <span className="cn-num">3</span>
              <div className="cn-body">
                <strong>Who answers here</strong>
                <span className="hint">Only agency Leads talk to you on Slack. A reply in a linked channel goes to the Lead that last wrote there (or the first agency's Lead). Workers never message you.</span>
              </div>
            </section>
            <p className="hint">Tyslin checks the linked channels every few seconds while it's open on this computer; messages sent while it's closed are picked up when you open it.</p>
          </>
        )}
        {pick === 'discord' && <Soon name="Discord" text="A bot in your Discord server, connected from this computer, with the same linked-accounts rule as Telegram." />}
        {pick === 'whatsapp' && <Soon name="WhatsApp" text="WhatsApp only delivers messages to a public web address, which a desktop app on your computer doesn't have. It will come with the hosted plan, which runs that address for you." />}
        {pick === 'email' && <Soon name="Email" text="Email an agent at its own address and get replies, task results and approval requests in your inbox." />}
      </div>
    </div>
  )
}

function Soon({ name, text }: { name: string; text: string }): JSX.Element {
  return (
    <>
      <h2 style={{ fontSize: 22 }}>{name}</h2>
      <div className="cn-soon">{text} Telegram works today.</div>
    </>
  )
}
