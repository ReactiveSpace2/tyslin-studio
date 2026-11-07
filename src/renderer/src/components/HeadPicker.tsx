import { HEADS } from '@shared/heads'
import type { Shape, Tone } from '@shared/types'
import { HEAD_SRC } from '../heads'
import { cn } from '@/lib/utils'
import { Avatar } from './Avatar'

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring'
const HEAD = cn('grid h-14 cursor-pointer place-items-center rounded-xl border-[1.5px] border-border bg-card p-0 hover:border-border-strong', FOCUS)
const PICK = cn('flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border-[1.5px] border-border bg-card px-1.5 text-[13px]', FOCUS)
const ON = 'border-foreground bg-lime-soft hover:border-foreground'

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
    <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
      <legend className="mb-2 text-[13px] font-semibold">Character</legend>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-1.5" role="radiogroup" aria-label="Head">
        {HEADS.map(([id, label]) => HEAD_SRC[id] && (
          <button key={id} type="button" role="radio" aria-checked={head === id} aria-label={label} title={label}
            className={cn(HEAD, head === id && ON)} onClick={() => onHead(id)}>
            <img src={HEAD_SRC[id]} alt="" width={40} height={40} className="size-10 object-contain" />
          </button>
        ))}
        <button type="button" role="radio" aria-checked={!head} aria-label="Simple robot" title="Simple robot"
          className={cn(HEAD, !head && ON)} onClick={() => onHead(null)}>
          <Avatar shape={shape} tone={tone} size={34} />
        </button>
      </div>
      {!head && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {(['block', 'round', 'hex', 'pill'] as Shape[]).map((s) => (
            <button key={s} type="button" className={cn(PICK, shape === s && ON)} aria-pressed={shape === s} aria-label={`${s} shape`} onClick={() => onShape(s)}>
              <Avatar shape={s} tone={tone} size={30} />
            </button>
          ))}
          <span className="w-2" />
          {TONES.map(([t, label, c]) => (
            <button key={t} type="button" className={cn(PICK, 'px-3', tone === t && ON)} aria-pressed={tone === t} onClick={() => onTone(t)}>
              <span className="size-4 rounded-[4px] border border-foreground" style={{ background: c }} />{label}
            </button>
          ))}
        </div>
      )}
    </fieldset>
  )
}
