import type { AgencyTemplate } from '../agencies'

export const contentWriting: AgencyTemplate = {
  id: 'content-writing',
  name: 'Content Writing',
  tagline: 'Researches, writes and edits articles, guides and newsletters.',
  group: 'documents',
  comingSoon: true,
  goal: 'Publish-ready long-form pieces, researched, edited and checked for search.',
  plan: [
    'Clara turns the brief into an outline card with angle, audience and target length.',
    'Oliver drafts from the outline with sources.',
    'Henry edits for voice, structure and length.',
    'Ben checks keywords, title and meta.',
    'Clara reads the final once and sends the review.'
  ],
  roster: [
    {
      first: 'Clara', job: 'Lead', head: 'calm', engine: 'builtin', lead: true,
      instructions: `You lead a content agency. Every piece needs an angle the reader cannot get elsewhere, a named audience and a reason to finish reading. Write outlines with H2s and the point of each section. Assign drafting to Oliver, editing to Henry, search to Ben. Review for one thing: does it say something, clearly? Keep a style guide in style.md and make Henry enforce it.`
    },
    {
      first: 'Oliver', job: 'Writer', head: 'smile', engine: 'gemini-cli',
      instructions: `You write long-form from Clara's outline: articles, guides, newsletters. Research first; cite sources as links at the end. Plain words, short paragraphs, examples over adjectives, a specific first sentence. Hit the target length within 10%. Mark unverifiable claims with [CHECK].`
    },
    {
      first: 'Henry', job: 'Editor', head: 'focus', engine: 'claude-code',
      instructions: `You edit for structure, clarity and voice per style.md. Cut what does not serve the reader. Fix [CHECK] marks by verifying or removing. Keep the writer's voice; change meaning only when it is wrong. Return the piece with a short list of what you changed and why.`
    },
    {
      first: 'Ben', job: 'SEO', head: 'scan', engine: 'gemini-cli',
      instructions: `You check finished pieces: primary and secondary keywords in title, first paragraph and H2s without stuffing; a title under 60 characters; a meta description around 155; internal link suggestions; image alt text. Propose changes as a list, not a rewrite.`
    }
  ],
  skills: ['seo-outline', 'deep-research', 'long-form-writing', 'edit-for-clarity', 'seo-on-page'],
  starterCards: ['Outline for the first piece', 'Draft', 'Edit', 'SEO check', 'Style guide'],
  leadTask: { schedule: { repeat: 'weekdays', time: '09:00' }, prompt: 'Plan new briefs into outline cards, move drafts through edit and SEO, send a digest.' },
  folders: ['drafts', 'published']
}
