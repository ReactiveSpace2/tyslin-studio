import type { AgencyTemplate } from '../agencies'

/**
 * Design (owner, 17 Nov 2026): a Lead and one designer who draws on the Design board: artboards for web pages, app
 * screens, social posts and print, each a self-contained HTML file in design/. The designer writes directly (no
 * review) so the boss sees the artboards change live, and the boss can tweak any artboard by hand on the board.
 * Quick (owner, 17 Nov 2026): a prompt becomes a card that runs at once, with no question list, plan approval or
 * review round; every artboard is saved as PNG and JPEG in design/exports/ (main/designExport.ts) for other teams.
 */
export const design: AgencyTemplate = {
  id: 'design',
  name: 'Design',
  tagline: 'Draws web pages, app screens, posts and print on live artboards.',
  group: 'design',
  goal: 'Turn a brief into finished artboards on the Design board, in one consistent style, ready to export or build.',
  plan: [
    'Iris turns your prompt into a card for Remy at once, with sizes and copy, and asks only when it is unclear what to make.',
    'Remy puts each artboard on the Design board and draws it while you watch, one at a time.',
    'Remy keeps the brand in design/styles.css so every artboard matches.',
    'Iris: Tyslin saves every artboard as a PNG and a JPEG in design/exports/ for your other teams.',
    'Iris: you check and tweak the artboards by hand on the board, or ask for changes in the task.'
  ],
  roster: [
    {
      first: 'Iris', job: 'Lead', head: 'lenses', engine: 'builtin', lead: true,
      instructions: `You lead a design team, and speed matters: the boss is watching the Design board. When a prompt comes in, hand it to Remy straight away as a card: what to make, each artboard's size (use the artboard sizes skill), the exact copy, and the style or brand to follow. Fill gaps with sensible defaults and say them, rather than asking. One card per small set of matching artboards (a post and its story), so the first one shows quickly. Don't plan briefs, documents or checks: the artboards are the work.`
    },
    {
      first: 'Remy', job: 'Designer', head: 'profile', engine: 'claude-code', writeMode: 'direct',
      instructions: `You are a visual designer, and the boss watches the Design board while you draw. Every artboard is one HTML file in design/ at its exact size, listed in design/board.json (follow the artboards skill): add the entry first, then write the file at once, one artboard after another. Keep the brand in design/styles.css and use it on every artboard. Design with a clear hierarchy: one focal point, generous space, a type scale, two or three colours with real contrast. Use the boss's logo and pictures from the folder; when a picture is missing, draw a labelled placeholder box, never a picture from the web. No lorem ipsum: use the copy on the card, or [PLACEHOLDER]. Make only artboards: no notes, reports, test pages or temporary files, and no shell checks; Tyslin saves the PNG and JPEG copies itself.`
    }
  ],
  skills: ['design-brief', 'ux-copy', 'accessibility-check', 'artboards', 'artboard-sizes', 'brand-styles', 'playful-footer'],
  // Anthropic's frontend-design skill (Apache 2.0), installed from GitHub with the Claude skills pack.
  packSkills: [{ pack: 'anthropic-skills', skill: 'frontend-design', for: ['Remy'] }],
  starterCards: [],
  quick: true,
  leadTask: { schedule: { repeat: 'weekdays', time: '09:00' }, prompt: 'Review the Design board against open briefs, plan the next artboards, send a digest.' },
  intake: [
    'What should we design: web pages, app screens, social posts, a brochure or flyer? How many of each?',
    'Do you have a logo, brand colours and fonts? Attach them, or say "start fresh" and we propose a style.',
    'Who is it for, and the one thing each piece must make them do or feel?',
    'Do you have the words and pictures, or should we write placeholder copy and leave picture boxes?',
    'Two or three designs you like (links or screenshots), and what you like about them.',
    'For print: the paper size, folds, and whether it goes to a printer (who needs bleed) or a desk printer.'
  ],
  folders: ['design', 'design/assets', 'design/exports'],
  pages: [{ id: 'board', kind: 'design', title: 'Design board', about: 'the artboards the team draws', file: 'design/board.json' }]
}
