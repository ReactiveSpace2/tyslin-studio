import standing from '../assets/mascot-pose-1.png'
import jumping from '../assets/mascot-pose-2.png'
import kneeling from '../assets/mascot-pose-3.png'
import thinking from '../assets/mascot-pose-4.png'
import tablets from '../assets/mascot-pose-5.png'
import back from '../assets/mascot-pose-6.png'

/**
 * Full-body mascot poses for empty screens and moments (7 Nov 2026): 1 standing (sign-in), 2 jumping
 * (the wizard's last step), 3 kneeling with a chart (an empty Inbox), 4 thinking (Skills search with no
 * match), 5 holding tablets (an empty agency board), 6 seen from behind (an empty Drive folder).
 * Decorative: the text next to it says what matters. Never recolour, stretch or redraw the mascot.
 * Poses 3, 5 and 6 are temporary cut-outs from the owner's pose sheet, like 2 and 4.
 */
const SRC = { 1: standing, 2: jumping, 3: kneeling, 4: thinking, 5: tablets, 6: back } as const

export function Pose({ pose, height, className = '' }: { pose: keyof typeof SRC; height: number; className?: string }): JSX.Element {
  return <img src={SRC[pose]} alt="" aria-hidden="true" className={'pose ' + className} style={{ height }} />
}
