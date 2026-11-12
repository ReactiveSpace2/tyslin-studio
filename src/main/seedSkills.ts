import type { Skill } from '@shared/types'
import { AGENCY_SKILLS } from './seedSkillsAgencies'

/**
 * Built-in skill library. Written for Tyslin: plain instructions that work with what an agent
 * has here (the conversation and, in a linked project, its files). No connectors assumed.
 * Bump SKILL_LIBRARY_VERSION when adding skills so existing installs pick them up.
 */
export const SKILL_LIBRARY_VERSION = 6

export const BUILT_IN_SKILLS: Omit<Skill, 'id'>[] = [
  ...AGENCY_SKILLS,
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
  },
  // Skills for the built-in agents (seedAgents.ts)
  {
    name: 'task-delegation',
    description: 'Split a goal into tasks with one owner and a definition of done each.',
    body: `Break the goal into tasks small enough to finish in a week.
Give each task one owner, a definition of done, and the goal it serves.
Order tasks so nothing waits on work that isn't planned.
If a task has no sensible owner, or no clear done, say so instead of assigning it.`
  },
  {
    name: 'issue-triage',
    description: 'Label an issue, check it can be reproduced and decide the next step.',
    body: `Restate the issue in one line in your own words.
Label it: bug, feature, question or duplicate. For a duplicate, name the original.
For a bug, write the steps to reproduce, what was expected and what happened.
If you can't reproduce it, say what you tried and what information is missing.
Suggest a priority: now, soon or later, with one line of reasons.`
  },
  {
    name: 'code-review',
    description: 'Review a code change for bugs first, then clarity.',
    body: `Read the whole change before commenting.
List real problems first: wrong behaviour, missed cases, security, data loss. Give the file and line for each.
Then list smaller points: naming, duplication, missing tests.
For each point, say why it matters and suggest the fix.
If the change is good, say so. Don't invent problems to have something to say.`
  },
  {
    name: 'test-report',
    description: 'Run the checks a project has and report the real results.',
    body: `Find how the project runs its tests, typecheck and build (package scripts, Makefile, README).
Report each check: the command, passed or failed, and the relevant lines of output.
Never say a check passed if you didn't see it pass. If you can't run it, say so.
For a failure, say whether your change caused it or it was already failing.`
  },
  {
    name: 'changelog',
    description: 'Write a changelog entry users can understand.',
    body: `Group changes under Added, Changed, Fixed and Removed.
Write each line from the user's side: what they can now do, or what no longer goes wrong.
Leave out internal refactors unless they change behaviour.
Link the issue or pull request when there is one.`
  },
  {
    name: 'seo-outline',
    description: 'Plan a page or post around what readers search for.',
    body: `State the reader's question and the one search phrase the piece answers.
Write a title under 60 characters and a description around 155.
Outline the headings in order, each answering a part of the question.
List the facts or examples each section needs and where they come from.
Write for the reader first. Don't repeat the phrase to stuff keywords.`
  },
  {
    name: 'compare-options',
    description: 'Compare options side by side on the same criteria.',
    body: `Agree the criteria first, and which ones matter most.
Build one table: options as rows, criteria as columns, the same unit in each column.
Mark any cell you couldn't confirm as "unknown", not a guess.
Under the table, name the best option for the stated need and the main trade-off.`
  },
  {
    name: 'inbox-triage',
    description: 'Sort incoming messages, draft replies and flag what needs a person.',
    body: `Tag each message: question, bug, billing, feature request, spam or other.
Draft a reply only when the answer is in the material you were given.
Escalate to a person anything about money, legal matters, safety, or an upset customer, with one line on why.
Never promise refunds, dates or features. Drafts only; never send.
Return one row per message: sender, tag, action, draft or escalation reason.`
  },
  {
    name: 'eligibility-check',
    description: 'Check a case against a programme\'s written rules.',
    body: `Work only from the official guidance you were given, and note its date.
List every requirement. For each: met, not met or unclear, with the evidence.
Quote the rule for anything not met or unclear.
End with what to fix or confirm, and with whom. Say clearly that this is not legal advice.`
  },
  {
    name: 'document-checklist',
    description: 'Track every document an application or filing needs.',
    body: `List each required document with: who provides it, format, any certification or translation, and status.
Status is one of: have, requested, missing.
Put missing items with the longest lead time first.
Never mark a document as "have" unless you saw it or the user confirmed it.`
  },
  {
    name: 'data-cleanup',
    description: 'Clean a spreadsheet or CSV without losing information.',
    body: `Keep the original file untouched; write the cleaned copy to a new file.
Fix: one header row, consistent date and number formats, trimmed spaces, exact duplicate rows.
Don't delete rows that only look wrong. Flag them in a separate list instead.
Log every change: what, how many rows, and why.`
  },
  {
    name: 'metrics-report',
    description: 'Report this period\'s numbers against the last one.',
    body: `For each metric: this period, last period, change, and the source file.
Show the formula or query behind each number.
Explain a move only when the data shows the cause; otherwise write "cause unknown".
Flag missing or suspect data at the top instead of filling the gap.`
  },
  {
    name: 'lead-list',
    description: 'Build a list of leads with a source for every fact.',
    body: `Start from the ideal customer profile. If there isn't one, ask for it first.
For each lead record: company, person, role, why they fit, and where each fact came from.
Use only public, work-related information.
Score each lead as strong, possible or no fit. A short strong list beats a long weak one.`
  },
  {
    name: 'spec-breakdown',
    description: 'Turn a ticket into an ordered plan with checks.',
    body: `Restate what the ticket asks for and what is out of scope.
List the open questions; ask them before planning if they change the work.
Break the work into steps, each with the files it touches and how to check it is done.
Name the tests that prove the whole ticket works.`
  },
  {
    name: 'output-scoring',
    description: 'Score outputs against a rubric, fairly and the same way each time.',
    body: `Use a rubric of three to five criteria, each scored 1 to 5 with a line describing a 1, a 3 and a 5.
Score each output on its text alone; ignore which model or agent wrote it.
Give one line of reasons per score.
Report totals in a table. Call a winner only when the gap is clear; otherwise say it is close.`
  }
]
