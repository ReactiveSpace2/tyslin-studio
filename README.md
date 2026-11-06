<p align="center">
  <img src="resources/brand/logo-beta.png" alt="Tyslin Studio beta" width="360">
</p>

<h1 align="center">Tyslin Studio</h1>

<p align="center"><strong>Every agent you run. One studio.</strong></p>

<p align="center">
  <a href="https://tyslin.ai">tyslin.ai</a> · info@tyslin.ai · A ReactiveSpace product
</p>

---

Tyslin Studio is an open-source desktop studio for running agencies of AI agents. An agency is a Lead agent and its workers around one goal: the Lead plans a brief into cards on a Kanban board, hands them to the workers, reviews what comes back and talks to you (the boss) on Telegram or Slack. Twenty templates (App Development, SEO, Customer Support, Startup Visa, Finance & Bookkeeping and more) set one up in seven steps.

Everything runs on your computer. Agents, chats, projects and skills live in a local SQLite database (one per organization), and your API keys are encrypted with your system keychain. Bring your own key for Anthropic (Claude), OpenAI or Google Gemini, or run models locally with Ollama.

> **Status: beta (v0.6.0, the agencies release).** v0.6 starts on a fresh database: an older `tyslin.db` is set aside as `tyslin-v0.5.db` (keys, account and appearance are copied across) and the pre-agency screens live in `archive/`. Tested on Linux. macOS and Windows builds are not yet tested or signed. Expect rough edges and breaking changes.

## What works today

- **First run:** sign in (official builds), then the agency wizard: name your organization and agency, describe it or pick one of 20 templates, choose how the workers run (the template's mix of Claude Code, Hermes, Gemini CLI and Codex, or one adapter for all), add model keys and pick the Lead's model, tick skill packs, see the board and the first cards, set up Telegram or Slack, review and create. You land on the agency's overview.
- **Agencies:** each one is a Lead and its workers (named "First (Job)", with mascot heads), a project folder under `Documents/Tyslin Studio/<organization>/<agency>/`, a Kanban board (Inbox → Planned → In progress → Review → Done) with the template's starter cards, an agency prompt every agent follows, a goal and a five-step plan, a channel to you, a monthly budget and a scheduled "plan the Inbox" run for the Lead. Open several as tabs; each tab has its own Overview, Kanban, Channel, Skills and Drive. Edit saves everything; Delete removes the agents, board and task and keeps the files.
- **The Lead:** runs on your default model with board tools: it lists, adds, assigns, moves and comments on cards, starts a card, messages you (brief, question, review or digest) and keeps `agency-log.md`. Run on the overview plans the Inbox now; the scheduled task does it every weekday (or Monday) at 09:00. With "Lead runs cards automatically" on, planned cards start one after another until the budget is reached.
- **Cards:** Run card starts the assignee in its own chat in the agency folder; the result, chat and estimated cost land on the card and it moves to Review. File changes wait in the diff review; accepting them moves the card to Done. Cost is estimated from token counts for Claude, OpenAI, Gemini and OpenRouter (local models are free); agents on external adapters report no cost.
- **Adapters:** workers run on Claude Code, Hermes, Gemini CLI or Codex over the Agent Client Protocol (install from Settings → Agent engines with each project's official command; Tyslin passes your model keys to them). Hermes gets one profile per agent so each worker keeps its own memory and persona. Goose, ZeroClaw, OpenClaw and custom ACP agents are still there.
- **Models:** Claude, OpenAI, Gemini, OpenRouter (one key, hundreds of models, listed in the picker) and Ollama locally. One default model per computer, shown in the status bar.
- **Channel:** only a Lead talks to you, never a worker. Telegram (your own bot, linked accounts by one-time code) and Slack (your own app's bot token, a channel linked by one-time code; polled from this computer, no public server). Per agency, choose everything, questions and reviews, or digests only; every message also shows on the agency's Channel screen.
- **Skills:** 109 built-in skills (71 written for the agency templates), GitHub skill packs and Anthropic's open skills.
- **Drive:** each agency's folder with real files only (documents, images, PDFs, archives, what the agents make); boards and other app data show with "Show hidden files". Google Drive sync of every agency folder, both ways.
- **Organizations, sign-in, themes, zoom, reset, updates:** as before: separate databases per organization; Google sign-in in official builds; light and dark themes, accent and organization colours; Settings → About → Reset starts fresh; in-app updates.
- **Chat and attachments:** talk to any agent in its agency folder, attach files and folders, review every file change before it is written.

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
    defaultModel.ts  the default model and each organization's Studio assistant
    seedSkills.ts  built-in skill library (versioned; new skills reach existing installs)
    secrets.ts   API keys encrypted with Electron safeStorage
    telegram.ts  Telegram channel (bot polling, linked chats, approvals, task results)
    studio.ts    Mind map, automation and Canvas files in project folders; the Default project
    automation.ts  runs automations (node graph), schedules them, converts old workflows
    drive.ts     Drive: list, preview, folders, rename, move, delete, copy in, confined to the project folder
    gdrive.ts    Google Drive sync (two-way, drive.file scope, state in gsync_* tables)
    teams.ts     department teams: create a team, the fresh-install Default project team
    reset.ts     Settings → About reset: wipe app data, files to the Trash, restart
  preload/     safe bridge exposing window.tyslin to the UI
  renderer/    React UI
    components/  TitleBar, Sidebar (icon rail and chat panel), TitleBar with OrgSwitcher, StatusBar, avatars, icons, dialogs
    pages/       Home (with components/Activity, the former Dashboard), Agents (AgentsHub: tree list, org chart; Assistants is a list in AgentsPage), AgentPage, Assistants list and editor, Chat, Tasks, Connectors, Skills, Settings
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
4. **Crews:** ordered pipelines of agents, such as Scout → Quill → Forge, including hand-offs (Automation's AI agent nodes cover chains today).
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
