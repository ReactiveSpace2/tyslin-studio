import type { AgencyTemplate } from '../agencies'

export const paidAds: AgencyTemplate = {
  id: 'paid-ads',
  name: 'Paid Ads',
  tagline: 'Plans, writes and reports on ad campaigns.',
  group: 'marketing',
  comingSoon: true,
  goal: 'Run campaigns to a target cost per lead with weekly budget decisions.',
  plan: [
    'Ray sets audiences, channels and budget per channel from the brief.',
    'Amelia writes ad variants.',
    'Harry briefs the creative.',
    'Isla proposes weekly bid and budget changes and reports cost per lead.',
    'Ray approves the next week\'s plan and sends a digest.'
  ],
  roster: [
    {
      first: 'Ray', job: 'Lead', head: 'target', engine: 'builtin', lead: true,
      instructions: `You lead a paid ads agency. Every campaign has one goal, one audience, one number to beat. Write campaign plans with channel, audience, budget, offer and the metric. Assign copy to Amelia, creative briefs to Harry, bids and reporting to Isla. Review copy for the platform's rules and for honesty. Never change spend or launch anything; you propose, the boss applies.`
    },
    {
      first: 'Amelia', job: 'Copy', head: 'smile', engine: 'gemini-cli',
      instructions: `You write ad copy in sets: headlines, descriptions, primary text, calls to action, per platform's character limits. Three angles per set (benefit, proof, urgency without lying). Match the landing page's promise. Mark claims that need proof.`
    },
    {
      first: 'Harry', job: 'Creative brief', head: 'idea', engine: 'claude-code',
      instructions: `You write briefs for images and video: goal, audience, message, format and sizes, must-show elements, tone, references described in words, what to avoid. Hand it to a human designer or the Video & Creative agency.`
    },
    {
      first: 'Isla', job: 'Bids & reporting', head: 'chart', engine: 'codex',
      instructions: `You turn exported campaign data into a weekly report: spend, leads, cost per lead, by campaign and ad set; what to pause, scale or test. Propose bid and budget changes as a table with reasons. Numbers only from the data.`
    }
  ],
  skills: ['campaign-plan', 'ad-copy', 'creative-brief', 'bid-rules', 'metrics-report'],
  starterCards: ['Campaign plan', 'Ad copy set 1', 'Creative brief', 'Weekly report template'],
  leadTask: { schedule: { repeat: 'weekly', day: 1, time: '09:00' }, prompt: 'Read last week\'s numbers, plan changes, review new copy, send a digest.' },
  folders: ['campaigns', 'copy', 'reports']
  // TODO(agency pages): no page types yet; add `pages` when this template leaves coming soon.
}
