import { HEADS } from '@shared/heads'

const files = import.meta.glob('./assets/heads/*.png', { eager: true, import: 'default' }) as Record<string, string>

/** Head id → bundled image URL. */
export const HEAD_SRC: Record<string, string> = Object.fromEntries(
  HEADS.map(([id]) => [id, files[`./assets/heads/${id}.png`]]).filter(([, src]) => !!src)
)
