import type { Agent } from '@shared/types'
import { ENGINE_NAMES } from '@shared/engines'
import claudeLogo from '../assets/providers/claude.svg'
import geminiLogo from '../assets/providers/gemini.svg'
import ollamaLogo from '../assets/providers/ollama.svg'
import gooseLogo from '../assets/providers/goose.png'
import hermesLogo from '../assets/providers/hermes.png'
import openclawLogo from '../assets/providers/openclaw.png'
import zeroclawLogo from '../assets/providers/zeroclaw.png'

export type MarkKey = Agent['provider'] | Exclude<Agent['engine'], 'builtin'>

/**
 * What an agent runs on: the provider's or project's own logo where we have a properly
 * sourced file (see assets/providers/SOURCES.md), otherwise a lettered tile in Tyslin's colours.
 */
export const MARKS: Record<MarkKey, { label: string; letters: string; tone: 'ink' | 'lime' | 'paper' }> = {
  anthropic: { label: 'Claude', letters: 'Cl', tone: 'ink' },
  openai: { label: 'OpenAI', letters: 'AI', tone: 'ink' },
  gemini: { label: 'Gemini', letters: 'Ge', tone: 'ink' },
  ollama: { label: 'Local · Ollama', letters: 'Ol', tone: 'paper' },
  openrouter: { label: 'OpenRouter', letters: 'OR', tone: 'ink' },
  goose: { label: ENGINE_NAMES.goose, letters: 'Go', tone: 'lime' },
  hermes: { label: ENGINE_NAMES.hermes, letters: 'He', tone: 'lime' },
  zeroclaw: { label: ENGINE_NAMES.zeroclaw, letters: 'Zc', tone: 'lime' },
  openclaw: { label: ENGINE_NAMES.openclaw, letters: 'Oc', tone: 'lime' },
  custom: { label: 'Custom agent', letters: '··', tone: 'paper' },
  'claude-code': { label: ENGINE_NAMES['claude-code'], letters: 'CC', tone: 'lime' },
  'gemini-cli': { label: ENGINE_NAMES['gemini-cli'], letters: 'GC', tone: 'lime' },
  codex: { label: ENGINE_NAMES.codex, letters: 'Co', tone: 'lime' }
}

/** `mark`: a single-colour logo shown on a white tile · `icon`: an app icon that fills the tile. */
const LOGOS: Partial<Record<MarkKey, { src: string; fit: 'mark' | 'icon' }>> = {
  anthropic: { src: claudeLogo, fit: 'mark' },
  gemini: { src: geminiLogo, fit: 'mark' },
  ollama: { src: ollamaLogo, fit: 'mark' },
  goose: { src: gooseLogo, fit: 'icon' },
  hermes: { src: hermesLogo, fit: 'icon' },
  openclaw: { src: openclawLogo, fit: 'icon' },
  zeroclaw: { src: zeroclawLogo, fit: 'icon' },
  // Claude Code and Gemini CLI reuse their companies' marks (Simple Icons); Codex has no sourced file.
  'claude-code': { src: claudeLogo, fit: 'mark' },
  'gemini-cli': { src: geminiLogo, fit: 'mark' }
}

const keyOf = (agent: Pick<Agent, 'engine' | 'provider'>): MarkKey => (agent.engine === 'builtin' ? agent.provider : agent.engine)

export function runsOnLabel(agent: Pick<Agent, 'engine' | 'provider'>): string {
  return MARKS[keyOf(agent)].label
}

export function Mark({ id, size = 22 }: { id: MarkKey; size?: number }): JSX.Element {
  const m = MARKS[id]
  const logo = LOGOS[id]
  return (
    <span className={logo ? `runs-on logo-${logo.fit}` : `runs-on tone-${m.tone}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45), borderRadius: Math.max(6, Math.round(size * 0.26)), padding: logo?.fit === 'mark' ? Math.round(size * 0.18) : 0 }}
      aria-hidden="true">
      {logo ? <img src={logo.src} alt="" /> : m.letters}
    </span>
  )
}

export function RunsOnBadge({ agent, size = 22 }: { agent: Pick<Agent, 'engine' | 'provider'>; size?: number }): JSX.Element {
  return <Mark id={keyOf(agent)} size={size} />
}
