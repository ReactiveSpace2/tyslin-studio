import { useRef, type ReactNode } from 'react'
import { Icon, type IconName } from '../components/Icon'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type Panel = 'explorer' | 'search' | 'scm'
const PANELS: { id: Panel; label: string; icon: IconName }[] = [
  { id: 'explorer', label: 'Explorer', icon: 'file' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'scm', label: 'Source control', icon: 'branch' }
]

/** The side bar's 52 px icon strip (a vertical tablist) and the one panel chosen beside it. */
export function SideBar({ panel, onPanel, changes, children }: { panel: Panel; onPanel: (p: Panel) => void; changes: number; children: ReactNode }): JSX.Element {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const move = (e: React.KeyboardEvent, i: number): void => {
    const next = e.key === 'ArrowDown' ? (i + 1) % PANELS.length : e.key === 'ArrowUp' ? (i + PANELS.length - 1) % PANELS.length : e.key === 'Home' ? 0 : e.key === 'End' ? PANELS.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    onPanel(PANELS[next].id)
    refs.current[PANELS[next].id]?.focus()
  }
  return (
    <div className="flex w-[340px] min-w-0 flex-none border-r border-border bg-sidebar max-[1180px]:w-[300px]">
      <div role="tablist" aria-orientation="vertical" aria-label="Side bar" className="flex w-[52px] flex-none flex-col items-center gap-1 border-r border-border py-2">
        {PANELS.map((p, i) => {
          const on = panel === p.id
          const label = p.id === 'scm' && changes ? `${p.label}, ${changes} ${changes === 1 ? 'change' : 'changes'}` : p.label
          return (
            <Tooltip key={p.id}>
              <TooltipTrigger asChild>
                <Button ref={(el) => { refs.current[p.id] = el }} variant="ghost" size="icon" role="tab" id={`files-tab-${p.id}`} aria-selected={on} aria-controls="files-panel" aria-label={label} tabIndex={on ? 0 : -1}
                  onClick={() => onPanel(p.id)} onKeyDown={(e) => move(e, i)}
                  className={cn('relative size-11 rounded-md text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground', on && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-xs hover:bg-sidebar-accent')}>
                  <Icon name={p.icon} size={20} />
                  {p.id === 'scm' && changes > 0 && (
                    <span aria-hidden="true" className="absolute top-1 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-lime px-1 font-mono text-[10px] leading-none font-semibold text-on-lime">{changes > 99 ? '99+' : changes}</span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{p.label}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>
      <section id="files-panel" role="tabpanel" aria-labelledby={`files-tab-${panel}`} className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</section>
    </div>
  )
}
