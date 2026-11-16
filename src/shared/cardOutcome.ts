/**
 * How a worker says where its card stands (QA 16 Nov 2026). Every card prompt asks the worker to end its reply with
 * one "Outcome:" line; cards.ts reads it when the run ends:
 * - "Outcome: done" → the card goes to Review as before.
 * - "Outcome: done with open issues: …" → Review, with the issues kept on the card. The Lead can't move it to Done
 *   without sending it back or saying the boss accepted them (boardTools.ts board_move_card).
 * - "Outcome: blocked: …" → the card fails with that reason and the Lead is asked to unblock it. Before this, a worker
 *   that only asked questions and wrote nothing still landed in Review as "finished".
 * A reply without the line counts as done (older adapters, short answers).
 */

/** The heading boardTools.ts puts above the open items it adds to a digest; App.tsx reads it (no Done mark while open). */
export const OPEN_ON_BOARD = 'Still open on the board:'

export type CardOutcome =
  | { kind: 'done' }
  | { kind: 'issues'; issues: string }
  | { kind: 'blocked'; why: string }

export const OUTCOME_INSTRUCTION = 'End your reply with one last line that says where the card stands, exactly one of:\n'
  + 'Outcome: done\n'
  + 'Outcome: done with open issues: <the problems still open, in a few words each>\n'
  + 'Outcome: blocked: <what you need and from whom>\n'
  + 'Use "blocked" when you could not do the card (missing information, files or access) and "done with open issues" when you did it but something still fails or is unchecked. Never write "done" when a check you ran failed.'

const LINE = /^[\s>*_`-]*outcome\s*[:：]\s*[*_`]*\s*(done with open issues|blocked|done)\b[*_`]*\s*[:：—–-]?\s*(.*?)[\s*_`]*$/i

export function parseOutcome(text: string): CardOutcome | null {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  // The last Outcome line wins (a worker may quote the instruction earlier in its reply).
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = LINE.exec(lines[i])
    if (!m) continue
    const kind = m[1].toLowerCase()
    const rest = m[2].replace(/^[\s*_`:：—–-]+/, '').trim()
    if (kind === 'blocked') return { kind: 'blocked', why: rest || 'no reason given' }
    if (kind === 'done with open issues') return { kind: 'issues', issues: rest || 'not listed' }
    return { kind: 'done' }
  }
  return null
}
