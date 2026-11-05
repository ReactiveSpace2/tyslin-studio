import { ORG_COLORS, type OrgColor } from '@shared/types'
import { Icon } from './Icon'

/** Radio group of organization colours. */
export function ColorSwatches({ value, onChange, name }: { value: OrgColor; onChange: (c: OrgColor) => void; name: string }): JSX.Element {
  return (
    <div className="swatches" role="radiogroup">
      {(Object.keys(ORG_COLORS) as OrgColor[]).map((c) => (
        <label key={c} className={'swatch-pick' + (value === c ? ' on' : '')} title={ORG_COLORS[c].label}>
          <input type="radio" name={name} value={c} checked={value === c} onChange={() => onChange(c)} className="sr-only" />
          <span className="swatch-dot" style={{ background: ORG_COLORS[c].fill }}>{value === c && <Icon name="check" size={14} />}</span>
          <span className="swatch-name">{ORG_COLORS[c].label}</span>
        </label>
      ))}
    </div>
  )
}
