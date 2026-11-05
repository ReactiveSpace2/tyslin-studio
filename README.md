<p align="center">
  <img src="resources/brand/logo-beta.png" alt="Tyslin Studio beta" width="360">
</p>

<h1 align="center">Tyslin Studio</h1>

<p align="center"><strong>Every agent you run. One studio.</strong></p>

<p align="center">
  <a href="https://tyslin.ai">tyslin.ai</a> · info@tyslin.ai · A ReactiveSpace product
</p>

---

Tyslin Studio is an open-source desktop studio for building and working with AI agents. Give each agent a job, instructions, skills, a model and a character, let it work in your project folders, and work with it in chat. Assistants cover quick chats that don't need files or tools.

Everything runs on your computer. Agents, chats, projects and skills live in a local SQLite database (one per organization), and your API keys are encrypted with your system keychain. Bring your own key for Anthropic (Claude), OpenAI or Google Gemini, or run models locally with Ollama.

> **Status: beta (v0.3.0).** Tested on Linux. macOS and Windows builds are not yet tested or signed. Expect rough edges and breaking changes.

## What works today

- **Home:** the first screen shows the Tyslin logo, the standing mascot and the app version, with buttons to agents and assistants. **Your studio** then has a tile for every sidebar area: Agents, Assistants, Projects and Skills with their counts, and the areas still to come marked Soon. Below that, every model and agent engine Tyslin works with and whether each is ready (key added, installed). Click one to set it up.
- **Sign in with Google:** official builds open on a sign-in screen; after signing in you land on Home, and Settings → Account signs you out. Tyslin keeps only your name and email; agents, chats and keys stay on your computer. Builds made without a Google OAuth client (no `.env`, see `.env.example`) skip sign-in.
- **Agents:** create, edit and delete agents with a name, instructions, provider, model, skills, schedule and a character (shape and colour). Builder, the built-in agent, uses the Tyslin mascot. Ten starter agents ship with it: Atlas (operations), Forge (code), Quill (content), Scout (research), Relay (support), Passage (startup visa), Ledger (data), Hunter (leads), Crew (ticket to tested change) and Bench (model comparison).
- **Sidebar:** an icon rail with Home, Dashboard, Agents, Assistants, Tasks, Art, Videos, Workflows, Canvas, Mind mapper and Projects, and Drive, Knowledge base, Connectors, Skills and Settings at the bottom (sign out is in Settings → Account). Agents and Assistants each open a panel listing them with their recent chats (plus New and All); Projects opens the same panel for projects, with each project's chats and the agent behind each one. Art, Videos, Workflows, Canvas, Mind mapper, Drive (files and storage), Knowledge base and Connectors are placeholders for now.
- **Organizations:** separate spaces, each with its own agents, assistants, projects, chats and skills. The default one is called Tyslin. Switch or create one from the bottom-left of the status bar; switching reopens the app in that organization. Your sign-in, API keys, Ollama address, agent engine paths and theme are shared by all of them.
- **Title bar:** Tyslin draws its own title bar instead of the system one (no File/Edit/View menu). On the left, the Tyslin logo and wordmark; then the name of the current screen, and a zoom slider at the right. Drag the empty space to move the window; the system's window buttons sit at the right (Windows, Linux) or left (macOS) and follow the light or dark theme.
- **Scheduled tasks:** the Tasks screen (below Assistants) runs a prompt with an agent or assistant every day, on weekdays or once a week at a set time, each time in a new chat. Start from a template (daily plan, weekly review, content ideas, research brief, metrics report, daily lesson) or set one up by hand; search, filter, sort, pause, run now, edit and delete. Tasks run while Tyslin is open; a run missed while it was closed happens on the next launch. Each organization has its own tasks.
- **Status bar:** along the bottom: the organization switcher (menu opens upward), data is local, everything running (click it for a list with progress, elapsed time, Open chat and Stop: agent replies with their current step, skill pack and engine installs, update downloads), file changes waiting for review (opens the Dashboard), which model providers have a key (opens Settings → Models), and the app version or a waiting update.
- **Dashboard:** second item in the sidebar. Counts of agents, assistants, projects, chats and messages, a chart of the messages you sent over the last 14 days, file changes waiting for review, recent chats and your most-used agents. Everything is read from the local database.
- **Light and dark theme:** Settings → Appearance offers System (follows your computer), Light and Dark. The choice is saved and applies straight away.
- **Accent, organization colours and icons:** Settings → Appearance also sets the accent colour (Lime, Forest, Monochrome, or each organization's own colour), a colour per organization (lime, teal, amber, coral or violet; shown on the switcher), outline or bold icons, and optional names under the menu icons.
- **Zoom:** 70% to 150%, from the slider at the top right of the title bar, Settings → Appearance, or Ctrl/⌘ + and − (Ctrl/⌘ 0 resets). Saved for this computer.
- **Assistants:** a prompt and a model for quick chats, separate from agents. Six ship with it, written for Tyslin: Sage (questions), Polish (editing), Lingo (translation), Inbox (emails), Tutor (explanations) and Spark (ideas). Assistants can use skills but have no project folder, file tools, external engine or schedule; those are what agents are for.
- **Chat:** streamed conversations with any agent; history is saved per agent and project.
- **Attachments:** the + button in the chat box attaches files or whole folders. Text files go to the agent with your message. A folder sends its file list and every text file in it, skipping hidden folders, `node_modules` and build folders. Images (PNG, JPEG, GIF, WebP, up to 5 MB) are sent to Claude, OpenAI, Gemini and Ollama as images. External agents get the text, plus each image's path. There's a limit of about 200,000 characters per message, and anything left out is marked on the attachment.
- **Projects:** link a folder on disk; agents in that project can list, read and change its files.
- **Review before it's written:** when an agent wants to change a file, you see a diff first and accept or reject each change, or all at once. The agent hears what you decided and carries on. Each agent can be switched to "Write directly" instead.
- **Skills:** reusable instruction blocks added to an agent's system prompt. 38 are built in: meeting notes, follow-up emails, meeting prep, daily plans, weekly updates, decision memos, research, competitor briefs, feedback themes, outreach, objection replies, lead qualifying, one-pagers, slide outlines, editing, data analysis, careful file edits, plus the ones the starter agents use (task delegation, issue triage, code review, test reports, changelogs, SEO outlines, inbox triage, eligibility checks, document checklists, data cleanup, metrics reports, lead lists, spec breakdowns, output scoring) and more. The Skills screen has three tabs: **Built-in skills** (the library plus skills you make or import), **GitHub** and **Claude**. On the GitHub tab, open-source **skill packs** can be installed: [Humanizer](https://github.com/blader/humanizer) (MIT, Siqi Chen), [Marketing Skills](https://github.com/coreyhaines31/marketingskills) (MIT, Corey Haines, 53 skills), [Engineering Skills](https://github.com/addyosmani/agent-skills) (MIT, Addy Osmani, 25 skills) and [PM Skills](https://github.com/phuryn/pm-skills) (MIT, Pawel Huryn, 69 skills). Each pack can be installed, updated to the latest version, or uninstalled. Updating replaces any edits you made to the pack's skills, and uninstalling removes them from your agents. Only each skill's `SKILL.md` is installed, not its extra reference files. Below them, **More on GitHub** lists and searches every repo tagged [agent-skills](https://github.com/topics/agent-skills), most stars first. Any of them with an open licence can be installed the same way (Tyslin installs every `SKILL.md` it finds, up to 300). Anyone can tag a repo, so read a skill before you attach it to an agent. Pack cards and pack skills have a GitHub link. The **Claude** tab lists Anthropic's [skills repo](https://github.com/anthropics/skills) and installs its open-source (Apache 2.0) skills; the source-available document skills (docx, pdf, pptx, xlsx) are linked for reading only. Create, edit, search and delete skills in the app, or import and export them as Markdown files (frontmatter `name` and `description`, then the instructions).
- **Providers:** Anthropic (Claude), OpenAI, Google Gemini (key from Google AI Studio), and local models through Ollama.
- **External agents:** run any agent on an agent you've installed instead of Tyslin's built-in models: Goose, Hermes, ZeroClaw, OpenClaw, or any other program that speaks the Agent Client Protocol (ACP). Pick it under "Runs on" in the agent editor. Tyslin sends your instructions and skills with each message, shows the agent's tool calls, puts file edits it asks Tyslin to make through your review, and shows its permission requests ("Run npm test?") in chat. Settings → Agent engines shows what's installed, tests the connection, and has an Install button for Goose, Hermes and OpenClaw that runs each project's official installer (it shows you the exact command first and streams the output). Tyslin doesn't ship these agents.
- **Stop:** stop any reply mid-way from the chat box.
- **Settings:** API keys and Ollama; agent engines; defaults for new agents and guidelines added to every agent's instructions; appearance (theme, accent colour, organization colour, icon style, menu labels, zoom); your Google account; update status, app version and where your data lives.
- **Local-first:** one SQLite file (`tyslin.db`) in the app's user-data folder; no server, no account.

## Download

Get the latest installer from [tyslin.ai](https://tyslin.ai/#download) or [GitHub Releases](https://github.com/ReactiveSpace2/tyslin-studio/releases/latest).

| Platform | File |
|---|---|
| macOS (Apple silicon) | `Tyslin-Studio-<version>-mac-arm64.dmg` |
| macOS (Intel) | `Tyslin-Studio-<version>-mac-x64.dmg` |
| Windows 10/11 | `Tyslin-Studio-<version>-windows-x64-setup.exe` |
| Linux (any distro) | `Tyslin-Studio-<version>-linux-x86_64.AppImage` |
| Linux (Debian, Ubuntu) | `Tyslin-Studio-<version>-linux-amd64.deb` |

On Ubuntu you can also install from the Snap Store (coming soon): search for **Tyslin Studio** in App Center, or run `sudo snap install tyslin-studio --classic`. Opening the `.deb` in App Center works too, but App Center labels every downloaded `.deb` "Unknown publisher" and "Potentially unsafe".

Early builds are not code-signed yet:

- **macOS:** right-click the app in Applications and choose **Open**, then **Open** again. If macOS still blocks it, run `xattr -cr "/Applications/Tyslin Studio.app"`.
- **Windows:** on the SmartScreen prompt choose **More info**, then **Run anyway**.
- **Linux:** `chmod +x Tyslin-Studio-*.AppImage` and run it (on Ubuntu 24.04 and later, first run `sudo apt install libfuse2t64`), or `sudo apt install ./Tyslin-Studio-*.deb`. If apt ends with `Notice: Download is performed unsandboxed as root ... Permission denied`, the install still worked. apt only means it couldn't read your Downloads folder as its restricted `_apt` user. To avoid the notice, copy the `.deb` to `/tmp` first and install it from there.

### Updates

From v0.2.0, Tyslin Studio checks GitHub Releases when it starts.

- **Windows and Linux AppImage:** the update downloads in the background; restart when prompted to install it.
- **Snap:** the Snap Store updates the app automatically; it doesn't check GitHub.
- **macOS and Linux .deb:** the app tells you a new version is available and links to the download. (Automatic install on macOS needs a signed build, which is coming.)

If you're on v0.1.0, download the new version once by hand; updates after that arrive in the app.

## Run from source

Requires Node.js 20 or 22.

```bash
git clone https://github.com/ReactiveSpace2/tyslin-studio.git
cd tyslin-studio
npm install        # also rebuilds the SQLite driver for Electron
npm run dev        # starts the app with hot reload
```

Running from a VS Code terminal? VS Code sets `ELECTRON_RUN_AS_NODE=1`, which stops Electron from opening a window. Start it with `env -u ELECTRON_RUN_AS_NODE npm run dev` instead.

Then open **Settings** and add an Anthropic, OpenAI or Gemini key, or point it at a running Ollama (`http://localhost:11434`), and say hello to Builder.

## Build installers

```bash
npm run dist:linux   # .AppImage, .deb and .snap
npm run dist:mac     # .dmg (run on macOS)
npm run dist:win     # .exe NSIS installer (run on Windows)
```

Output goes to `dist/`. Build each installer on its own platform; GitHub Actions can build all three for a release. Public releases need signing (an Apple Developer ID with notarisation for macOS, a code-signing certificate for Windows), otherwise users see security warnings.

## Releasing

Releases are built by GitHub Actions (`.github/workflows/release.yml`) on macOS, Windows and Linux runners. The installers, plus the update files the app reads (`latest*.yml`, `*.blockmap` and the macOS `.zip`), are attached to the GitHub Release automatically. The Linux job also uploads the `.snap` to the Snap Store's stable channel when the `SNAPCRAFT_STORE_CREDENTIALS` repository secret is set; the `.snap` is not attached to the GitHub Release.

```bash
# 1. bump "version" in package.json (e.g. 0.2.0) and commit
# 2. tag that commit with the same version and push the tag
git tag v0.2.0
git push origin v0.2.0
```

The tag must match `package.json`; installed apps compare their own version against the newest release. The workflow can also be started by hand from the **Actions** tab (Release → Run workflow → enter the tag).

## Project layout

```
src/
  main/        Electron main process (the only code that touches DB, files, network, secrets)
    index.ts     window (custom title bar, theme) + IPC handlers
    db.ts        SQLite schema, seed data and queries; one database per organization
    runtime.ts   AgentRuntime interface + Anthropic / OpenAI-compatible (OpenAI, Gemini, Ollama) runtimes (tool loop, run events) + AcpRuntime
    acp.ts       ACP client: starts an external agent, drives one turn, maps its updates to run events
    engines.ts   external agent catalogue, PATH lookup, command overrides
    tools.ts     project file tools; staged writes and the review hand-back
    skillFiles.ts  skill Markdown import/export and validation
    skillPacks.ts  skill packs installed from GitHub (featured packs and the agent-skills topic)
    attachments.ts chat attachments (files, folders, images)
    seedAgents.ts  built-in agents and starter assistants (versioned; new ones reach existing installs)
    auth.ts      optional Google sign-in
    seedSkills.ts  built-in skill library (versioned; new skills reach existing installs)
    secrets.ts   API keys encrypted with Electron safeStorage
  preload/     safe bridge exposing window.tyslin to the UI
  renderer/    React UI
    components/  TitleBar, Sidebar (icon rail and chat panel), StatusBar with OrgSwitcher, avatars, icons, dialogs
    pages/       Home, Dashboard, Agents/Assistants list, editor, Chat, Tasks, Skills, Settings
                 (Models, Agent engines, Agents, Appearance, Account, About & updates), ComingSoon placeholders
  shared/      types shared by all three, plus diff.ts (hunk split and apply, used by main and UI)
resources/     app icon and brand files
```

Runtimes report progress as a typed event stream shaped like AG-UI events (`RunEvent` in `shared/types.ts`: run_started, text_delta, tool_call_start/args/end, tool_result, approval_needed, state_update, run_finished, run_error). The UI listens to that stream only.

Adding a feature that needs data: type in `shared/types.ts` → query in `db.ts` → `ipcMain.handle` in `main/index.ts` → expose in `preload/index.ts` → use in the renderer. Run `npm run typecheck` after every change.

## Roadmap

1. **Runs and triggers:** every reply as an inspectable run; run agents on their schedule, when files change in a project folder, or from a local webhook.
2. **Costs:** tokens and spend per run, agent, project and model, with an optional monthly cap.
3. **Memory in your files:** per-project memory in `.tyslin/memory/` that you can read, edit and commit.
4. **Crews:** ordered pipelines of agents, such as Scout → Quill → Forge, including hand-offs (the Workflows screen is reserved for this).
5. **Packs:** share agents, skills and crews as a folder you can import and export.
6. **External agents, next steps:** keep an agent running between messages, pass MCP servers through, and show plans and token usage.
7. **Tool permissions:** per-agent toggles for files, web, terminal and connectors, with "ask before acting".
8. **Signed installers:** code signing for macOS and Windows, which also makes updates automatic on macOS.
9. **Hosted plan:** the same UI on the web, with Postgres, accounts and billing, for people who don't want to self-host.

## Contributing

Issues and ideas are welcome. Pull requests will open once the license is set. Keep changes small and focused, and run `npm run typecheck` before submitting.

## License

The code license will be set before the first public release (AGPL-3.0 is planned).

Brand assets in `resources/brand` and `src/renderer/src/assets` (the Tyslin name, logo and mascot) are © ReactiveSpace and not covered by the code license.
