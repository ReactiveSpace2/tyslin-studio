import { useEffect, useState } from 'react'
import type { Agency, KanbanDoc } from '@shared/types'

/** What an agency's board holds right now, for the status lines on Home and the agency Overview. */
export interface BoardStats {
  inbox: number
  planned: number
  inProgress: number
  review: number
  /** Estimated cost of runs in the last 7 days (USD), from the "finished · 0.0123 est." lines in card logs. */
  spentWeek: number
}

const EMPTY: BoardStats = { inbox: 0, planned: 0, inProgress: 0, review: 0, spentWeek: 0 }
const WEEK = 7 * 24 * 60 * 60 * 1000
// Old lines: "finished · 0.0123 est."; since the cost ledger (10 Nov 2026): "finished · $0.0123 est." or "· $0.0123" when billed.
const COST = / · \$?(\d+(?:\.\d+)?)(?: est\.)?$/

export async function readBoardStats(agency: Agency): Promise<BoardStats> {
  let doc: KanbanDoc
  try { doc = JSON.parse(await window.tyslin.studio.read(agency.projectId, agency.boardPath)) as KanbanDoc } catch { return EMPTY }
  const since = Date.now() - WEEK
  const s = { ...EMPTY }
  for (const col of doc.columns ?? []) {
    const n = col.cards?.length ?? 0
    const t = col.title.trim().toLowerCase()
    if (t === 'inbox') s.inbox += n
    else if (t === 'planned') s.planned += n
    else if (t === 'in progress') s.inProgress += n
    else if (t === 'review') s.review += n
    for (const card of col.cards ?? []) {
      for (const e of card.log ?? []) {
        const m = e.at >= since ? COST.exec(e.text) : null
        if (m) s.spentWeek += Number(m[1])
      }
    }
  }
  return s
}

/** Board stats for each agency, by agency id; reloads when a board changes. */
export function useBoardStats(agencies: Agency[]): Record<string, BoardStats> {
  const [stats, setStats] = useState<Record<string, BoardStats>>({})
  const key = agencies.map((a) => `${a.id}:${a.boardPath}`).join('|')
  useEffect(() => {
    let live = true
    const load = (): void => {
      void Promise.all(agencies.map(async (a) => [a.id, await readBoardStats(a)] as const)).then((rows) => { if (live) setStats(Object.fromEntries(rows)) })
    }
    load()
    const off = window.tyslin.cards.onBoardChanged(() => load())
    return () => { live = false; off() }
  }, [key])
  return stats
}

export const plural = (n: number, one: string, many = one + 's'): string => `${n} ${n === 1 ? one : many}`

/** "$1.20"; very small amounts show as "<$0.01". */
export const money = (usd: number): string => usd > 0 && usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`

/** "Alex (Lead)" → "Alex". */
export const firstName = (name: string): string => name.replace(/\s*\([^)]*\)\s*$/, '').trim() || name
