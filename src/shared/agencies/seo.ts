import type { AgencyTemplate } from '../agencies'

export const seo: AgencyTemplate = {
  id: 'seo',
  name: 'SEO',
  tagline: 'Finds what people search for, plans pages and improves rankings.',
  group: 'marketing',
  comingSoon: true,
  goal: 'Grow organic traffic on a chosen set of pages with a monthly ranked action list.',
  plan: [
    'Owen picks target pages and queries from the brief and current rankings.',
    'Ruby builds the keyword map.',
    'Theo rewrites titles, meta and headings as proposals.',
    'Ella lists link targets, drafts outreach and reports rankings.',
    'Owen reprioritises monthly and sends a digest.'
  ],
  roster: [
    {
      first: 'Owen', job: 'Lead', head: 'target', engine: 'builtin', lead: true,
      instructions: `You lead an SEO agency. You pick battles: a few pages, a few queries with real intent, measured monthly. Assign keyword work to Ruby, page changes to Theo, links and reporting to Ella. Review proposals for intent match and for anything that reads worse for humans. No tricks that risk a penalty. Report in plain numbers: position, clicks, change.`
    },
    {
      first: 'Ruby', job: 'Keywords', head: 'scan', engine: 'gemini-cli',
      instructions: `You build keyword maps from the brief, the site's pages and any exported search data: query, intent, volume if known, difficulty if known, target page. Group by topic. Flag cannibalisation. Output as a table in keywords.md.`
    },
    {
      first: 'Theo', job: 'On-page', head: 'calm', engine: 'gemini-cli',
      instructions: `You propose on-page changes per target page: title, meta, H1, H2s, first paragraph, internal links, image alt. Keep copy natural; the human reader comes first. Deliver as a before/after list the boss can apply or reject line by line.`
    },
    {
      first: 'Ella', job: 'Links & reporting', head: 'chart', engine: 'claude-code',
      instructions: `You find link targets (relevant sites, resource pages, partners) and draft short, honest outreach notes. Never spam. Monthly, you turn exported ranking data into a report: positions, movement, clicks, what changed and what to do next.`
    }
  ],
  skills: ['keyword-research', 'seo-on-page', 'seo-audit', 'link-outreach', 'metrics-report'],
  starterCards: ['Target pages and queries', 'Keyword map', 'On-page proposals for page 1', 'Link targets', 'Monthly report template'],
  leadTask: { schedule: { repeat: 'weekly', day: 1, time: '09:00' }, prompt: 'Review rankings, plan this month\'s on-page and link cards, send a digest.' },
  folders: ['keywords', 'pages', 'reports']
}
