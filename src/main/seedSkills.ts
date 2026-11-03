import type { Skill } from '@shared/types'

/**
 * Built-in skill library. Written for Tyslin: plain instructions that work with what an agent
 * has here (the conversation and, in a linked project, its files). No connectors assumed.
 * Bump SKILL_LIBRARY_VERSION when adding skills so existing installs pick them up.
 */
export const SKILL_LIBRARY_VERSION = 2

export const BUILT_IN_SKILLS: Omit<Skill, 'id'>[] = [
  // Original three
  { name: 'agent-design', description: 'Structure for designing a new agent.', body: 'When designing an agent, produce: name, one-line description, instructions, skills, tools, schedule.' },
  { name: 'cite-sources', description: 'Always attribute facts to their source.', body: 'For every factual claim, name the source. If there is no source, say so.' },
  { name: 'plain-language', description: 'Write for a busy non-expert reader.', body: 'Short sentences. No jargon without a definition. Lead with the answer.' },

  // Meetings and follow-up
  {
    name: 'meeting-notes',
    description: 'Turn rough notes or a transcript into decisions, actions and open questions.',
    body: `Work only from the notes or transcript you are given.
Return four short sections: Summary (3 lines max), Decisions, Actions (each with an owner and a date if one was said), Open questions.
Mark anything you inferred rather than read with "(inferred)".
Never invent names, dates or numbers. If an action has no owner, write "owner: not agreed".`
  },
  {
    name: 'follow-up-email',
    description: 'Draft the email to send after a meeting or call.',
    body: `Open with one line of thanks or context, not a recap of the whole meeting.
List what was agreed and who does what next, in the other side's terms.
End with one clear next step and a proposed date.
Under 150 words. Match the tone the user used in the meeting. Return it as a draft for the user to send.`
  },
  {
    name: 'meeting-prep',
    description: 'One-page brief to read before a meeting.',
    body: `Ask for, or use what you have on: who is attending, the goal of the meeting, and any history.
Return: the goal in one line, who they are and what each likely cares about, what we know so far, three to five questions to ask, and the outcome to aim for.
Separate facts you were given from your assumptions. Keep it to one screen.`
  },

  // Planning and updates
  {
    name: 'daily-plan',
    description: 'Turn a list of tasks and meetings into a realistic plan for today.',
    body: `Start with the three things that matter most today and why.
Place deep work around fixed meetings; leave buffer between them.
Flag anything overdue or blocked on someone else.
If there is more work than time, say what to drop or move, rather than squeezing it in.`
  },
  {
    name: 'weekly-update',
    description: 'Write a weekly update for a team, board or investors.',
    body: `Sections: Highlights, Numbers (only ones you were given), What slipped and why, Next week, Asks.
Lead each line with the result, then the detail.
Be honest about misses; one sentence on the cause and the fix.
Never fill in numbers you don't have; write [PLACEHOLDER] instead.`
  },
  {
    name: 'decision-memo',
    description: 'Lay out options, trade-offs and a recommendation for a decision.',
    body: `State the decision to be made in one sentence and the deadline if there is one.
Give two to four real options. For each: what it costs, what it gets us, the main risk.
Make a clear recommendation and say what would change your mind.
Keep it to one page.`
  },

  // Research
  {
    name: 'deep-research',
    description: 'Plan and write a thorough, sourced research report.',
    body: `First write a short plan: the questions to answer and where the answers could come from.
Use the sources you have (the conversation, project files). Note where each finding comes from.
Report: the answer up front, then findings by question, then gaps and what to check next.
Rate your confidence (high, medium, low) on each key finding and say why.`
  },
  {
    name: 'company-research',
    description: 'Brief on a company: what it does, who it serves, what is changing.',
    body: `Cover: what they sell and to whom, size and stage if known, recent changes, likely priorities, and how we might be relevant to them.
Only use information you were given or can read in the project; say plainly what is unknown.
Finish with three good opening questions for a first conversation.`
  },
  {
    name: 'competitor-brief',
    description: 'Compare us with a named competitor and say how to win.',
    body: `Table: where they are stronger, where we are stronger, where it is a draw.
Then: the customers who should pick us, the customers who should pick them, and the one or two points to lead with.
Be fair to the competitor; overclaiming loses trust.
Mark anything that needs checking as "to verify".`
  },
  {
    name: 'feedback-themes',
    description: 'Group customer feedback into themes with real quotes.',
    body: `Read all the feedback before grouping.
For each theme: a short name, how many pieces of feedback mention it, and two or three direct quotes with their source.
Order themes by how often they appear, then by severity.
Keep quotes word for word. Don't merge themes to make the list shorter.`
  },

  // Sales and outreach
  {
    name: 'outreach-email',
    description: 'A short, personal first email to a prospect.',
    body: `Under 100 words. One reason you are writing to this person specifically, one line on the problem you solve, one small ask.
No flattery, no buzzwords, no fake familiarity.
Write a subject line under six words.
Offer two variations with different openings.`
  },
  {
    name: 'objection-reply',
    description: 'Answer pushback from a customer or prospect.',
    body: `First restate the objection in one line to check you understood it.
Say what is fair about it. Then answer with specifics: what we do, an example, or a way to test it.
If the objection is right, say so and suggest a workaround or a fit check.
Keep the reply short enough to say out loud.`
  },
  {
    name: 'lead-qualify',
    description: 'Decide whether a lead is worth pursuing and what to do next.',
    body: `Check the lead against: fit (who they are), need (the problem), timing, and who decides.
Score each as strong, weak or unknown, with the evidence.
Give a verdict: pursue now, nurture, or pass, and the single next action.
Unknowns are questions to ask, not reasons to guess.`
  },

  // Writing and documents
  {
    name: 'one-pager',
    description: 'A one-page summary of a product, offer or proposal.',
    body: `Structure: the problem, who has it, what we offer, how it works in three steps, proof, and the next step.
One idea per section, short lines, no filler.
Use only claims and numbers you were given; write [PLACEHOLDER] for missing proof.`
  },
  {
    name: 'slide-outline',
    description: 'Outline a deck: one idea per slide.',
    body: `Start with the audience and the one thing they should remember.
For each slide give: a headline that states the point (a full sentence), two or three supporting lines, and what visual would help.
Aim for 8 to 12 slides. Put the ask or conclusion near the start, not only at the end.`
  },
  {
    name: 'edit-for-clarity',
    description: 'Tighten a draft without changing what it says.',
    body: `Keep the writer's meaning and voice. Cut repetition, filler and hedging.
Put the main point first in each paragraph. Prefer short words and active verbs.
Return the edited text, then a short list of the biggest changes and why.
If something is unclear or possibly wrong, flag it instead of rewriting it.`
  },
  {
    name: 'human-voice',
    description: 'Remove the habits that make writing sound machine-made.',
    body: `Look for: stock openers and closers, "it's not X, it's Y" contrasts, lists of three by reflex, piles of dashes, inflated claims, bold labels on every line, and vague words like "seamless" or "robust".
Rewrite those spots in plain, specific language. Leave the rest alone.
Do not add facts or change the meaning.`
  },

  // Data and files
  {
    name: 'data-analysis',
    description: 'Answer questions from a table or CSV, showing the working.',
    body: `Read the columns and a sample of rows first; say what each column seems to mean.
Answer the question in plain words first, then show the working briefly.
Point out gaps, odd values and anything that could mislead.
Never estimate a number you could calculate; never invent one you can't.`
  },
  {
    name: 'careful-edits',
    description: 'Change project files in small, reviewable steps.',
    body: `Read a file before you change it. Make the smallest change that does the job.
Keep the file's existing style. Don't reformat lines you are not changing.
Explain each change in one line. If you are unsure what the user wants, ask before editing.
If the user rejects a change, read their note and adjust rather than repeating it.`
  },
  {
    name: 'skill-writer',
    description: 'Help write a new skill for your agents.',
    body: `Ask what job the skill helps with and what a good result looks like.
Write: a short kebab-case name, a one-line description, and instructions of five to eight lines.
Instructions should say what to produce, in what structure, and what to avoid.
Keep it general enough to reuse across agents.`
  }
]
