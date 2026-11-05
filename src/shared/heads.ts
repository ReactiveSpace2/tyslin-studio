/**
 * Agent heads: the Tyslin mascot head set (resources/brand/heads/, copied to renderer assets/heads/).
 * An agent with `head` set shows it instead of the simple robot shape. Never recolour, stretch or redraw them.
 */
export const HEADS = [
  ['smile', 'Smile'], ['calm', 'Calm'], ['focus', 'Focused'], ['fierce', 'Fierce'], ['check', 'Done'],
  ['question', 'Question'], ['idea', 'Idea'], ['gears', 'Tinkering'], ['engine', 'Engine'], ['brain', 'Circuit brain'],
  ['scan', 'Scanner'], ['pulse', 'Pulse'], ['chart', 'Chart'], ['target', 'Target'], ['globe', 'Globe'],
  ['lenses', 'Lenses'], ['profile', 'Profile'], ['armor', 'Armour'], ['attention', 'Attention'], ['error', 'Error']
] as const

export type HeadId = (typeof HEADS)[number][0]

export const HEAD_IDS: readonly string[] = HEADS.map(([id]) => id)

/** Heads for the starter agents and assistants, matched to their jobs (by name). */
export const DEFAULT_HEADS: Record<string, HeadId> = {
  Atlas: 'check', Forge: 'engine', Quill: 'calm', Scout: 'globe', Relay: 'pulse', Passage: 'armor',
  Ledger: 'chart', Hunter: 'target', Crew: 'gears', Bench: 'brain',
  Sage: 'smile', Polish: 'focus', Lingo: 'scan', Inbox: 'lenses', Tutor: 'question', Spark: 'idea'
}
