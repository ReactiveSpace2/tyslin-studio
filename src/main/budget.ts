import type { Agency, ChannelMessage } from '@shared/types'
import * as db from './db'
import { sendToBoss } from './channels'

/**
 * The monthly cap (10 Nov 2026). Spend comes from the cost ledger for the current calendar month (db.monthSpend).
 * At the cap new card runs wait (cards.ts checks `atCap`); a card already running always finishes. The first time an
 * agency reaches its cap in a month, its Lead's message card asks the boss to raise the cap or keep it paused
 * (`agencies.cap_hold` = that month, so it asks once). The answer is handled here, never sent on to the Lead.
 */

/** "2026-11" for the month `t` falls in, local time. */
export const monthKey = (t = Date.now()): string => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

export const atCap = (a: Agency): boolean => a.budget !== null && a.spent >= a.budget

const resetDay = (a: Agency): string => new Date(a.resetsAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const usd = (n: number): string => `$${n.toFixed(2)}`

/** The reason a card can't start at the cap, for runCard's error and the card log. */
export const capMessage = (a: Agency): string =>
  `${a.name} has reached its monthly cap (${usd(a.spent)} of ${usd(a.budget ?? 0)}). Raise it on the agency's Budget tab, or wait until ${resetDay(a)}.`

/** After a run's ledger row: ask the boss once per month when the agency has reached its cap. */
export async function afterRunCost(agencyId: string | null): Promise<void> {
  if (!agencyId) return
  const a = db.getAgency(agencyId)
  if (!a || !atCap(a) || db.getCapHold(a.id) === monthKey()) return
  db.setCapHold(a.id, monthKey())
  const lead = a.leadId ? db.getAgent(a.leadId) : null
  if (!lead) return
  const text = `${a.name} has reached its monthly cap: ${usd(a.spent)} of ${usd(a.budget ?? 0)}. New cards wait until you raise the cap or the month ends on ${resetDay(a)}. A card already running finishes.`
  try { await sendToBoss(a, lead, 'budget', text) } catch (err) { console.warn('[budget] message not sent:', err instanceof Error ? err.message : err) }
}

/** Set by index.ts: start the next planned card again (cards.runNext) once the cap is raised. */
let resume: (agencyId: string) => void = () => {}
export function setBudgetResume(fn: (agencyId: string) => void): void { resume = fn }

/**
 * The boss answered a budget message (in the app, or by replying on Telegram or Slack): "Raise the cap to $75" raises
 * it and lets planned cards run again; anything else keeps it paused until the month ends.
 */
export function answerBudget(m: ChannelMessage, answer: string): ChannelMessage {
  const a = db.getAgency(m.agencyId)
  if (!a) throw new Error('That agency no longer exists.')
  const raise = /\b(raise|increase|set|up|cap)\b[^0-9]*\$?\s*(\d+(?:\.\d+)?)/i.exec(answer) ?? /^\s*\$?\s*(\d+(?:\.\d+)?)\s*$/.exec(answer)
  const amount = raise ? Number(raise[raise.length - 1]) : NaN
  let reply: string
  if (Number.isFinite(amount)) {
    if (amount <= a.spent) throw new Error(`Raise it above what's spent this month (${usd(a.spent)}), or keep it paused.`)
    db.updateAgency(a.id, { budget: amount })
    db.setCapHold(a.id, null)
    reply = `Raised the cap to ${usd(amount)}.`
  } else {
    reply = `Kept paused until ${resetDay(a)}.`
  }
  const saved = db.replyChannelMessage(m.id, reply)!
  if (Number.isFinite(amount)) resume(a.id)
  return saved
}

/** A cap raised on the Budget tab: clear the hold, answer an open budget message, and let planned cards run again. */
export function onCapChanged(before: Agency, after: Agency): void {
  if (before.budget === after.budget) return
  if (!atCap(after)) {
    db.setCapHold(after.id, null)
    for (const m of db.listChannelMessages(after.id)) if (m.kind === 'budget' && !m.reply) db.replyChannelMessage(m.id, `Cap changed to ${after.budget === null ? 'none' : usd(after.budget)} on the Budget tab.`)
    resume(after.id)
  }
}

/** Home's alerts: agencies past their alert threshold this month (`capped` once they reached the cap). */
export function budgetAlerts(): { agencyId: string; spent: number; budget: number; alertAt: number; capped: boolean }[] {
  return db.listAgencies().filter((a) => a.budget !== null && a.budget > 0 && a.spent >= a.budget * a.alertAt)
    .map((a) => ({ agencyId: a.id, spent: a.spent, budget: a.budget!, alertAt: a.alertAt, capped: atCap(a) }))
}
