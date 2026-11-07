import { useEffect, useState } from 'react'
import type { Agency, Agent, ChannelMessage } from '@shared/types'
import { firstName } from '../boardStats'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const KIND: Record<ChannelMessage['kind'], string> = { brief: 'Brief', question: 'Question', review: 'Review', digest: 'Digest' }

const HINT = 'text-[13px] leading-snug text-muted-foreground'

const NOTIFY: [Agency['notify'], string, string][] = [
  ['questions', 'Questions and reviews', 'Only when the Lead needs you'],
  ['all', 'Everything', 'Briefs, questions, reviews and digests'],
  ['digest', 'Digest only', 'Just the digests']
]

/** Channel inside an agency tab: what the Lead sends the boss, and the messages it has sent so far. */
export function AgencyChannelBar({ agency, lead, onChanged }: { agency: Agency; lead: Agent | null; onChanged: () => void }): JSX.Element {
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const load = (): void => { void window.tyslin.channels.list(agency.id).then(setMessages) }
  useEffect(() => { load(); return window.tyslin.channels.onMessage((m) => { if (m.agencyId === agency.id) load() }) }, [agency.id])
  const setNotify = async (notify: Agency['notify']): Promise<void> => { await window.tyslin.agencies.update(agency.id, { notify }); onChanged() }
  const setChannel = async (kind: Agency['channel']['kind']): Promise<void> => { await window.tyslin.agencies.update(agency.id, { channel: { kind } }); onChanged() }
  return (
    <div className="flex flex-col gap-4 text-foreground">
      <Card className="gap-4 px-5 py-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{agency.name}</span>
          <h2 className="text-[15px] font-semibold">{lead ? `${lead.name} talks to you here` : 'No Lead yet: add one to hear from this agency'}</h2>
          <span className={HINT}>Only the Lead messages you: briefs, questions, work to review and digests. Workers report to the Lead.</span>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`ach-kind-${agency.id}`}>Lead talks to you on</Label>
          <Select value={agency.channel.kind} onValueChange={(v) => void setChannel(v as Agency['channel']['kind'])}>
            <SelectTrigger id={`ach-kind-${agency.id}`} className="w-full min-w-0 bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">In the app only</SelectItem><SelectItem value="telegram">Telegram</SelectItem><SelectItem value="slack">Slack</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <span id={`ach-notify-${agency.id}`} className="text-sm leading-none font-medium">What the Lead sends</span>
          <RadioGroup aria-labelledby={`ach-notify-${agency.id}`} value={agency.notify} onValueChange={(v) => void setNotify(v as Agency['notify'])} className="flex flex-col gap-2">
            {NOTIFY.map(([id, name, desc]) => (
              <Label key={id} htmlFor={`ach-notify-${agency.id}-${id}`}
                className={cn('flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border bg-card px-4 py-3 font-normal shadow-xs transition-[border-color,box-shadow] has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40',
                  agency.notify === id ? 'border-foreground ring-1 ring-foreground' : 'border-border hover:border-border-strong')}>
                <RadioGroupItem id={`ach-notify-${agency.id}-${id}`} value={id} className="mt-0.5" />
                <span className="flex flex-col gap-1">
                  <strong className="text-sm font-semibold">{name}</strong>
                  <span className={HINT}>{desc}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
        </div>
      </Card>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-col gap-1 border-b border-border px-5 py-4">
          <h2 className="text-[15px] font-semibold">Recent messages</h2>
          <span className={HINT}>From {lead?.name ?? 'the Lead'}</span>
        </div>
        {messages.length === 0 && (
          <p className={cn(HINT, 'px-5 py-4')}>
            {!lead ? 'No messages yet.'
              : agency.channel.kind === 'none'
                ? `${firstName(lead.name)} will message you here, and on Telegram or Slack once you pick one above.`
                : `${firstName(lead.name)} will message you here and on ${agency.channel.kind === 'telegram' ? 'Telegram' : 'Slack'}.`}
          </p>
        )}
        {messages.length > 0 && (
          <ul className="flex flex-col px-2 pb-2">
            {messages.slice(0, 8).map((m) => (
              <li key={m.id} className="flex flex-col gap-1.5 border-b border-border px-3 py-3 last:border-b-0">
                <span className="flex items-center justify-between gap-2">
                  <Badge variant={m.kind === 'question' || m.kind === 'review' ? 'lime' : 'secondary'}>{KIND[m.kind]}</Badge>
                  <span className="font-mono text-[11px] text-muted-foreground">{new Date(m.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </span>
                <span className="whitespace-pre-wrap text-[13.5px] leading-snug">{m.text}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{m.delivered ? m.via : 'in the app'}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
