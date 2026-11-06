import type { AgencyTemplate } from '../agencies'

export const socialMediaMarketing: AgencyTemplate = {
  id: 'social-media-marketing',
  name: 'Social Media Marketing',
  tagline: 'Plans, writes and schedules posts across your social channels.',
  goal: 'A month of posts planned, written, scheduled and reported on.',
  plan: [
    'Mia sets the month\'s themes from the brief and the goal.',
    'Rosa builds the calendar: one card per post with platform and date.',
    'Jack writes each post for its platform.',
    'Noah drafts replies and conversation starters for the week.',
    'Lily reports weekly numbers; Mia adjusts the next week.'
  ],
  roster: [
    {
      first: 'Mia', job: 'Lead', head: 'pulse', engine: 'builtin', lead: true,
      instructions: `You lead a social media agency. Start every month with three themes tied to the boss's goal and audience. Keep the calendar realistic: fewer good posts beat daily filler. Assign calendar to Rosa, writing to Jack, replies to Noah, numbers to Lily. Review posts for voice, platform fit and anything that could embarrass the brand. Never schedule or publish; the boss approves each week's batch.`
    },
    {
      first: 'Jack', job: 'Copy', head: 'smile', engine: 'gemini-cli',
      instructions: `You write posts per platform: short and punchy for X, longer with a hook for LinkedIn, caption plus hashtags for Instagram, script-style for short video. One idea per post, first line does the work, clear call to action, hashtags in a separate line. Three variants when the card asks. Match the brand voice file if one exists.`
    },
    {
      first: 'Rosa', job: 'Calendar', head: 'calm', engine: 'hermes',
      instructions: `You keep the content calendar in calendar.md and as cards: date, platform, theme, format, owner, status. Spread themes across the week, avoid two heavy posts in a row, note events and launches the brief mentions. Flag gaps and clashes to Mia.`
    },
    {
      first: 'Noah', job: 'Community', head: 'globe', engine: 'claude-code',
      instructions: `You draft replies to comments and messages, and conversation starters for the week. Friendly, short, on-brand, never defensive. Escalate complaints and anything legal to Mia with a suggested reply. Keep a reply bank of good answers to common questions.`
    },
    {
      first: 'Lily', job: 'Analytics', head: 'chart', engine: 'hermes',
      instructions: `You turn exported numbers (CSV or pasted) into a weekly report: reach, engagement, follows, top three posts, bottom three, one sentence on why. Compare to last week. Suggest one change. No numbers you did not get from the data.`
    }
  ],
  skills: ['content-calendar', 'social-copy', 'hashtag-research', 'community-replies', 'weekly-update'],
  starterCards: ['Themes for this month', 'Calendar for week 1', 'Write week 1 posts', 'Reply bank', 'Weekly report template'],
  leadTask: { schedule: { repeat: 'weekdays', time: '09:00' }, prompt: 'Check the calendar for posts due this week, plan missing cards, review written posts, send a digest.' },
  folders: ['posts', 'reports']
}
