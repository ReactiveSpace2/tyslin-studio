import { useEffect, useState } from 'react'
import type { Agent, SlackStatus, TelegramNotify, TelegramStatus } from '@shared/types'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

type Channel = 'telegram' | 'slack' | 'discord' | 'whatsapp' | 'email'

interface Props {
  agents: Agent[]
  onOpenAgent: (a: Agent) => void
  onChanged: () => void
  /** Shown at the top: the open agency's Lead and what it sends. */
  header?: React.ReactNode
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))

const HINT = 'text-[13px] leading-snug text-muted-foreground'

/** A step's number, or a check once it's done (lime fill, ink text). */
function StepNum({ n, done }: { n: number; done?: boolean }): JSX.Element {
  return (
    <span className={cn('grid size-7 flex-none place-items-center rounded-full border font-mono text-xs',
      done ? 'border-transparent bg-lime text-on-lime' : 'border-border-strong text-muted-foreground')}>
      {done ? <Icon name="check" size={13} /> : n}
    </span>
  )
}

/** A card for one step: number, title and hint on top, then its content. `off` dims it until the bot is connected. */
function Step({ n, done, off, title, hint, action, children }: { n: number; done?: boolean; off?: boolean; title: string; hint?: React.ReactNode; action?: React.ReactNode; children?: React.ReactNode }): JSX.Element {
  return (
    <section className={cn('flex gap-3.5', off && 'opacity-55')}>
      <StepNum n={n} done={done} />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h3 className="text-sm font-semibold">{title}</h3>
            {hint && <span className={HINT}>{hint}</span>}
          </div>
          {action}
        </div>
        {children}
      </div>
    </section>
  )
}

/** A named setting with a switch on the right. */
function SwitchRow({ name, desc, on, disabled, onChange }: { name: string; desc: string; on: boolean; disabled?: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <div className="flex min-h-11 items-center gap-4 rounded-lg border border-border bg-card px-4 py-2.5">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <strong className="text-sm font-medium">{name}</strong>
        <span className={HINT}>{desc}</span>
      </span>
      <Switch checked={on} disabled={disabled} aria-label={name} onCheckedChange={onChange} />
    </div>
  )
}

/** The channel's card header: name, what it does, its status. */
function ChannelHead({ name, desc, badge, kind, action }: { name: string; desc: string; badge: string; kind: string; action?: React.ReactNode }): JSX.Element {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="text-lg font-semibold">{name}</h2>
        <span className={HINT}>{desc}</span>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={kind === 'green' ? 'soft' : kind === 'soon' ? 'outline' : 'secondary'} className="h-6">
          {kind === 'green' && <span className="size-1.5 rounded-full bg-green" aria-hidden="true" />}{badge}
        </Badge>
        {action}
      </div>
    </div>
  )
}

/** The one-time code to send, in a dashed box. */
function CodeRow({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="rounded-lg border border-dashed border-green bg-lime-soft px-3.5 py-2.5 text-[13px] leading-relaxed [&_code]:font-mono [&_code]:text-[14px] [&_code]:font-semibold">{children}</div>
}

/** Linked accounts or channels with Unlink. */
function LinkedTable({ head, rows }: { head: string; rows: { key: string | number; name: string; onUnlink: () => void }[] }): JSX.Element | null {
  if (!rows.length) return null
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-auto px-0 py-2 pr-4 text-xs text-muted-foreground">{head}</TableHead>
          <TableHead className="h-auto w-px px-0 py-2"><span className="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key} className="hover:bg-transparent">
            <TableCell className="px-0 py-2 pr-4"><span className="inline-flex items-center gap-2 text-green"><Icon name="check" size={13} />Linked: {r.name}</span></TableCell>
            <TableCell className="px-0 py-2 text-right"><Button variant="ghost" size="sm" onClick={r.onUnlink}>Unlink</Button></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

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
  const current = CHANNELS.find((c) => c[0] === pick)!
  const head = (action?: React.ReactNode): JSX.Element => <ChannelHead name={current[1]} desc={current[2]} badge={current[3]} kind={current[4]} action={action} />
  const errorLine = error && <span className="text-[13px] text-destructive" role="alert">{error}</span>

  return (
    <div className="h-full overflow-y-auto text-foreground">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-8 pt-7 pb-10">
        <div className="flex max-w-[720px] flex-col gap-1.5">
          <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Connectors</span>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Channels</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">Talk to your agents from the chat apps you already use, get task results there and approve file changes on the go. Only accounts you link can message your agents.</p>
        </div>

        <TabsList aria-label="Channels" className="h-auto flex-wrap">
          {CHANNELS.map(([id, name, , , kind]) => (
            <TabsTrigger key={id} active={pick === id} onClick={() => setPick(id)} className="h-[30px] flex-none">
              <Icon name={id === 'email' ? 'file' : 'chat'} size={14} />{name}
              {kind === 'green' && <span className="size-1.5 rounded-full bg-green" aria-label="Connected" role="img" />}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex flex-wrap items-start gap-4">
          <div className={cn('flex min-w-0 flex-col gap-4', header ? 'flex-[999_1_460px]' : 'w-full max-w-[860px]')}>
            {pick === 'telegram' && tg && (
              <>
                <Card className="gap-5 px-6 py-5">
                  {head(tg.connected ? <Button variant="outline" size="sm" onClick={() => void disconnect()}>Disconnect</Button> : undefined)}
                  {tg.connected && tg.error && <p className="text-[13px] text-destructive" role="alert">Can't reach Telegram right now: {tg.error}</p>}

                  <Step n={1} done={tg.connected} title="Your bot"
                    hint="In Telegram, message BotFather, send /newbot and follow the steps. Paste the token it gives you. It's stored encrypted on this computer, like your API keys.">
                    {tg.connected ? (
                      <div className="flex items-center gap-3 rounded-lg border border-border bg-panel px-3.5 py-3">
                        <span className="grid size-8 flex-none place-items-center rounded-md bg-card font-mono text-xs" aria-hidden="true">TG</span>
                        <span className="text-sm font-medium text-green">Connected to {tg.botName ? `@${tg.botName}` : 'your bot'}</span>
                      </div>
                    ) : (
                      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void saveToken() }}>
                        <Input className="min-w-[260px] flex-1 font-mono" type="password" placeholder="Bot token" aria-label="Telegram bot token" value={token} onChange={(e) => setToken(e.target.value)} />
                        <Button type="submit" disabled={!token.trim() || busy}>{busy ? 'Checking…' : 'Connect'}</Button>
                      </form>
                    )}
                    {errorLine}
                  </Step>

                  <Separator />

                  <Step n={2} done={tg.linked.length > 0} off={!tg.connected} title="Link your account"
                    hint="Only linked accounts can talk to your agents; messages from anyone else are ignored."
                    action={!tg.linkCode && (
                      <Button size="sm" disabled={!tg.connected} onClick={() => void window.tyslin.telegram.linkCode().then(setTg)}>
                        {tg.linked.length ? 'Link another account' : 'Get a link code'}
                      </Button>
                    )}>
                    {tg.linkCode && (
                      <CodeRow>Send <code>/start {tg.linkCode}</code> to {tg.botName ? `@${tg.botName}` : 'your bot'} from your Telegram. The code works for 10 minutes.</CodeRow>
                    )}
                    <LinkedTable head="Account" rows={tg.linked.map((l) => ({ key: l.chatId, name: l.name, onUnlink: () => void window.tyslin.telegram.unlink(l.chatId).then(setTg) }))} />
                  </Step>
                </Card>

                <Card className={cn('gap-4 px-6 py-5', !tg.connected && 'opacity-55')}>
                  <Step n={3} title="Who answers here" hint="Messages go to the first agent on this list; switch with /name (for example /atlas). /agents lists them.">
                    <div className="flex flex-col gap-2">
                      {team.map((a) => (
                        <div key={a.id} className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-card px-3 py-1.5">
                          <button type="button" className="flex min-h-10 min-w-0 flex-1 items-center gap-2.5 rounded-md text-left outline-none hover:text-green focus-visible:ring-[3px] focus-visible:ring-ring/40" onClick={() => onOpenAgent(a)}>
                            <Avatar shape={a.shape} tone={a.tone} head={a.head} mascot={a.isMascot} size={26} />
                            <strong className="text-sm font-medium">{a.name}</strong>
                            <span className="font-mono text-xs text-muted-foreground">/{a.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}</span>
                          </button>
                          <Switch checked={a.channels.telegram} aria-label={`${a.name} answers on Telegram`} disabled={!tg.connected} onCheckedChange={() => void toggleAgent(a)} />
                        </div>
                      ))}
                    </div>
                  </Step>
                </Card>

                <Card className={cn('gap-4 px-6 py-5', !tg.connected && 'opacity-55')}>
                  <Step n={4} title="What reaches you">
                    <div className="flex flex-col gap-2">
                      <SwitchRow name="Task results" desc="When a scheduled task finishes, with the start of its reply." on={tg.notify.results} disabled={!tg.connected} onChange={(v) => void setNotify({ results: v })} />
                      <SwitchRow name="File changes to approve" desc="From any chat or task, with Approve and Reject buttons." on={tg.notify.approvals} disabled={!tg.connected} onChange={(v) => void setNotify({ approvals: v })} />
                      <SwitchRow name="Failures" desc="When a scheduled task fails." on={tg.notify.failures} disabled={!tg.connected} onChange={(v) => void setNotify({ failures: v })} />
                    </div>
                  </Step>
                </Card>
                <p className={HINT}>Agents answer while Tyslin is open on this computer; messages sent while it's closed are picked up when you open it. Each agent keeps one "Telegram" chat in the app, so you can read the whole conversation there.</p>
              </>
            )}

            {pick === 'slack' && sl && (
              <>
                <Card className="gap-5 px-6 py-5">
                  {head(sl.connected ? <Button variant="outline" size="sm" onClick={() => void disconnectSlack()}>Disconnect</Button> : undefined)}
                  {sl.connected && sl.error && <p className="text-[13px] text-destructive" role="alert">Can't reach Slack right now: {sl.error}</p>}

                  <Step n={1} done={sl.connected} title="Your Slack app"
                    hint="Create an app at api.slack.com/apps, add the bot scopes chat:write, channels:read, groups:read, channels:history and groups:history, install it to your workspace and paste the Bot User OAuth Token. It's stored encrypted on this computer.">
                    {sl.connected ? (
                      <div className="flex items-center gap-3 rounded-lg border border-border bg-panel px-3.5 py-3">
                        <span className="grid size-8 flex-none place-items-center rounded-md bg-card font-mono text-xs" aria-hidden="true">SL</span>
                        <span className="text-sm font-medium text-green">Connected as @{sl.botName}</span>
                      </div>
                    ) : (
                      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void saveSlack() }}>
                        <Input className="min-w-[260px] flex-1 font-mono" type="password" placeholder="xoxb-…" aria-label="Slack bot token" value={slToken} onChange={(e) => setSlToken(e.target.value)} />
                        <Button type="submit" disabled={!slToken.trim() || busy}>{busy ? 'Checking…' : 'Connect'}</Button>
                      </form>
                    )}
                    {errorLine}
                  </Step>

                  <Separator />

                  <Step n={2} done={sl.linked.length > 0} off={!sl.connected} title="Link a channel"
                    hint={`Invite the bot to the channel (/invite @${sl.botName || 'yourbot'}), then post the code there. Only linked channels can talk to your Leads; everything else is ignored.`}
                    action={!sl.linkCode && (
                      <Button size="sm" disabled={!sl.connected} onClick={() => void window.tyslin.slack.linkCode().then(setSl)}>
                        {sl.linked.length ? 'Link another channel' : 'Get a link code'}
                      </Button>
                    )}>
                    {sl.linkCode && <CodeRow>Post <code>tyslin {sl.linkCode}</code> in the channel. The code works for 10 minutes.</CodeRow>}
                    <LinkedTable head="Channel" rows={sl.linked.map((l) => ({ key: l.channelId, name: `#${l.name}`, onUnlink: () => void window.tyslin.slack.unlink(l.channelId).then(setSl) }))} />
                  </Step>
                </Card>

                <Card className={cn('gap-4 px-6 py-5', !sl.connected && 'opacity-55')}>
                  <Step n={3} title="Who answers here" hint="Only agency Leads talk to you on Slack. A reply in a linked channel goes to the Lead that last wrote there (or the first agency's Lead). Workers never message you." />
                </Card>
                <p className={HINT}>Tyslin checks the linked channels every few seconds while it's open on this computer; messages sent while it's closed are picked up when you open it.</p>
              </>
            )}

            {pick === 'discord' && <Soon head={head()} text="A bot in your Discord server, connected from this computer, with the same linked-accounts rule as Telegram." />}
            {pick === 'whatsapp' && <Soon head={head()} text="WhatsApp only delivers messages to a public web address, which a desktop app on your computer doesn't have. It will come with the hosted plan, which runs that address for you." />}
            {pick === 'email' && <Soon head={head()} text="Email an agent at its own address and get replies, task results and approval requests in your inbox." />}
          </div>

          {header && <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">{header}</div>}
        </div>
      </div>
    </div>
  )
}

function Soon({ head, text }: { head: React.ReactNode; text: string }): JSX.Element {
  return (
    <Card className="gap-4 px-6 py-5">
      {head}
      <div className="rounded-lg border border-border bg-panel px-4 py-3.5 text-sm leading-relaxed">{text} Telegram works today.</div>
    </Card>
  )
}
