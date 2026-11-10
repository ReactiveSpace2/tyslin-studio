import { useState } from 'react'
import type { Agent, Attachment } from '@shared/types'
import type { AgencyView } from '../agencies'
import { Icon } from './Icon'
import { RunsOnBadge, runsOnLabel } from './RunsOnBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** A picked file or folder, with its size and a remove button while it's still being composed. */
export function AttachmentChip({ a, onRemove }: { a: Attachment; onRemove?: () => void }): JSX.Element {
  const detail = a.kind === 'folder' ? `${a.files ?? 0} file${a.files === 1 ? '' : 's'}` : formatSize(a.size)
  return (
    <span className="inline-flex h-8 max-w-[280px] items-center gap-1.5 rounded-md border border-border bg-muted pr-1.5 pl-2.5 text-[13px] text-foreground" title={a.note ? `${a.path} (${a.note})` : a.path}>
      <Icon name={a.kind === 'folder' ? 'folder' : 'file'} size={14} />
      <span className="truncate">{a.name}</span>
      <span className="pr-1 font-mono text-[11px] whitespace-nowrap text-muted-foreground">{detail}</span>
      {a.note && <span className="inline-flex text-destructive"><Icon name="warning" size={12} /></span>}
      {onRemove && (
        <button type="button" className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40" aria-label={`Remove ${a.name}`} onClick={onRemove}>
          <Icon name="close" size={12} />
        </button>
      )}
    </span>
  )
}

interface Props {
  /** Shown as a Select above the box; one agency = a fixed label. */
  agencies: AgencyView[]
  agencyId: string | null
  onAgency?: (id: string) => void
  /** The agent the message goes to (the agency's Lead, or a worker in a direct chat). */
  agent: Agent | null
  value: string
  onChange: (v: string) => void
  attached: Attachment[]
  onAttached: (list: Attachment[]) => void
  running: boolean
  onSend: () => void
  onStop?: () => void
  placeholder: string
  label: string
  rows?: number
  autoFocus?: boolean
  /** Larger type and padding (Home). */
  large?: boolean
  disabled?: boolean
  className?: string
}

/**
 * The one message box, on Home and on every task: a Textarea (Enter sends, Shift+Enter breaks the line),
 * attachments, and under it the agency, the model it runs on and the mode. Modes aren't built yet, so the
 * mode is shown but can't be changed.
 */
export function Composer({ agencies, agencyId, onAgency, agent, value, onChange, attached, onAttached, running, onSend, onStop, placeholder, label, rows = 2, autoFocus, large, disabled, className }: Props): JSX.Element {
  const [attachMenu, setAttachMenu] = useState(false)
  const attach = async (kind: 'file' | 'folder'): Promise<void> => {
    setAttachMenu(false)
    const picked = await window.tyslin.attachments.pick(kind)
    onAttached([...attached, ...picked.filter((p) => !attached.some((x) => x.path === p.path))])
  }
  const canSend = !disabled && (!!value.trim() || attached.length > 0)
  const agency = agencies.find((v) => v.agency.id === agencyId) ?? null
  const foot = 'h-8 gap-1.5 px-2 font-mono text-xs text-muted-foreground has-[>svg]:px-2'

  return (
    <form className={cn('flex w-full flex-col gap-1.5', className)} onSubmit={(e) => { e.preventDefault(); if (canSend && !running) onSend() }}>
      <Card className={cn('gap-2 px-3 py-2.5 shadow-md transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30', large && 'rounded-2xl px-4 py-3')}>
        {attached.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Attached">
            {attached.map((a) => <AttachmentChip key={a.id} a={a} onRemove={() => onAttached(attached.filter((x) => x.id !== a.id))} />)}
          </div>
        )}
        <Label htmlFor="composer" className="sr-only">{label}</Label>
        <Textarea id="composer" rows={rows} autoFocus={autoFocus} disabled={disabled}
          className={cn('max-h-[220px] min-h-0 resize-none rounded-none border-0 bg-transparent px-1 py-1 shadow-none focus-visible:ring-0', large ? 'text-[15px]' : 'text-sm')}
          placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (canSend && !running) onSend() } }} />
        <div className="flex items-center gap-1">
          <DropdownMenu open={attachMenu} onOpenChange={setAttachMenu}>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="size-9 flex-none" aria-label="Attach files or a folder" title="Attach" disabled={disabled}><Icon name="plus" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" sideOffset={8} className="min-w-[168px] rounded-xl p-1.5 shadow-lg" aria-label="Attach">
              {(['file', 'folder'] as const).map((k) => (
                <DropdownMenuItem key={k} onSelect={() => void attach(k)} className="min-h-10 gap-2.5 rounded-md px-3"><Icon name={k} /> {k === 'file' ? 'File' : 'Folder'}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="flex-1" />
          <span className="hidden text-xs text-muted-foreground sm:inline">Enter to send</span>
          {running && onStop ? (
            <Button type="button" variant="outline" size="icon" className="size-9" aria-label="Stop" title="Stop" onClick={onStop}><Icon name="stop" /></Button>
          ) : (
            <Button type="submit" size="icon" className="size-9" aria-label="Send" disabled={!canSend || running}><Icon name="send" /></Button>
          )}
        </div>
      </Card>
      <div className="flex flex-wrap items-center justify-end gap-0.5 px-1">
        {agencies.length > 1 && onAgency ? (
          <Select value={agencyId ?? ''} onValueChange={onAgency}>
            <SelectTrigger size="sm" aria-label="Agency" className={cn(foot, 'w-auto min-w-0 border-0 bg-transparent shadow-none')}><SelectValue placeholder="Pick an agency" /></SelectTrigger>
            <SelectContent align="end">
              {agencies.map((v) => <SelectItem key={v.agency.id} value={v.agency.id}>{v.agency.name}{!v.lead ? ' · no Lead' : ''}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : agency ? <span className={cn(foot, 'inline-flex items-center')}>{agency.agency.name}</span> : null}
        {agent && (
          <Badge variant="outline" className={cn(foot, 'border-0 bg-transparent font-normal')} title={`Runs on ${runsOnLabel(agent)}`}>
            <RunsOnBadge agent={agent} size={12} /><span className="truncate">{agent.engine === 'builtin' ? agent.model : runsOnLabel(agent)}</span>
          </Badge>
        )}
        <Button type="button" variant="ghost" size="sm" className={foot} disabled title="Modes (Ask first, Plan, Auto) come in a later version; agents ask before they change files.">
          Ask first <Badge variant="secondary" className="h-4 px-1 text-[10px]">New</Badge>
        </Button>
      </div>
    </form>
  )
}
