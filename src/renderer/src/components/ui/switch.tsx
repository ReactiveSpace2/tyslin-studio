import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * shadcn/ui Switch look, without Radix: a real <button role="switch">. On = lime fill (brand: lime is a fill).
 * Needs an accessible name: aria-label, or aria-labelledby, or a <label htmlFor>.
 */
function Switch({ checked, onCheckedChange, className, disabled, ...props }: Omit<React.ComponentProps<'button'>, 'onChange'> & { checked: boolean; onCheckedChange?: (v: boolean) => void }): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-slot="switch"
      data-state={checked ? 'checked' : 'unchecked'}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-lime' : 'bg-border-strong',
        className
      )}
      {...props}
    >
      <span className={cn('pointer-events-none block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  )
}

export { Switch }
