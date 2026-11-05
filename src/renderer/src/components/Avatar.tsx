import type { Shape, Tone } from '@shared/types'
import mascot from '../assets/logo-mark.png'
import { HEAD_SRC } from '../heads'

const TONES: Record<Tone, { fill: string; feat: string }> = {
  lime: { fill: '#7DB800', feat: '#0F0F0D' },
  ink: { fill: '#0F0F0D', feat: '#7DB800' },
  paper: { fill: '#FFFFFF', feat: '#0F0F0D' }
}

interface Props {
  shape: Shape
  tone: Tone
  mascot?: boolean
  /** A mascot head id (shared/heads.ts); wins over shape and tone. */
  head?: string | null
  size?: number
}

/** Agent character. The Builder agent uses the Tyslin mascot; others get a branded robot shape. */
export function Avatar({ shape, tone, mascot: isMascot, head, size = 72 }: Props): JSX.Element {
  if (isMascot) return <img src={mascot} width={size} height={size} alt="" style={{ objectFit: 'contain' }} />
  if (head && HEAD_SRC[head]) return <img className="avatar-head" src={HEAD_SRC[head]} width={size} height={size} alt="" />
  const { fill, feat } = TONES[tone]
  const stroke = '#0F0F0D'
  return (
    <svg className="avatar-svg" width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
      {shape === 'block' && (
        <>
          <line x1="36" y1="4" x2="36" y2="12" stroke={stroke} strokeWidth="2" />
          <circle cx="36" cy="5" r="3" fill={stroke} />
          <rect x="10" y="12" width="52" height="48" rx="12" fill={fill} stroke={stroke} strokeWidth="2" />
          <rect x="19" y="28" width="34" height="14" rx="5" fill={stroke} />
          <rect x="23" y="31" width="9" height="8" rx="2.5" fill="none" stroke="#7DB800" strokeWidth="2" />
          <rect x="40" y="31" width="9" height="8" rx="2.5" fill="none" stroke="#7DB800" strokeWidth="2" />
          <path d="M31 51h10" stroke={feat === '#7DB800' ? '#FAFAF7' : feat} strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}
      {shape === 'round' && (
        <>
          <rect x="4" y="30" width="7" height="16" rx="3" fill="#7DB800" stroke={stroke} strokeWidth="1.5" />
          <rect x="61" y="30" width="7" height="16" rx="3" fill="#7DB800" stroke={stroke} strokeWidth="1.5" />
          <circle cx="36" cy="38" r="26" fill={fill} stroke={stroke} strokeWidth="2" />
          <path d="M28 12h16l-3 7H31z" fill="#7DB800" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
          <rect x="18" y="26" width="36" height="20" rx="8" fill={tone === 'ink' ? '#2A2A26' : stroke} />
          <rect x="23" y="31" width="9" height="9" rx="3" fill="none" stroke="#7DB800" strokeWidth="2" />
          <rect x="40" y="31" width="9" height="9" rx="3" fill="none" stroke="#7DB800" strokeWidth="2" />
          <rect x="34" y="52" width="4" height="6" rx="2" fill={tone === 'ink' ? '#FAFAF7' : '#C9C9C0'} />
        </>
      )}
      {shape === 'hex' && (
        <>
          <polygon points="36,7 63,22 63,52 36,67 9,52 9,22" fill={fill} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          <rect x="18" y="28" width="36" height="15" rx="5" fill={stroke} />
          <rect x="22" y="31" width="10" height="9" rx="2.5" fill="none" stroke="#7DB800" strokeWidth="2" />
          <rect x="40" y="31" width="10" height="9" rx="2.5" fill="none" stroke="#7DB800" strokeWidth="2" />
          <path d="M31 52h10" stroke={feat === '#7DB800' ? '#FAFAF7' : feat} strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}
      {shape === 'pill' && (
        <>
          <rect x="15" y="6" width="42" height="60" rx="21" fill={fill} stroke={stroke} strokeWidth="2" />
          <rect x="21" y="22" width="30" height="16" rx="7" fill={stroke} />
          <rect x="25" y="26" width="8" height="8" rx="2.5" fill="none" stroke="#7DB800" strokeWidth="2" />
          <rect x="39" y="26" width="8" height="8" rx="2.5" fill="none" stroke="#7DB800" strokeWidth="2" />
          <rect x="34" y="48" width="4" height="7" rx="2" fill={feat === '#7DB800' ? '#FAFAF7' : '#C9C9C0'} />
        </>
      )}
    </svg>
  )
}
