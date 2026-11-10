import { useEffect, useMemo, useState } from 'react'
import type { OpenRouterModel } from '@shared/types'
import { slugFits, type OpenRouterEngine } from '@shared/openrouter'
import { Icon } from './Icon'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const price = (m: OpenRouterModel): string =>
  m.input === null || m.output === null ? '' : m.input === 0 && m.output === 0 ? 'free' : `$${m.input} / $${m.output} per 1M`

/**
 * An OpenRouter model, searched from OpenRouter's model list (shadcn Combobox: Popover + Command). Only models that
 * take tool calls are listed. `engine` narrows it further: Claude Code gets anthropic/* only, Codex any full slug
 * (openai/* first). Without an engine (Leads, Tyslin's own runtime) every tool-capable model is offered.
 */
export function OpenRouterModelPicker({ id, value, onChange, engine }: { id?: string; value: string; onChange: (slug: string) => void; engine?: OpenRouterEngine }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [models, setModels] = useState<OpenRouterModel[] | null>(null)
  useEffect(() => { void window.tyslin.settings.openrouterModels().then(setModels).catch(() => setModels([])) }, [])
  const fit = useMemo(() => (models ?? [])
    .filter((m) => m.tools && !m.id.endsWith(':batch') && (!engine || slugFits(engine, m.id)))
    .sort((a, b) => (engine === 'codex' ? Number(!a.id.startsWith('openai/')) - Number(!b.id.startsWith('openai/')) : 0) || a.name.localeCompare(b.name)), [models, engine])
  const q = query.trim().toLowerCase()
  const shown = (q ? fit.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)) : fit).slice(0, 80)
  const current = fit.find((m) => m.id === value)

  return (
    <div className="flex min-w-0 flex-col gap-1">
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} aria-label="OpenRouter model" className="h-9 w-full justify-between bg-card px-3 font-mono text-xs font-normal">
          <span className={cn('truncate', !value && 'text-muted-foreground')}>{value || 'Pick a model'}</span>
          <Icon name="updown" size={13} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[360px] p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder={engine === 'claude-code' ? 'Search anthropic/ models' : 'Search, e.g. sonnet, gpt-5, deepseek'} value={query} onValueChange={setQuery} />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>{models === null ? 'Loading models from OpenRouter…' : models.length === 0 ? "Couldn't load OpenRouter's model list. Check your connection." : 'No model matches.'}</CommandEmpty>
            <CommandGroup heading={fit.length ? `${fit.length} models with tool calls${shown.length < (q ? fit.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)).length : fit.length) ? ', type to narrow' : ''}` : undefined}>
              {shown.map((m) => (
                <CommandItem key={m.id} value={m.id} onSelect={() => { onChange(m.id); setOpen(false); setQuery('') }} className="flex flex-col items-start gap-0.5">
                  <span className="flex w-full items-center gap-2 font-mono text-xs">{m.id === value && <Icon name="check" size={12} />}<span className="truncate">{m.id}</span></span>
                  <span className="text-[11px] text-muted-foreground">{[m.name, m.context ? `${Math.round(m.context / 1000)}k context` : '', price(m)].filter(Boolean).join(' · ')}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
      {value && models && models.length > 0 && !current && <span className="text-xs text-destructive">OpenRouter doesn't list {value}{engine ? ` for ${engine === 'claude-code' ? 'Claude Code' : 'Codex'}` : ''} with tool calls. Pick another.</span>}
    </div>
  )
}
