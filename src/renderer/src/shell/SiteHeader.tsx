import type { ReactNode } from 'react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

/**
 * The 48 px strip at the top of every screen: the second window drag area (the first is the sidebar's
 * header). On Windows and Linux the system draws the window buttons over its right end (`TITLEBAR_HEIGHT`
 * in main/index.ts); everything placed in it must be `no-drag` or it can't be clicked.
 */
export function SiteHeader({ mac, title, children, className }: { mac: boolean; title?: ReactNode; children?: ReactNode; className?: string }): JSX.Element {
  return (
    <header className={cn('drag-region flex h-12 flex-none items-center gap-2 border-b border-border bg-background pl-2', mac ? 'pr-3' : 'pr-[150px]', className)}>
      <SidebarTrigger className="no-drag size-9 text-muted-foreground" />
      <div className="no-drag flex min-w-0 flex-1 items-center gap-2">{title}</div>
      {children && <div className="no-drag flex items-center gap-1">{children}</div>}
    </header>
  )
}
