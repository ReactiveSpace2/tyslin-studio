import { useEffect, useState } from 'react'
import type { Agency, SlackStatus, TelegramStatus } from '@shared/types'
import type { AgencyView } from '../agencies'
import { firstName } from '../boardStats'
import { Icon } from '../components/Icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { NOTIFY_LABEL } from '@shared/agencies'

const errorText = (e: unknown): string => (e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e))
const HINT = 'text-xs leading-snug text-muted-foreground'

function useChannelStatus(): { tg: TelegramStatus | null; sl: SlackStatus | null; setTg: (s: TelegramStatus) => void; setSl: (s: SlackStatus) => void } {
  const [tg, setTg] = useState<TelegramStatus | null>(null)
  const [sl, setSl] = useState<SlackStatus | null>(null)
  useEffect(() => {
    const load = (): void => { void window.tyslin.telegram.status().then(setTg); void window.tyslin.slack.status().then(setSl) }
    load()
    const t = setInterval(load, 4000) // the linked list changes when you send /start from Telegram
    return () => clearInterval(t)
  }, [])
  return { tg, sl, setTg, setSl }
}

/** Channel: where the Lead reaches you (Telegram, Slack) and what it sends; Manage opens the setup dialog. */
export function ChannelTab({ view, onChanged }: { view: AgencyView; onChanged: () => void }): JSX.Element {
  const { tg, sl } = useChannelStatus()
  const [open, setOpen] = useState<'telegram' | 'slack' | null>(null)
  const lead = view.lead ? firstName(view.lead.name) : 'The Lead'
  const row = (kind: 'telegram' | 'slack', name: string, status: { connected: boolean; botName: string; linked: unknown[] } | null): JSX.Element => {
    const on = view.agency.channel.kind === kind
    return (
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
        <span className="grid size-9 flex-none place-items-center rounded-lg border border-border bg-muted text-xs font-bold">{name.slice(0, 1)}</span>
        <span className="flex min-w-[220px] flex-1 flex-col gap-0.5"><strong className="text-sm font-semibold">{name}</strong><span className={HINT}>{status?.connected ? `${status.botName ? '@' + status.botName : 'your bot'} · ${status.linked.length} linked${on ? ` · only ${lead} sends` : ''}` : 'Not set up'}</span></span>
        {on && <Badge variant="soft">In use</Badge>}
        {status?.connected ? <Badge variant="outline">Linked</Badge> : null}
        <Button variant={status?.connected ? 'ghost' : 'outline'} size="sm" onClick={() => setOpen(kind)}>{status?.connected ? 'Manage' : 'Set up'}</Button>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-0 overflow-hidden py-0">{row('telegram', 'Telegram', tg)}{row('slack', 'Slack', sl)}</Card>
      <span className={HINT}>What {lead} sends (everything, questions only, or a digest) is set under Goals → Limits. Your answers come back into the task.</span>
      {open && <ChannelDialog view={view} kind={open} onClose={() => setOpen(null)} onChanged={onChanged} />}
    </div>
  )
}

function StepNum({ n, done }: { n: number; done?: boolean }): JSX.Element {
  return <span className={cn('grid size-7 flex-none place-items-center rounded-full border font-mono text-xs', done ? 'border-transparent bg-lime text-on-lime' : 'border-border-strong text-muted-foreground')}>{done ? <Icon name="check" size={13} /> : n}</span>
}
function Step({ n, done, off, title, hint, children }: { n: number; done?: boolean; off?: boolean; title: string; hint?: string; children?: React.ReactNode }): JSX.Element {
  return (
    <section className={cn('flex gap-3.5', off && 'opacity-55')}><StepNum n={n} done={done} /><div className="flex min-w-0 flex-1 flex-col gap-2.5"><div className="flex flex-col gap-1"><h3 className="text-sm font-semibold">{title}</h3>{hint && <span className={HINT}>{hint}</span>}</div>{children}</div></section>
  )
}

/** The bot setup for Telegram or Slack: token, one-time link code, linked chats with Unlink, and which channel the agency uses. */
export function ChannelDialog({ view, kind, onClose, onChanged }: { view: AgencyView; kind: 'telegram' | 'slack'; onClose: () => void; onChanged: () => void }): JSX.Element {
  const { tg, sl, setTg, setSl } = useChannelStatus()
  const [tab, setTab] = useState<'telegram' | 'slack'>(kind)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notify, setNotify] = useState<Agency['notify']>(view.agency.notify)
  const [use, setUse] = useState<Agency['channel']['kind']>(view.agency.channel.kind)
  const lead = view.lead ? firstName(view.lead.name) : 'The Lead'
  const run = async <T,>(fn: () => Promise<T>, apply: (v: T) => void): Promise<void> => { setError(''); try { apply(await fn()) } catch (e) { setError(errorText(e)) } }
  const saveToken = async (): Promise<void> => {
    setBusy(true); setError('')
    try { if (tab === 'telegram') setTg(await window.tyslin.telegram.setToken(token)); else setSl(await window.tyslin.slack.setToken(token)); setToken('') } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const done = async (): Promise<void> => {
    if (notify !== view.agency.notify || use !== view.agency.channel.kind) { try { await window.tyslin.agencies.update(view.agency.id, { notify, channel: { kind: use } }); onChanged() } catch (e) { setError(errorText(e)); return } }
    onClose()
  }
  const st = tab === 'telegram' ? tg : sl
  const disconnect = (): Promise<void> => (tab === 'telegram' ? run(() => window.tyslin.telegram.setToken(''), setTg) : run(() => window.tyslin.slack.setToken(''), setSl))
  const getCode = (): Promise<void> => (tab === 'telegram' ? run(() => window.tyslin.telegram.linkCode(), setTg) : run(() => window.tyslin.slack.linkCode(), setSl))
  const code = (): JSX.Element | null => {
    if (tab === 'telegram') return tg?.linkCode ? <div className="rounded-lg border border-dashed border-green bg-lime-soft px-3.5 py-2.5 text-[13px]">Send <code className="font-mono text-[14px] font-semibold">/start {tg.linkCode}</code> to {tg.botName ? `@${tg.botName}` : 'your bot'} from your Telegram. The code works for 10 minutes.</div> : null
    return sl?.linkCode ? <div className="rounded-lg border border-dashed border-green bg-lime-soft px-3.5 py-2.5 text-[13px]">Invite the bot to a channel and post <code className="font-mono text-[14px] font-semibold">tyslin {sl.linkCode}</code> there. The code works for 10 minutes.</div> : null
  }
  const linked: { key: string; name: string; unlink: () => void }[] = tab === 'telegram'
    ? (tg?.linked ?? []).map((l) => ({ key: String(l.chatId), name: l.name, unlink: () => void run(() => window.tyslin.telegram.unlink(l.chatId), setTg) }))
    : (sl?.linked ?? []).map((l) => ({ key: l.channelId, name: l.name, unlink: () => void run(() => window.tyslin.slack.unlink(l.channelId), setSl) }))

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[calc(100%-48px)] w-[640px] max-w-[calc(100%-32px)] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[calc(100%-32px)]">
        <DialogHeader className="px-6 pt-6 pb-2 text-left"><DialogTitle className="text-xl">Where {lead} reaches you</DialogTitle><DialogDescription>Your own bot, polled from this computer. Only chats you link get messages.</DialogDescription>
          <TabsList className="mt-2 self-start" aria-label="Channel"><TabsTrigger active={tab === 'telegram'} onClick={() => { setTab('telegram'); setError('') }}>Telegram</TabsTrigger><TabsTrigger active={tab === 'slack'} onClick={() => { setTab('slack'); setError('') }}>Slack</TabsTrigger></TabsList>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-4">
          {!st && <span className={HINT}>Checking…</span>}
          {st && (
            <>
              <Step n={1} done={st.connected} title={tab === 'telegram' ? 'Your own bot' : 'Your own Slack app'} hint={tab === 'telegram' ? 'In Telegram, message BotFather, send /newbot and paste the token it gives you. Stored encrypted on this computer.' : 'Create a Slack app in your workspace with the bot scopes chat:write and channels:history, install it, and paste the bot token.'}>
                {st.connected ? (
                  <span className="flex items-center justify-between gap-3 rounded-lg border border-border bg-panel px-3.5 py-2.5 text-sm"><span className="text-green">Connected to {st.botName ? `@${st.botName}` : 'your bot'}</span><Button variant="ghost" size="sm" onClick={() => void disconnect()}>Disconnect</Button></span>
                ) : (
                  <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void saveToken() }}><Input className="min-w-[240px] flex-1 font-mono" type="password" placeholder={tab === 'telegram' ? 'Bot token' : 'xoxb-…'} aria-label="Bot token" value={token} onChange={(e) => setToken(e.target.value)} /><Button type="submit" disabled={!token.trim() || busy}>{busy ? 'Checking…' : 'Connect'}</Button></form>
                )}
                {st.connected && st.error && <span className="text-[13px] text-destructive">Can't reach it right now: {st.error}</span>}
              </Step>
              <Step n={2} done={linked.length > 0} off={!st.connected} title={tab === 'telegram' ? 'Link a chat' : 'Link a channel'} hint="Only linked chats get messages or can answer. Anyone else is ignored.">
                {code() ?? <Button size="sm" className="self-start" disabled={!st.connected} onClick={() => void getCode()}>{linked.length ? 'Link another' : 'Get a link code'}</Button>}
              </Step>
              <Step n={3} done={linked.length > 0} off={!st.connected} title={tab === 'telegram' ? 'Linked chats' : 'Linked channels'}>
                {linked.length === 0 ? <span className={HINT}>None yet.</span> : (
                  <Card className="gap-0 overflow-hidden py-0">{linked.map((l) => <span key={l.key} className="flex items-center justify-between gap-3 border-b border-border px-3.5 py-2 text-sm last:border-b-0"><span className="flex items-center gap-2 text-green"><Icon name="check" size={13} />{l.name}</span><Button variant="ghost" size="sm" onClick={l.unlink}>Unlink</Button></span>)}</Card>
                )}
              </Step>
            </>
          )}
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><span className="flex flex-col"><Label htmlFor="ch-use" className="text-sm font-semibold">{view.agency.name} uses</Label><span className={HINT}>Where {lead}'s messages go.</span></span><Select value={use} onValueChange={(v) => setUse(v as Agency['channel']['kind'])}><SelectTrigger id="ch-use" className="w-[180px] bg-card"><SelectValue /></SelectTrigger><SelectContent position="popper"><SelectItem value="none">The app only</SelectItem><SelectItem value="telegram">Telegram</SelectItem><SelectItem value="slack">Slack</SelectItem></SelectContent></Select></div>
            <div className="flex flex-wrap items-center justify-between gap-3"><span className="flex flex-col"><Label htmlFor="ch-notify" className="text-sm font-semibold">What {lead} sends</Label><span className={HINT}>For {view.agency.name} only.</span></span><Select value={notify} onValueChange={(v) => setNotify(v as Agency['notify'])}><SelectTrigger id="ch-notify" className="w-[210px] bg-card"><SelectValue /></SelectTrigger><SelectContent position="popper">{(['all', 'questions', 'digest'] as const).map((k) => <SelectItem key={k} value={k}>{NOTIFY_LABEL[k]}</SelectItem>)}</SelectContent></Select></div>
          </div>
          {error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
        </div>
        <DialogFooter className="border-t border-border px-6 py-4"><Button onClick={() => void done()}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
