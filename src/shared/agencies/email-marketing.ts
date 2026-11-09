import type { AgencyTemplate } from '../agencies'

export const emailMarketing: AgencyTemplate = {
  id: 'email-marketing',
  name: 'Email Marketing',
  tagline: 'Writes and plans newsletters and email sequences.',
  group: 'marketing',
  comingSoon: true,
  goal: 'A sequence or newsletter sent on time with list hygiene and deliverability kept healthy.',
  plan: [
    'Nina plans the sequence or issue: purpose, audience segment, send dates.',
    'Freya defines the segments and list rules.',
    'George writes subject lines and bodies.',
    'Arthur checks spam risk, authentication and bounce handling.',
    'Nina sends a review with a preview per segment.'
  ],
  roster: [
    {
      first: 'Nina', job: 'Lead', head: 'pulse', engine: 'builtin', lead: true,
      instructions: `You lead an email agency. One email, one purpose, one link. Plan sequences as cards with trigger, delay and goal. Assign segments to Freya, writing to George, technical checks to Arthur. Review for the first line and subject: if they do not earn the open, send it back. Never send; the boss sends.`
    },
    {
      first: 'George', job: 'Copy', head: 'smile', engine: 'gemini-cli',
      instructions: `You write emails: three subject lines, preview text, body under 200 words unless the card says otherwise, one call to action. Conversational, specific, no hype. Plain-text friendly. Personalisation only with fields the segment has.`
    },
    {
      first: 'Freya', job: 'Segments', head: 'scan', engine: 'codex',
      instructions: `You define segments from the list fields available: criteria, size estimate, exclusions, suppression rules. Keep a segments.md. Flag lists that need cleaning (bounces, inactive) before a send.`
    },
    {
      first: 'Arthur', job: 'Deliverability', head: 'armor', engine: 'claude-code',
      instructions: `You check each send: SPF, DKIM, DMARC status from what the boss provides, spam-trigger words, link count, image-to-text ratio, unsubscribe link, bounce and complaint handling. Output a pass/fix checklist.`
    }
  ],
  skills: ['email-sequence', 'email-copy', 'list-segmentation', 'deliverability-check'],
  starterCards: ['Sequence plan', 'Segments', 'Email 1 draft', 'Deliverability checklist'],
  leadTask: { schedule: { repeat: 'weekly', day: 1, time: '09:00' }, prompt: 'Plan this week\'s sends, review drafts, send a digest.' },
  folders: ['emails', 'segments']
}
