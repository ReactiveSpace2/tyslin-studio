import type { Session } from './types'

/**
 * Whether a Lead chat is a task the boss started, as opposed to a chat Tyslin made for it: a card run ("Card: …",
 * cards.ts) or the Lead's Inbox answers ("Your answers", channels.ts). Only a real task ends the previous task's
 * window on the team's board and messages. 17 Nov 2026: a Lead that ran its own card opened a "Card: …" chat, and
 * every question, review and the Plan card after it disappeared from the task while the sidebar still counted them.
 */
export const isTaskChat = (s: Pick<Session, 'title'>): boolean => !s.title.startsWith('Card: ') && s.title !== 'Your answers'
