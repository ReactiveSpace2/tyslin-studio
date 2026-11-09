# Archive

Screens and modules from before the agency layout (6 Nov 2026). They are outside `src/`, excluded from
the build and typecheck, and kept for reference only: the agents hub and list, assistants editor, org chart,
old Home and first-run setup, New agent / New assistant modals, the starter library, department teams,
Tasks, Automation, Canvas, Mind mapper, Coming soon, the project switcher and the icon rail.

Imports inside these files point at paths that no longer exist. Copy what you need back into `src/`
rather than importing from here.

`shared/agencies/` (9 Nov 2026): seven agency templates taken out of the app when Tyslin narrowed to work that
lives in a repo or in documents (Customer Support, Research & Intelligence, Startup Visa, Finance & Bookkeeping,
Legal & Contracts, HR & Recruiting, Video & Creative). They need publishing tools or outside accounts more than
coding agents. Kept as written (some workers still say `hermes`); agencies already made from them still open and
run, because nothing looks their template up except for optional extras. Copy a file back into
`src/shared/agencies/` and add it to `AGENCY_TEMPLATES` to bring it back.
