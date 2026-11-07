import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// shadcn/ui Badge (new-york) with Tyslin variants: lime (fill + on-lime text), soft (lime tint + green text).
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-muted-foreground',
        lime: 'border-transparent bg-lime text-on-lime',
        soft: 'border-transparent bg-lime-soft text-green',
        destructive: 'border-transparent bg-destructive-soft text-destructive',
        outline: 'border-border text-foreground'
      }
    },
    defaultVariants: { variant: 'default' }
  }
)

const Badge = React.forwardRef<HTMLSpanElement, React.ComponentPropsWithoutRef<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }>(function Badge({ className, variant, asChild = false, ...props }, ref) {
  const Comp = asChild ? Slot : 'span'
  return <Comp ref={ref} data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
})

export { Badge, badgeVariants }
