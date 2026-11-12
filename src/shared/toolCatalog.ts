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
