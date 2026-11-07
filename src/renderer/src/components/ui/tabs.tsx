import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * shadcn/ui Tabs look, without Radix: a pill list of real tab buttons. Controlled by the caller:
 *   <TabsList aria-label="View"><TabsTrigger active={v==='a'} onClick={() => setV('a')}>A</TabsTrigger>…</TabsList>
 * Panels are plain markup the caller shows for the active tab.
 */
function TabsList({ className, ...props }: React.ComponentProps<'div'>): JSX.Element {
  return <div role="tablist" data-slot="tabs-list" className={cn('inline-flex h-9 w-fit items-center justify-center gap-0.5 rounded-lg bg-accent p-[3px] text-muted-foreground', className)} {...props} />
}

function TabsTrigger({ active, className, ...props }: React.ComponentProps<'button'> & { active: boolean }): JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-slot="tabs-trigger"
      data-state={active ? 'active' : 'inactive'}
      className={cn(
        'inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-3 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
        active ? 'bg-card text-foreground shadow-xs' : 'hover:text-foreground',
        className
      )}
      {...props}
    />
  )
}

export { TabsList, TabsTrigger }
