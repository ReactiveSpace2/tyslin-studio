import type { OrgColor, Preferences } from '@shared/types'

/**
 * Icon style, menu labels and accent colour, applied as data attributes on <html> so styles.css can
 * switch tokens (`data-icons`, `data-rail-labels`, `data-accent`). Theme and zoom are applied by main.
 * Call `refreshAppearance()` at start-up and after any of these settings or the organization colour change.
 */
export function applyAppearance(p: Pick<Preferences, 'iconStyle' | 'railLabels' | 'accent'>, orgColor: OrgColor): void {
  const d = document.documentElement.dataset
  d.icons = p.iconStyle
  d.railLabels = p.railLabels ? 'on' : 'off'
  d.accent = p.accent === 'org' ? orgColor : p.accent
}

export async function refreshAppearance(): Promise<void> {
  const [prefs, orgs] = await Promise.all([window.tyslin.settings.prefs(), window.tyslin.orgs.list()])
  applyAppearance(prefs, orgs.find((o) => o.current)?.color ?? 'lime')
}
