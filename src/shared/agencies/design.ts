import type { AgencyTemplate } from '../agencies'

/**
 * Design (owner, 17 Nov 2026): a Lead and one designer who draws on the Design board: artboards for web pages, app
 * screens, social posts and print, each a self-contained HTML file in design/. The designer writes directly (no
 * review) so the boss sees the artboards change live, and the boss can tweak any artboard by hand on the board.
 */
export const design: AgencyTemplate = {
  id: 'design',
  name: 'Design',
  tagline: 'Draws web pages, app screens, posts and print on live artboards.',
  group: 'design',
  goal: 'Turn a brief into finished artboards on the Design board, in one consistent style, ready to export or build.',
  plan: [
    'Iris turns the brief into a list of artboards with sizes, and asks for the brand, copy and pictures.',
    'Remy sets the brand styles once in design/styles.css: colours, type, spacing.',
    'Remy draws each artboard on the Design board, one file per artboard.',
    'Iris checks every artboard against the brief, the sizes and contrast, and sends changes back.',
    'Iris sends the boss the board to review, tweak by hand and export.'
  ],
  roster: [
    {
      first: 'Iris', job: 'Lead', head: 'lenses', engine: 'builtin', lead: true,
      instructions: `You lead a design team. Turn every brief into a list of artboards: what each one is for, its size (use the artboard sizes skill), and the copy and pictures it needs. One card per artboard or per small set of matching artboards (a post and its story), each with the size and the exact copy in the notes. The first card of a new brand sets design/styles.css. Review each artboard on the Design board: does it say the one thing it must say, at its size, in the brand's style, with readable text? Send it back with a concrete note when it doesn't.`
    },
    {
      first: 'Remy', job: 'Designer', head: 'profile', engine: 'claude-code', writeMode: 'direct',
      instructions: `You are a visual designer. You draw on the Design board: every artboard is one HTML file in design/ at its exact size, listed in design/board.json (follow the artboards skill). Set the brand once in design/styles.css and use it on every artboard. Design with a clear hierarchy: one focal point, generous space, a type scale, two or three colours with real contrast. Use the boss's logo and pictures from the folder; when a picture is missing, draw a labelled placeholder box, never a picture from the web. No lorem ipsum: use the copy on the card, or [PLACEHOLDER].`
    }
  ],
  skills: ['design-brief', 'ux-copy', 'accessibility-check', 'artboards', 'artboard-sizes', 'brand-styles', 'playful-footer'],
  // Anthropic's frontend-design skill (Apache 2.0), installed from GitHub with the Claude skills pack.
  packSkills: [{ pack: 'anthropic-skills', skill: 'frontend-design', for: ['Remy'] }],
  starterCards: ['Brand styles', 'First artboards'],
  leadTask: { schedule: { repeat: 'weekdays', time: '09:00' }, prompt: 'Review the Design board against open briefs, plan the next artboards, send a digest.' },
  intake: [
    'What should we design: web pages, app screens, social posts, a brochure or flyer? How many of each?',
    'Do you have a logo, brand colours and fonts? Attach them, or say "start fresh" and we propose a style.',
    'Who is it for, and the one thing each piece must make them do or feel?',
    'Do you have the words and pictures, or should we write placeholder copy and leave picture boxes?',
    'Two or three designs you like (links or screenshots), and what you like about them.',
    'For print: the paper size, folds, and whether it goes to a printer (who needs bleed) or a desk printer.'
  ],
  folders: ['briefs', 'design', 'design/assets', 'exports'],
  pages: [{ id: 'board', kind: 'design', title: 'Design board', about: 'the artboards the team draws', file: 'design/board.json' }]
}
