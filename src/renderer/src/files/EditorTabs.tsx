import { useEffect, useRef } from 'react'
import { Icon } from '../components/Icon'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

export type Mode = 'edit' | 'diff' | 'preview'
export interface TabChip { key: string; name: string; title: string; dirty: boolean }

interface Props {
  tabs: TabChip[]
  active: string | null
  onPick: (key: string) => void
  onClose: (key: string) => void
  mode: Mode
  modes: Record<Mode, boolean>
  onMode: (m: Mode) => void
  wrap: boolean | null
  onWrap: (on: boolean) => void
  onCloseOthers: () => void
  onReveal: () => void
}

/** Open files as tabs (Geist Mono names, a dot when unsaved, middle-click closes) and the Edit / Diff / Preview switch. */
export function EditorTabs(p: Props): JSX.Element {
  const list = useRef<HTMLDivElement>(null)
  // Keep the active tab in sight when there are more tabs than room.
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [p.active, p.tabs.length])
  const MODE_LABEL: Record<Mode, string> = { edit: 'Edit', diff: 'Diff', preview: 'Preview' }
  return (
    <div className="flex h-[39px] min-w-0 flex-none items-stretch border-b border-border bg-background">
      <div ref={list} className="h-full min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
      <TabsList aria-label="Open files" className="h-full w-max justify-start gap-0 rounded-none bg-transparent p-0">
        {p.tabs.map((t) => {
          const on = t.key === p.active
          return (
            <div key={t.key} className={cn('group flex h-full flex-none items-center border-r border-b-2 border-border border-b-transparent', on && 'border-b-lime bg-card')}
              onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); p.onClose(t.key) } }} onMouseDown={(e) => { if (e.button === 1) e.preventDefault() }}>
              <TabsTrigger active={on} onClick={() => p.onPick(t.key)} title={t.title}
                className={cn('h-full flex-none gap-2 rounded-none border-0 pr-1 pl-3 font-mono text-[13px] font-normal shadow-none', on ? 'bg-transparent text-foreground shadow-none' : 'text-muted-foreground')}>
                <span className="max-w-[220px] truncate">{t.name}</span>
                {t.dirty && <span className="size-2 rounded-full bg-foreground" aria-label="Unsaved" />}
              </TabsTrigger>
              <button type="button" aria-label={`Close ${t.name}`} title="Close"
                className="relative mr-1 grid size-6 place-items-center rounded-sm text-muted-foreground outline-none after:absolute after:-inset-2.5 after:content-[''] hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
                onClick={() => p.onClose(t.key)}><Icon name="close" size={11} /></button>
            </div>
          )
        })}
      </TabsList>
      </div>
      {p.active && (
        <div className="flex flex-none items-center gap-1 border-l border-border px-2">
          <ToggleGroup type="single" variant="outline" size="sm" value={p.mode} onValueChange={(v) => { if (v) p.onMode(v as Mode) }} aria-label="View">
            {(['edit', 'diff', 'preview'] as Mode[]).map((m) => (
              <ToggleGroupItem key={m} value={m} disabled={!p.modes[m]} className="h-8 px-2.5 text-xs" aria-label={MODE_LABEL[m]}
                title={!p.modes[m] ? (m === 'diff' ? 'Only for files with git changes' : m === 'preview' ? 'Only for Markdown, HTML, images, PDFs and Office files' : 'Images, PDFs and Office files open in Preview only') : MODE_LABEL[m]}>{MODE_LABEL[m]}</ToggleGroupItem>
            ))}
          </ToggleGroup>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative size-8 after:absolute after:-inset-1.5 after:content-['']" aria-label="Tab menu" title="Tab menu"><Icon name="more" size={15} /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {p.wrap !== null && <DropdownMenuCheckboxItem checked={p.wrap} onCheckedChange={(v) => p.onWrap(v === true)}>Soft wrap</DropdownMenuCheckboxItem>}
              {p.wrap !== null && <DropdownMenuSeparator />}
              <DropdownMenuItem onSelect={() => p.onReveal()}>Show in folder</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => p.active && p.onClose(p.active)}>Close</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => p.onCloseOthers()} disabled={p.tabs.length < 2}>Close other tabs</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}
