/**
 * Integrations suggested on each agency's Integrations screen, by template id (src/shared/agencies/).
 * `presets` are ids from mcpPresets.ts (connect with a token); `searches` are app names that run an MCP Registry
 * search. These are suggestions only: every integration needs the user's own token, so nothing is installed for them.
 */
export const AGENCY_INTEGRATIONS: Record<string, { presets: string[]; searches: string[] }> = {
  'app-development': { presets: ['github', 'linear'], searches: ['sentry', 'vercel', 'supabase'] },
  devops: { presets: ['github'], searches: ['cloudflare', 'sentry', 'aws', 'docker'] },
  'qa-testing': { presets: ['github', 'linear'], searches: ['playwright', 'sentry', 'browserstack'] },
  'mobile-apps': { presets: ['github', 'linear'], searches: ['expo', 'firebase', 'app store'] },
  'web-design': { presets: ['github'], searches: ['figma', 'webflow', 'vercel'] },
  'product-management': { presets: ['linear', 'github'], searches: ['notion', 'jira', 'posthog'] },
  'finance-bookkeeping': { presets: ['stripe'], searches: ['quickbooks', 'xero', 'google sheets'] },
  'sales-lead-gen': { presets: [], searches: ['hubspot', 'salesforce', 'apollo', 'linkedin'] },
  'email-marketing': { presets: [], searches: ['mailchimp', 'resend', 'hubspot', 'brevo'] },
  'customer-support': { presets: ['stripe', 'linear'], searches: ['intercom', 'zendesk', 'gmail'] },
  'paid-ads': { presets: [], searches: ['google ads', 'meta ads', 'linkedin ads'] },
  'social-media-marketing': { presets: [], searches: ['buffer', 'linkedin', 'instagram', 'youtube'] },
  'content-writing': { presets: [], searches: ['notion', 'wordpress', 'google docs'] },
  seo: { presets: [], searches: ['search console', 'ahrefs', 'semrush', 'wordpress'] },
  'data-analytics': { presets: ['stripe'], searches: ['postgres', 'bigquery', 'posthog', 'google sheets'] },
  'research-intelligence': { presets: [], searches: ['web search', 'firecrawl', 'arxiv', 'crunchbase'] },
  'legal-contracts': { presets: [], searches: ['docusign', 'google drive', 'notion'] },
  'hr-recruiting': { presets: [], searches: ['greenhouse', 'linkedin', 'google calendar'] },
  'video-creative': { presets: [], searches: ['youtube', 'figma', 'canva'] },
  'startup-visa': { presets: [], searches: ['google drive', 'notion', 'google calendar'] }
}
