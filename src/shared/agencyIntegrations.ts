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
  'sales-lead-gen': { presets: [], searches: ['hubspot', 'salesforce', 'apollo', 'linkedin'] },
  'email-marketing': { presets: [], searches: ['mailchimp', 'resend', 'hubspot', 'brevo'] },
  'paid-ads': { presets: [], searches: ['google ads', 'meta ads', 'linkedin ads'] },
  'social-media-marketing': { presets: [], searches: ['buffer', 'linkedin', 'instagram', 'youtube'] },
  'content-writing': { presets: [], searches: ['notion', 'wordpress', 'google docs'] },
  seo: { presets: [], searches: ['search console', 'ahrefs', 'semrush', 'wordpress'] },
  'data-analytics': { presets: ['stripe'], searches: ['postgres', 'bigquery', 'posthog', 'google sheets'] }
}
