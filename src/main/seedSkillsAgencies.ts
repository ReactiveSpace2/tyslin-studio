import type { Skill } from '@shared/types'

/**
 * Built-in skills the agency templates (shared/agencies/) rely on, beyond the ones in seedSkills.ts.
 * Written for Tyslin; short, one job each. Added to BUILT_IN_SKILLS there.
 */
export const AGENCY_SKILLS: Omit<Skill, 'id'>[] = [
  // Software
  {
    name: 'spec-writing',
    description: 'Write a spec a worker can build from without asking.',
    body: `A spec has, in this order: the problem and who has it; what we will build (two or three sentences); acceptance criteria as a checklist, each one testable; a file map of what will change; non-goals; open questions.
Keep it under a page. Every criterion must be something a tester can mark pass or fail. If a number or a name is unknown, write [PLACEHOLDER], never a guess.`
  },
  {
    name: 'git-workflow',
    description: 'One branch per card, small commits, a clean PR.',
    body: `Work on a branch named after the card (kebab-case). Commit in small steps with messages that say what changed and why, in the present tense. Rebase on the main branch before opening a PR.
The PR description has three parts: what changed, how to test it, what is left. Never force-push a shared branch. Never commit secrets, keys or .env files.`
  },
  {
    name: 'test-runner',
    description: 'Run the project\'s tests and report the result plainly.',
    body: `Find how the project runs tests (package.json scripts, Makefile, CI config) and use that command, never your own. Run the whole suite unless the card narrows it.
Report: the command, pass and fail counts, the names of failing tests with their first error line, and the runtime. If the suite cannot run, say exactly what is missing. Do not change tests to make them pass.`
  },
  {
    name: 'test-plan',
    description: 'Turn a spec into test cases with priorities.',
    body: `From the spec's acceptance criteria write test cases: id, title, steps, expected result, priority (high for anything a user hits daily or that loses data). Cover the happy path, edge cases, error states, permissions and limits. List environments and what is out of scope. Save it where the project keeps test plans.`
  },
  {
    name: 'test-automation',
    description: 'Write automated tests in the project\'s framework.',
    body: `Use the test framework the project already has. One behaviour per test, named after that behaviour. Stable selectors and fixtures, no sleeps, no shared mutable state between tests. A failing test must say what was expected and what happened. A flaky test is a bug: report it, do not retry it in a loop.`
  },
  {
    name: 'release-checklist',
    description: 'A checklist to run before anything ships.',
    body: `Keep one checklist per release: version bumped, changelog written, tests green, build artefacts present, signing or certificates valid, screenshots current, review notes written, rollback step known. Tick items with evidence (a link or a command output), never from memory. The release is ready when every item is ticked, and only the boss ships it.`
  },
  {
    name: 'release-signoff',
    description: 'Decide, in writing, whether a release can go.',
    body: `Write a sign-off note: what was tested (plans and builds), what was not, open bugs by severity, and the decision: go or blocked. Any open critical bug blocks. Say why in one line each. The note is the record; keep it with the release.`
  },
  {
    name: 'store-listing',
    description: 'Write what an app store shows for an app.',
    body: `Produce the listing fields: name, subtitle, short and long description, keywords, what's-new text, the list of screenshots needed with what each shows, category, age rating answers and privacy answers. Plain, honest, no superlatives. Keep to each store's character limits and note them beside each field. Nothing is submitted by you.`
  },
  {
    name: 'ci-workflow',
    description: 'Maintain fast, clear CI pipelines.',
    body: `Use the CI platform the project already runs on. Stages in order: install, lint, test, build, package, deploy. Cache dependencies. Fail fast with readable output. Propose every change as a diff with the expected effect on run time and cost. Secrets come from the platform's secret store, never from files.`
  },
  {
    name: 'infra-as-code',
    description: 'Change infrastructure only through reviewed code.',
    body: `Write infrastructure as code in the tool the project uses. Every change: a diff, the plan or dry-run output, a rollback note and a cost estimate. Least privilege for every role and key. Tag resources with owner and purpose. Never apply a change yourself; the boss applies after review.`
  },
  {
    name: 'deploy',
    description: 'Describe a deploy so it can be repeated and undone.',
    body: `For each deploy write: what is being deployed (version, commit), where, the exact steps, how to check it worked, and how to roll back. Deploy only through the project's pipeline or documented command. Record the outcome and the time. If anything looks wrong, roll back first and investigate second.`
  },
  {
    name: 'incident-triage',
    description: 'Handle an alert or outage in a fixed order.',
    body: `When something breaks: confirm it is real, state the impact in one line, stop the bleeding (roll back or disable), then find the cause. Keep a timeline as you go. Afterwards write a short post-mortem: what happened, impact, root cause, fix, what prevents it next time. No blame, just facts.`
  },
  {
    name: 'dependency-audit',
    description: 'Find risky or outdated dependencies and say what to do.',
    body: `List the project's dependencies with version, latest version, known vulnerabilities (with severity and source) and licence. Rank by risk: vulnerable and in use first. For each item recommend update, replace, pin or accept, with one reason. Never update anything yourself without a card for it.`
  },
  // Design and web
  {
    name: 'design-brief',
    description: 'Say who a page is for and what it must do before designing it.',
    body: `A design brief has: audience (one sentence), the one action we want them to take, the sections in order with the single message of each, tone in three words, constraints (brand, platform, length), and what success looks like. Keep it to half a page. No layout yet; that comes after the brief is agreed.`
  },
  {
    name: 'ui-tokens',
    description: 'Describe a layout in exact values.',
    body: `Write layouts as values, not adjectives: spacing scale in px, type scale with sizes and weights, colours as hex (use the project's tokens when they exist), grid columns and gutters, breakpoints, border radius, states (hover, focus, disabled). Mobile first. Each value is something a builder can type in.`
  },
  {
    name: 'ux-copy',
    description: 'Write the words on an interface.',
    body: `Headlines say the benefit. Buttons say what happens next ("Save changes", not "Submit"). Labels name the field; help text says the format. Error messages say what went wrong and how to fix it. Short sentences, plain words, one idea per line. Mark unknown numbers with [PLACEHOLDER]. No exclamation marks.`
  },
  {
    name: 'html-css',
    description: 'Build pages as clean, accessible HTML and CSS.',
    body: `Semantic elements (header, nav, main, section, button, a). Mobile-first CSS with min-width media queries. Touch targets at least 44 px. Text contrast 4.5:1. Every image has alt text; every input has a label. No horizontal scroll at 390 px. Keep CSS in one place and follow the project's existing structure.`
  },
  {
    name: 'accessibility-check',
    description: 'Check a page the way an assistive-tech user meets it.',
    body: `Go through: keyboard only (every control reachable and operable, visible focus), labels on inputs and icon buttons, heading order, alt text, colour contrast, text resize to 200%, motion that can be paused, forms that explain errors. Report each failure with where it is and the fix. Pass or fail per item, no scores.`
  },
  // Content and social
  {
    name: 'long-form-writing',
    description: 'Write articles and guides people finish.',
    body: `Start from the outline. First sentence is specific, never a throat-clear. One idea per paragraph, three to four sentences each. Examples beat adjectives. Subheadings every 300 words or so. Sources as links at the end. Mark claims you could not verify with [CHECK]. Hit the target length within ten percent.`
  },
  {
    name: 'seo-on-page',
    description: 'Check a page\'s title, headings and meta for search.',
    body: `For the target query: it appears in the title (under 60 characters), the first paragraph and at least one H2, naturally. Meta description around 155 characters that says what the page gives. One H1. Descriptive alt text. Two or three internal links to related pages. Deliver as a list of proposed changes, not a rewrite.`
  },
  {
    name: 'keyword-research',
    description: 'Build a keyword map by intent and page.',
    body: `From the brief, the site's pages and any search data: list queries with intent (informational, commercial, transactional), volume and difficulty when known, and the page that should rank for each. Group by topic. Flag two pages targeting the same query. Output a table. Numbers only from data you were given.`
  },
  {
    name: 'seo-audit',
    description: 'Find what holds a site back in search.',
    body: `Check: indexability (robots, noindex, canonical), broken links, redirects, page speed basics, mobile layout, duplicate titles and descriptions, thin pages, missing structured data. Rank findings by impact and effort. For each: where, why it matters, what to change. No tactics that risk a penalty.`
  },
  {
    name: 'link-outreach',
    description: 'Find link targets and write honest outreach.',
    body: `Targets are pages that already link to similar content or would serve their readers with ours. For each: site, page, why it fits, the contact if public. Outreach notes: under 100 words, say what the page is and why their readers benefit, one ask, no flattery, no templates that show. Never send; the boss sends.`
  },
  {
    name: 'content-calendar',
    description: 'Plan posts over time without clashes.',
    body: `Keep a calendar with date, platform, theme, format, owner and status. Spread themes across the week, keep launches and events the brief names, avoid two heavy posts in a row, leave slack for reactive posts. Flag gaps and clashes. Every row maps to one card on the board.`
  },
  {
    name: 'social-copy',
    description: 'Write a post for the platform it will live on.',
    body: `X: short, one idea, no hashtags in the body. LinkedIn: a hook line, then two or three short paragraphs, a question or call to action. Instagram: caption first, hashtags on a separate line. Short video: a spoken script with timing. The first line does the work. Three variants when asked. Match the brand voice file.`
  },
  {
    name: 'hashtag-research',
    description: 'Pick hashtags that reach the right people.',
    body: `For each post suggest five to ten hashtags: two broad, the rest specific to the topic and audience. Avoid banned or spammy tags and anything unrelated to the post. Note why each one is there in a few words. Keep a list of tags that worked for reuse.`
  },
  {
    name: 'community-replies',
    description: 'Answer comments and messages on brand.',
    body: `Reply short, warm and specific. Thank, answer, next step. Never argue, never defensive. Complaints get an apology for the experience and a route to fix it. Anything legal, a refund or a safety issue goes to the Lead with a suggested reply. Keep a reply bank of good answers to common questions.`
  },
  // Ads and email
  {
    name: 'campaign-plan',
    description: 'Plan an ad campaign around one number.',
    body: `A campaign plan has: goal, the one metric and its target, audience (who, where, what they want), channels with budget per channel, the offer and landing page, creative needed, schedule, and what we will change if the number is missed. One page. Numbers you do not have are [PLACEHOLDER].`
  },
  {
    name: 'ad-copy',
    description: 'Write ad copy that fits the platform and tells the truth.',
    body: `Write sets: headlines, descriptions, primary text, call to action, within each platform's character limits (state them). Three angles per set: the benefit, the proof, a reason to act now without false urgency. The copy must match what the landing page promises. Mark any claim that needs proof.`
  },
  {
    name: 'creative-brief',
    description: 'Brief an image or video so a designer can make it.',
    body: `Goal, audience, the one message, format and sizes, must-show elements, tone, references described in words, what to avoid, deadline. Keep it to one page. The brief is for a human designer or the video agency; do not try to make the asset yourself.`
  },
  {
    name: 'bid-rules',
    description: 'Propose bid and budget changes with reasons.',
    body: `From the week's data, propose changes as a table: campaign or ad set, current spend and result, proposed change, reason, expected effect. Pause what misses the target twice running, scale what beats it with room, test one new thing at a time. You propose; the boss applies.`
  },
  {
    name: 'email-sequence',
    description: 'Plan a series of emails with triggers and goals.',
    body: `For each email in the sequence: trigger (what starts it), delay from the previous one, purpose, the one link, exit conditions (what stops the sequence). Three to five emails is usually enough. Write it as cards, one per email, in order.`
  },
  {
    name: 'email-copy',
    description: 'Write an email with one purpose and one link.',
    body: `Three subject lines (under 50 characters), preview text, a body under 200 words unless told otherwise, one call to action. Write like a person to a person. Specific over clever. Plain-text friendly. Use personalisation fields only when the segment has them.`
  },
  {
    name: 'list-segmentation',
    description: 'Define who gets which email.',
    body: `Define each segment by the fields the list has: criteria, estimated size, exclusions and suppression rules (unsubscribed, bounced, recently contacted). Keep segments.md current. Flag lists that need cleaning before a send. Never invent fields the list does not have.`
  },
  {
    name: 'deliverability-check',
    description: 'Check an email will land in the inbox.',
    body: `Checklist per send: SPF, DKIM and DMARC status (from what the boss provides), spam-trigger words, link count, image-to-text ratio, a working unsubscribe link, bounce and complaint handling in place, a plain-text version. Output pass or fix per item with the fix.`
  },
  // Sales and support
  {
    name: 'icp-definition',
    description: 'Write down who we sell to and who we do not.',
    body: `An ideal customer profile has: industry, company size, region, the role we talk to, the trigger events that make them a fit now, and disqualifiers. Each item is specific enough to score a lead against. Keep it to half a page and date it.`
  },
  {
    name: 'lead-enrichment',
    description: 'Add facts to a lead from allowed sources only.',
    body: `For each lead fill: company site, size, industry, role, public email or profile, recent trigger (funding, hiring, launch). Use only the sources the boss allows. Leave blank and flag what you cannot find; never guess or invent contact details. Record the source beside each fact.`
  },
  {
    name: 'crm-update',
    description: 'Prepare CRM changes without touching records yourself.',
    body: `Produce updates as a CSV or a list of changes per record: field, old value, new value, source. Dedupe against existing records by domain and email. Report counts, not names. The boss or the connected tool applies the changes.`
  },
  {
    name: 'ticket-reply',
    description: 'Answer a customer ticket well.',
    body: `Acknowledge the problem in one line. Answer from the knowledge base; link the article. Give the next step. Short, warm, specific; no jargon. If the answer is not in the knowledge base, do not guess: escalate with what you tried. Tag the ticket with its type.`
  },
  {
    name: 'escalation',
    description: 'Hand a ticket up with everything the next person needs.',
    body: `An escalation has: the customer's words, what was tried, what you think is wrong, steps to reproduce, expected and actual, logs or screenshots if any, urgency. Keep the customer informed every day it stays open. Refunds, legal threats and security reports go straight to the boss.`
  },
  {
    name: 'kb-article',
    description: 'Write a help article from a solved ticket.',
    body: `Title as the question a user would type. First paragraph is the answer. Then numbered steps, then related articles. Plain language, no internal names. Update an existing article rather than writing a duplicate. Keep the index current.`
  },
  {
    name: 'tone-check',
    description: 'Check replies for tone and accuracy.',
    body: `Read a sample of replies. For each: is it correct against the knowledge base, is it kind, is it short, does it give a next step, would you be happy to receive it. Note each miss with a better line. Report patterns, not just instances.`
  },
  {
    name: 'sla-report',
    description: 'Report service levels from ticket data.',
    body: `From exported ticket data: volume, first-reply time, resolution time, percentage within SLA, by type and by day. Top five issues with counts. One product suggestion backed by the numbers. Compare with last week. Only numbers from the data.`
  },
  // Research and data
  {
    name: 'question-framing',
    description: 'Turn a vague ask into questions with answers that matter.',
    body: `Write the decision the answer would change. Split the ask into two or three sub-questions that can each be answered with evidence. For each, say what a good answer looks like and what sources would count. If no decision depends on it, say so before researching.`
  },
  {
    name: 'metric-definition',
    description: 'Define a metric before measuring it.',
    body: `Name, plain-English meaning, formula, grain (per what), filters, time window, time zone, source table or file, known gaps. Write it down and get it agreed before any query. Two people reading it should compute the same number.`
  },
  {
    name: 'sql',
    description: 'Write readable queries that can be checked.',
    body: `Use CTEs with clear names, comment the intent of each step, filter early, state the grain of the result. Never modify source data. Save queries in the project's queries folder with the metric they serve. Report row counts and runtime with each result.`
  },
  {
    name: 'data-validation',
    description: 'Prove a number before anyone uses it.',
    body: `Recompute the headline number a second way. Check totals against a known source. Test edge cases: empty periods, duplicates, nulls, time-zone boundaries. Report match or mismatch with the difference and the likely cause. Do not sign off on a number you could not reproduce.`
  },
  {
    name: 'charting',
    description: 'Pick the right chart and label it properly.',
    body: `Lines for change over time, bars for categories, tables for exact values; no pies, no dual axes. Axes labelled with units, a title that states the message, a legend only when needed. One message per chart. Save each chart with the query it reads from, in the project's dashboards folder.`
  },
  // Product
  {
    name: 'prioritisation',
    description: 'Score ideas the same way every time.',
    body: `Keep a scoring sheet: impact (1–5), confidence (1–5), effort (1–5), with one line of evidence per score. Rank by impact times confidence over effort. Record decisions and the reason, including the no's. Re-score when new evidence arrives, not when someone asks louder.`
  },
  {
    name: 'roadmap',
    description: 'Keep a roadmap in three horizons.',
    body: `Now (being built), Next (decided, not started), Later (likely, not committed). Each item: one line, score, status, link to its spec or evidence. Update it when cards move, not on a schedule. Keep it short enough to read in two minutes.`
  },
  // Visa, finance, legal
  {
    name: 'business-plan',
    description: 'Draft a business plan for an application.',
    body: `Sections: summary, problem, product, market, business model, team, milestones, financial outline, why this country or programme. Formal and specific. Every number the founder must confirm is marked [CONFIRM]. Keep facts consistent with the eligibility check. No claims you cannot back.`
  },
  {
    name: 'cover-letter',
    description: 'Write formal letters for an application pack.',
    body: `Cover, reference and explanation letters: who is writing, to whom, purpose in the first sentence, the facts in order, what is enclosed, a polite close. Formal, plain English, one page. Mark anything to confirm with [CONFIRM]. Keep names, dates and numbers identical to the rest of the pack.`
  },
  {
    name: 'timeline',
    description: 'Lay out deadlines so nothing is missed.',
    body: `List every deadline with its date, what must be done by then, who does it, and what it depends on. Work backwards from the final date. Flag items with less than two weeks of slack. Keep it as one table and update it whenever a date changes.`
  },
  {
    name: 'invoice-draft',
    description: 'Draft an invoice from the project\'s records.',
    body: `From timesheets, orders or contracts: client details, invoice number, date, items with quantity, rate and total, tax as the settings file says, grand total, due date, payment terms and details. Keep a register of issued and paid. Draft reminders for overdue ones; the boss sends.`
  },
  {
    name: 'expense-categorise',
    description: 'Put each expense in the right account.',
    body: `Match each receipt or bank line to the chart of accounts. Flag duplicates, personal items and missing receipts. Ask when a category is unclear instead of guessing. Keep the expenses file current with date, vendor, amount, category, receipt reference.`
  },
  {
    name: 'cash-forecast',
    description: 'Forecast cash for the next three months.',
    body: `Start from the cash position. Add expected receipts by date, subtract expected payments by date. List every assumption (payment delays, recurring costs, one-offs). Show the low point and when it happens. Tables first, then five sentences on what to watch.`
  },
  {
    name: 'contract-template',
    description: 'Keep a library of contract templates.',
    body: `For each template: purpose, parties, defined terms, the clauses that change per deal (marked), the clauses that do not, and a note on when to use it. Every template carries the line that a qualified lawyer must sign off before signature. Version each change.`
  },
  {
    name: 'contract-draft',
    description: 'Draft a contract from a template and a term sheet.',
    body: `Fill the template from the term sheet: parties, dates, amounts, schedules. Keep defined terms and numbering consistent. Mark anything missing [TERM NEEDED]. Plain, precise language. List every change from the template separately so review is quick. You are not a lawyer; say so in the document.`
  },
  {
    name: 'clause-review',
    description: 'Review a contract clause by clause.',
    body: `For each clause on the checklist (liability caps, indemnities, IP, termination, payment, confidentiality, governing law, unusual terms): risk level, what it means in one sentence, suggested change. Worst risks first. Do not rewrite the document; propose edits. Flag what needs a lawyer.`
  },
  {
    name: 'compliance-check',
    description: 'Check the rules that apply to a document or process.',
    body: `From the list the boss gives: required notices, data protection, consumer rules, licensing, signature requirements. For each: applies or not, met or not, the source you checked, what to change. Cite the source every time. Flag anything that needs professional confirmation.`
  },
  // HR
  {
    name: 'role-scorecard',
    description: 'Define a role by outcomes before hiring for it.',
    body: `Outcomes for the first year (three to five, measurable), must-have skills, nice-to-haves, disqualifiers, how we will assess each. Every candidate is scored against the same card. No criteria that touch protected characteristics.`
  },
  {
    name: 'job-post',
    description: 'Write an honest job post.',
    body: `The role in one paragraph, what you will do, what you need, what we offer, how to apply. Salary range when the boss gives one. No buzzwords, no "rockstar", no list of twenty requirements. Under 500 words. Plain language a candidate can judge themselves against.`
  },
  {
    name: 'candidate-sourcing',
    description: 'Find candidates on allowed channels.',
    body: `For each candidate: name, current role, public profile link, why they match the scorecard, how to reach them. Only channels the boss allows. Never invent contact details. Draft a short, honest first message per candidate; the boss sends.`
  },
  {
    name: 'cv-screening',
    description: 'Score applications against the scorecard.',
    body: `For each application: a score per criterion with the line from the CV that supports it, a total, and recommend / maybe / no with one sentence. Same criteria for everyone, applied the same way. Note missing information to ask for rather than assuming.`
  },
  {
    name: 'interview-questions',
    description: 'Write structured interview questions.',
    body: `One or two questions per scorecard criterion, asked of every candidate in the same order. For each question: what a strong answer contains, what a weak one looks like, a follow-up. Behavioural questions ask for a real example. Nothing about protected characteristics.`
  },
  {
    name: 'onboarding-plan',
    description: 'Plan a new hire\'s first 90 days.',
    body: `Before day one: accounts, equipment, access. First week: who to meet, what to read, a small first task. 30, 60 and 90-day goals tied to the scorecard outcomes. Check-in dates. Keep it as a checklist the hire and their manager can both see.`
  },
  // Video
  {
    name: 'video-brief',
    description: 'Decide what a video is for before writing it.',
    body: `Format (short, explainer, demo, talking head), length, platform, audience, the one message, call to action, what must appear, tone. Half a page. The brief is agreed before the script starts.`
  },
  {
    name: 'script-writing',
    description: 'Write scripts meant to be spoken.',
    body: `Hook in the first line. One idea per section. Spoken language: read it aloud and cut what you would not say. Timing marks every 15 seconds or so. On-screen text noted in brackets. About 150 words per minute. Three hook options when asked.`
  },
  {
    name: 'storyboard',
    description: 'Turn a script into a shot list.',
    body: `Table: shot number, duration, what is on screen, camera or motion note, voice line, on-screen text, assets needed. Flag shots that need footage or images the project does not have. Keep shots short on short-form platforms.`
  },
  {
    name: 'thumbnail-brief',
    description: 'Brief titles and thumbnails that get the click honestly.',
    body: `Five title options under the platform's limit, each with a different angle. Three thumbnail briefs: text under four words, the focal element, a contrast note, what to avoid. The title and thumbnail must match what the video delivers.`
  },
  {
    name: 'captions',
    description: 'Produce captions and descriptions from the final script.',
    body: `Timestamped captions in SRT from the final script, broken into lines under 40 characters, two lines per caption at most. A description with the message in the first line, then links, then tags. Respect each platform's limits.`
  }
]
