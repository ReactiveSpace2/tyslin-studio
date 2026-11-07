import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * A count card in the shape of shadcn's dashboard "SectionCards": label, a large tabular number, an optional badge
 * at the top right, and a two-line footer (a strong line, then a muted one). No gradient (brand rule). `attention`
 * outlines it in green when there's something for you to do. Only ever show real numbers.
 */
export function StatCard({ label, value, badge, strong, muted, attention, className }: {
  label: string
  value: ReactNode
  badge?: ReactNode
  strong?: ReactNode
  muted?: ReactNode
  attention?: boolean
  className?: string
}): JSX.Element {
  return (
    <Card className={cn('@container/card gap-4 py-5 shadow-xs', attention && 'border-green', className)}>
      <CardHeader className="px-5">
        <CardDescription className={cn(attention && 'font-medium text-green')}>{label}</CardDescription>
        <CardTitle className="font-mono text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">{value}</CardTitle>
        {badge != null && badge !== false && (
          <CardAction><Badge variant="outline" className="font-mono tabular-nums">{badge}</Badge></CardAction>
        )}
      </CardHeader>
      {(strong || muted) && (
        <CardFooter className="flex-col items-start gap-1 px-5 text-sm">
          {strong && <div className="line-clamp-1 flex gap-2 font-medium">{strong}</div>}
          {muted && <div className="text-muted-foreground">{muted}</div>}
        </CardFooter>
      )}
    </Card>
  )
}
