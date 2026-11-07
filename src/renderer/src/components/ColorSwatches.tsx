import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import { ORG_COLORS, type OrgColor } from '@shared/types'
import { RadioGroup } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { Icon } from './Icon'

/** Radio group of organization colours (arrow keys move between them). */
export function ColorSwatches({ value, onChange, name }: { value: OrgColor; onChange: (c: OrgColor) => void; name: string }): JSX.Element {
  return (
    <RadioGroup name={name} value={value} onValueChange={(v) => onChange(v as OrgColor)} className="flex flex-wrap gap-2.5">
      {(Object.keys(ORG_COLORS) as OrgColor[]).map((c) => (
        <RadioGroupPrimitive.Item key={c} value={c} title={ORG_COLORS[c].label}
          className={cn('flex min-w-14 cursor-pointer flex-col items-center gap-1.5 rounded-lg p-1.5 text-xs text-muted-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
            value === c && 'font-semibold text-foreground')}>
          {/* The swatch is the organization colour itself; the tick stays ink on every swatch. */}
          <span className={cn('grid size-9 place-items-center rounded-lg border-2 border-transparent', value === c && 'border-foreground')}
            style={{ background: ORG_COLORS[c].fill, color: '#0F0F0D' }}>
            {value === c && <Icon name="check" size={14} />}
          </span>
          <span>{ORG_COLORS[c].label}</span>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroup>
  )
}
