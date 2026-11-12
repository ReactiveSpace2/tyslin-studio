import { MCP_PRESETS } from './mcpPresets'
import type { McpServerInfo } from './types'

/**
 * Tools the chat can hand to a team without the Connectors tab (owner, 12 Nov 2026: C + D on the canvas, "Tools from
 * the chat"). A tool is either one of the token presets in mcpPresets.ts or a command that runs on this computer and
 * needs no account. Commands come only from the project's own docs. The words here are what the user reads: "tool",
 * "browser", never server or MCP.
 */
export interface ToolDef {
  id: string
  /** The connector name agents see (McpServerInfo.name). */
  name: string
  title: string
  /** What it gives the team, in one line. */
  line: string
  /** A token preset (mcpPresets.ts) … */
  presetId?: string
  /** … or a command that runs here, no account needed. */
  commandLine?: string
  /** The MCP Registry name, kept as `source` so the Connectors tab shows where it came from. */
  source?: string
  /** Shown under the title: "free · runs on this computer · no account needed". */
  needs: string
}

export const TOOL_CATALOG: ToolDef[] = [
  // Microsoft's Playwright MCP server, from github.com/microsoft/playwright-mcp (README: `npx @playwright/mcp@latest`).
  { id: 'playwright', name: 'playwright', title: 'Playwright', line: 'A browser for the team: open pages, click through them, take screenshots.', commandLine: 'npx -y @playwright/mcp@latest', source: 'io.github.microsoft/playwright-mcp', needs: 'Free · runs on this computer · no account needed' },
  ...MCP_PRESETS.map((p): ToolDef => ({ id: p.id, name: p.name, title: p.title, line: p.line, presetId: p.id, needs: `Needs your ${p.title} ${p.tokenLabel.toLowerCase()}` }))
]

export const toolById = (id: string): ToolDef | undefined => TOOL_CATALOG.find((t) => t.id === id)

/** The connector that is this tool, if the team has one (by preset, else by name). */
export function connectedTool(tool: ToolDef, servers: McpServerInfo[], teamIds: Set<string>): McpServerInfo | undefined {
  return servers.find((s) => (tool.presetId ? s.preset === tool.presetId : s.name === tool.name) && (s.agentIds.length === 0 || s.agentIds.some((id) => teamIds.has(id))))
}

/** What an agent said that a tool would solve: the tool and a one-line reason for the card in the thread. */
export interface ToolHint { toolId: string; reason: string }

const CANT = /\b(can'?t|cannot|unable to|not able to|no way to|don'?t have|without|lack|need(?:s)? (?:a|access))\b/i

/** Reads an agent's text for a need the catalogue answers: a browser first, then GitHub, Linear, Stripe. Null when nothing fits. */
export function toolHint(text: string, isConnected: (toolId: string) => boolean): ToolHint | null {
  const t = text.slice(0, 4000)
  if (!isConnected('playwright') && (/\b(no|without a|need(?:s)? a|lack(?:s)? a) browser\b/i.test(t) || (CANT.test(t) && /\b(open|see|view|look at|load|render|visit|check|screenshot)\b[^.]{0,60}\b(page|site|website|url|screen|layout|mockup|localhost|browser)\b/i.test(t)) || /\b(headless (?:chrome|chromium)|puppeteer|playwright)\b/i.test(t) && CANT.test(t)))
    return { toolId: 'playwright', reason: 'needs a browser to open pages and take screenshots' }
  if (!isConnected('github') && CANT.test(t) && /\b(github|pull requests?|\bPRs?\b|repository issues?|issues? (?:on|in) (?:the )?repo)\b/i.test(t))
    return { toolId: 'github', reason: 'needs GitHub to read issues and pull requests' }
  if (!isConnected('linear') && CANT.test(t) && /\blinear\b/i.test(t))
    return { toolId: 'linear', reason: 'needs Linear to read and update tickets' }
  if (!isConnected('stripe') && CANT.test(t) && /\bstripe\b/i.test(t))
    return { toolId: 'stripe', reason: 'needs Stripe to look at customers and payments' }
  return null
}

/** A tool by id, title or connector name, any case ("Playwright", "github", "a browser"). */
export function resolveTool(name: string): ToolDef | undefined {
  const n = name.trim().toLowerCase().replace(/^(a |the )/, '')
  if (n === 'browser' || n === 'a browser') return toolById('playwright')
  return TOOL_CATALOG.find((t) => t.id === n || t.name === n || t.title.toLowerCase() === n)
}

/** How a need reads to the boss: "a browser (Playwright)", "GitHub", "the accessibility-check skill". */
export function needLabel(need: { kind: 'tool' | 'skill'; name: string }): string {
  if (need.kind === 'skill') return `the ${need.name} skill`
  const t = resolveTool(need.name)
  return t ? (t.id === 'playwright' ? 'a browser (Playwright)' : t.title) : need.name
}

/** Whether a connector is this tool (by preset, else by name), for needs the Lead wrote. */
export const serverIsTool = (s: McpServerInfo, name: string): boolean => {
  const t = resolveTool(name)
  return t ? (t.presetId ? s.preset === t.presetId : s.name === t.name) : s.name === name.trim().toLowerCase()
}

export interface SkillLike { name: string; description: string }

const SKILL_NEED = /\b(?:don'?t|do not|doesn'?t|didn'?t) have (?:a |an |any )?(?:checklist|guide|skill|instructions?|template|playbook|process|method|rubric)\b|\bnot sure how to\b|\bno (?:checklist|guide|instructions|template|process|rubric) for\b|\bgoing by what i know\b|\bwithout (?:a |any )?(?:checklist|guide|instructions)\b|\bwould help to have\b/i
const STOP = new Set(['that','this','with','from','have','what','when','which','will','your','their','there','about','into','then','than','them','they','been','were','page','file','files','task','card','work','make','also','just','like','more','some','only','very','each','does','done','need','needs','know','going','check','checks','write','using','used'])
const words = (t: string): Set<string> => new Set(t.toLowerCase().replace(/[^a-z0-9-]+/g, ' ').split(' ').filter((w) => w.length > 3 && !STOP.has(w)))

/**
 * D on the canvas, for skills: an agent said it lacks a checklist or a way to do something. The library skill whose
 * name and description share the most words with that text wins (at least two), unless it is attached already.
 */
export function skillHint(text: string, skills: SkillLike[], attached: Set<string>): { name: string; reason: string } | null {
  const t = text.slice(0, 4000)
  const m = SKILL_NEED.exec(t)
  if (!m) return null
  // The sentence around the phrase says what is missing.
  const start = Math.max(0, t.lastIndexOf('.', m.index) + 1)
  const end = t.indexOf('.', m.index + m[0].length)
  const around = words(t.slice(start, end < 0 ? undefined : end + 1))
  let best: { name: string; score: number; description: string } | null = null
  for (const s of skills) {
    if (attached.has(s.name)) continue
    const own = new Set([...s.name.split('-'), ...words(s.description)].filter((w) => w.length > 3 && !STOP.has(w)))
    let score = 0
    for (const w of own) if (around.has(w) || [...around].some((a) => a.startsWith(w) || w.startsWith(a))) score++
    if (score >= 2 && (!best || score > best.score)) best = { name: s.name, score, description: s.description }
  }
  return best ? { name: best.name, reason: `could use the ${best.name} skill: ${best.description.replace(/\.$/, '').toLowerCase()}` } : null
}
