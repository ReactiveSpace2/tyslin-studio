# Contributing to Tyslin Studio

Thanks for helping. Tyslin Studio is a desktop app (Electron, React, TypeScript, SQLite) for running AI agencies: a Lead agent plans a task, workers on Claude Code, Codex or Gemini CLI do it, and you approve the changes. Small, focused pull requests are the easiest to review and merge.

## Ten minutes to a running app

Requires Node.js 22 and npm.

```bash
git clone https://github.com/ReactiveSpace2/tyslin-studio.git
cd tyslin-studio
npm install          # also rebuilds the SQLite driver for Electron
npm run dev          # the app with hot reload
npm run typecheck    # run after every change; CI runs it too
```

Running from a VS Code terminal? VS Code sets `ELECTRON_RUN_AS_NODE=1`, which makes Electron start as plain Node. Use `env -u ELECTRON_RUN_AS_NODE npm run dev`.

To try the app without touching your real data, start it with another home folder: `HOME=/tmp/tyslin-home npm run dev` (the database and agency folders land there).

## Where things live

| Folder | What it is |
|---|---|
| `src/main/` | The Node side. The only place that touches the database, files, network and secrets. `index.ts` holds the window and every IPC channel. |
| `src/shared/` | Types and data both sides use: agency templates (`agencies/`), models, pricing, MCP presets, schedule maths. |
| `src/preload/` | Exposes `window.tyslin`, typed by `TyslinApi` in `src/shared/types.ts`. |
| `src/renderer/src/` | The React UI. Never import Node or Electron here; go through `window.tyslin`. `pages/` are screens, `task/`, `agency/`, `files/`, `shell/` their parts, `components/ui/` the shadcn/ui components. |
| `archive/` | Earlier screens kept for reference. Never import from it. |

The database schema and queries are in `src/main/db.ts`. Add a column with `addColumn`, not a schema version bump.

## Rules that keep the app consistent

- **UI is shadcn/ui and Tailwind CSS only.** Use what is in `src/renderer/src/components/ui/` first; add an official shadcn component (new-york v4) when one is missing. No custom stylesheets, no other UI library. If no shadcn component fits, open an issue and ask before building something custom.
- **Colours come from the tokens** in `src/renderer/src/index.css` (`bg-background`, `text-muted-foreground`, `bg-lime`, `text-green`, …), never hardcoded, so dark mode and the accent presets keep working. Lime is a fill with ink text on top; never lime text.
- **Copy is plain and short.** Talk about the work agents do, not about AI. No hype words, no emoji, no invented numbers.
- **Main is the only writer.** The renderer asks main to change things over IPC; agents' file changes go through the review (`pending_changes`), never straight to disk.
- **Agents never leave the agency folder.** Every path in main goes through the folder confinement helpers (`drive.ts inside`, `tools.ts`). Keep it that way.
- **Secrets stay in main**, encrypted with `safeStorage`, and are never sent to the window.
- **No telemetry.** The app contacts only the services the user set up, plus GitHub for updates, skill packs and the star count.

## Good places to start

Issues labelled [good first issue](https://github.com/ReactiveSpace2/tyslin-studio/labels/good%20first%20issue) are small and self-contained, with the file to touch named. The three easiest kinds of contribution need no Electron knowledge:

**An agency template.** One file in `src/shared/agencies/` exporting an `AgencyTemplate` (the type is in `src/shared/agencies.ts`), added to `AGENCY_TEMPLATES`. The roster lists the Lead first (`engine: 'builtin'`, `lead: true`); workers run on `claude-code`, `codex` or `gemini-cli`. Give each member a unique head from `src/shared/heads.ts`, a job, a goal and instructions in the voice above. Add its skills to `src/main/seedSkillsAgencies.ts`, its suggested connectors to `src/shared/agencyIntegrations.ts`, then run `node scripts/readme-agencies.mjs --write` to refresh the README table.

**A skill.** Built-in skills live in `src/main/seedSkills.ts` and `seedSkillsAgencies.ts`: a kebab-case name, a one-line description and a Markdown body of at most 40,000 characters. Bump `SKILL_LIBRARY_VERSION` so existing installs get it. Write skills fresh; don't paste them from other products.

**A connector preset.** `src/shared/mcpPresets.ts` lists remote MCP servers that take a token. Add one only from the company's official docs, with the token page and a one-line hint.

## Pull requests

1. Open an issue first for anything bigger than a fix, so the direction is agreed before you spend time.
2. Branch from `main`. Keep the change focused; don't reformat unrelated code.
3. Run `npm run typecheck`. If you touched the UI, run the app and click through what you changed, in light and dark.
4. Update the docs that describe what you changed (README, `docs/`).
5. Write the commit message in your own words. Pull requests from accounts whose commits carry AI co-author trailers are fine; the trailers are not.
6. Fill in the pull request template: what changed, why, how you checked it.

A maintainer replies within a few days. Small PRs are merged quickly; larger ones may get questions or a request to split.

## Licence

The code licence is being finalised (see the Licence section of the README). By sending a pull request you agree that your contribution is licensed under the licence the project adopts. The Tyslin name, logo and mascot are © ReactiveSpace and are not covered by the code licence; don't reuse them in other projects.

## Questions

Open an issue with the `question` label, or write to info@tyslin.ai.
