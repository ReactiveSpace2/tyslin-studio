import { HEADS } from '@shared/heads'
import type { Shape, Tone } from '@shared/types'
import { HEAD_SRC } from '../heads'
import { Avatar } from './Avatar'

interface Props {
  head: string | null
  shape: Shape
  tone: Tone
  onHead: (h: string | null) => void
  onShape: (s: Shape) => void
  onTone: (t: Tone) => void
}

const TONES: [Tone, string, string][] = [['lime', 'Lime', '#7DB800'], ['ink', 'Ink', '#0F0F0D'], ['paper', 'Paper', '#FFFFFF']]

/** Choose a mascot head, or the simple robot shape and colour. */
export function HeadPicker({ head, shape, tone, onHead, onShape, onTone }: Props): JSX.Element {
  return (
    <fieldset className="field head-picker" style={{ border: 0, margin: 0, padding: 0 }}>
      <legend className="label" style={{ marginBottom: 8 }}>Character</legend>
      <div className="heads" role="radiogroup" aria-label="Head">
        {HEADS.map(([id, label]) => HEAD_SRC[id] && (
          <button key={id} type="button" role="radio" aria-checked={head === id} aria-label={label} title={label}
            className={'head-pick' + (head === id ? ' on' : '')} onClick={() => onHead(id)}>
            <img src={HEAD_SRC[id]} alt="" width={40} height={40} />
          </button>
        ))}
        <button type="button" role="radio" aria-checked={!head} aria-label="Simple robot" title="Simple robot"
          className={'head-pick' + (!head ? ' on' : '')} onClick={() => onHead(null)}>
          <Avatar shape={shape} tone={tone} size={34} />
        </button>
      </div>
      {!head && (
        <div className="row" style={{ gap: 6, marginTop: 8 }}>
          {(['block', 'round', 'hex', 'pill'] as Shape[]).map((s) => (
            <button key={s} type="button" className={'pick' + (shape === s ? ' on' : '')} aria-pressed={shape === s} aria-label={`${s} shape`} onClick={() => onShape(s)}>
              <Avatar shape={s} tone={tone} size={30} />
            </button>
          ))}
          <span style={{ width: 8 }} />
          {TONES.map(([t, label, c]) => (
            <button key={t} type="button" className={'pick tone-pick' + (tone === t ? ' on' : '')} aria-pressed={tone === t} onClick={() => onTone(t)}>
              <span className="swatch" style={{ background: c }} />{label}
            </button>
          ))}
        </div>
      )}
    </fieldset>
  )
}
