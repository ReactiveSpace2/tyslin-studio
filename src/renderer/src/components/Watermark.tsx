import jumping from '../assets/mascot-pose-2.png'
import thinking from '../assets/mascot-pose-4.png'

const POSES = { jumping, thinking } as const

/**
 * A mascot pose, large and faint, behind a page's content: jumping (pose 2) on Home, thinking (pose 4) on
 * Settings. The page's cards are slightly see-through there so it shows behind them. Decorative only.
 */
export function Watermark({ pose = 'jumping' }: { pose?: keyof typeof POSES }): JSX.Element {
  return <img src={POSES[pose]} alt="" aria-hidden="true" className="page-watermark" draggable={false} />
}
