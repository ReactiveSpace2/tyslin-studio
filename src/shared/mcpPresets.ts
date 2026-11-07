/**
 * Featured integrations: official remote MCP servers that take a token in an Authorization header.
 * Each entry is copied from the company's own docs (checked 7 Nov 2026); change them only from those docs.
 * Servers that only sign in with OAuth (Notion's remote server, for example) wait until Tyslin supports MCP OAuth.
 */
export interface McpPreset {
  id: string
  name: string
  title: string
  line: string
  url: string
  tokenLabel: string
  tokenPlaceholder: string
  tokenUrl: string
  docsUrl: string
  /** Shown under the token field. */
  tokenHint: string
}

export const MCP_PRESETS: McpPreset[] = [
  {
    id: 'github', name: 'github', title: 'GitHub', line: 'Issues, pull requests, code search and repositories.',
    url: 'https://api.githubcopilot.com/mcp/', tokenLabel: 'Personal access token', tokenPlaceholder: 'github_pat_… or ghp_…',
    tokenUrl: 'https://github.com/settings/personal-access-tokens', docsUrl: 'https://github.com/github/github-mcp-server',
    tokenHint: 'A fine-grained token limited to the repositories your agents should touch.'
  },
  {
    id: 'linear', name: 'linear', title: 'Linear', line: 'Find, create and update issues, projects and comments.',
    url: 'https://mcp.linear.app/mcp', tokenLabel: 'API key', tokenPlaceholder: 'lin_api_…',
    tokenUrl: 'https://linear.app/settings/account/security', docsUrl: 'https://linear.app/docs/mcp',
    tokenHint: 'For read-only access, create a key with only the Read permission.'
  },
  {
    id: 'stripe', name: 'stripe', title: 'Stripe', line: 'Customers, invoices, subscriptions, payments and Stripe docs.',
    url: 'https://mcp.stripe.com', tokenLabel: 'Agent API key', tokenPlaceholder: 'Agent API key from the Stripe Dashboard',
    tokenUrl: 'https://dashboard.stripe.com/apikeys', docsUrl: 'https://docs.stripe.com/mcp',
    tokenHint: 'Use an agent API key with only the permissions your agents need. Try it in a sandbox first.'
  }
]
