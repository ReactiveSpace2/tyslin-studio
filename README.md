<p align="center">
  <img src="resources/brand/logo-beta.png" alt="Tyslin Studio beta" width="360">
</p>

<h1 align="center">Tyslin Studio</h1>

<p align="center"><strong>Every agent you run. One studio.</strong></p>

<p align="center">
  <a href="https://tyslin.ai">tyslin.ai</a> · info@tyslin.ai · A ReactiveSpace product
</p>

---

Tyslin Studio is an open-source desktop studio for building and working with AI agents. Give each agent a job, instructions, skills, a model and a character, link it to your projects, and work with it in chat.

Everything runs on your computer. Agents, chats, projects and skills live in a local SQLite database, and your API keys are encrypted with your system keychain. Bring your own key for Anthropic (Claude), OpenAI or Google Gemini, or run models locally with Ollama.

> **Status: beta (v0.3.0).** Tested on Linux. macOS and Windows builds are not yet tested or signed. Expect rough edges and breaking changes.

## What works today

- **Home:** the first screen shows the Tyslin logo, the standing mascot and the app version, then every model and agent engine Tyslin works with and whether each is ready (key added, installed). Click one to set it up.
- **Agents:** create, edit and delete agents with a name, instructions, provider, model, skills, schedule and a character (shape and colour). Builder, the built-in agent, uses the Tyslin mascot.
- **Chat:** streamed conversations with any agent; history is saved per agent and project.
- **Attachments:** the + button in the chat box attaches files or whole folders. Text files go to the agent with your message. A folder sends its file list and every text file in it, skipping hidden folders, `node_modules` and build folders. Images (PNG, JPEG, GIF, WebP, up to 5 MB) are sent to Claude, OpenAI, Gemini and Ollama as images. External agents get the text, plus each image's path. There's a limit of about 200,000 characters per message, and anything left out is marked on the attachment.
- **Projects:** link a folder on disk; agents in that project can list, read and change its files.
- **Review before it's written:** when an agent wants to change a file, you see a diff first and accept or reject each change, or all at once. The agent hears what you decided and carries on. Each agent can be switched to "Write directly" instead.
- **Skills:** reusable instruction blocks added to an agent's system prompt. 23 are built in: meeting notes, follow-up emails, meeting prep, daily plans, weekly updates, decision memos, research, competitor briefs, feedback themes, outreach, objection replies, lead qualifying, one-pagers, slide outlines, editing, data analysis, careful file edits and more. Create, edit, search and delete skills in the app, or import and export them as Markdown files (frontmatter `name` and `description`, then the instructions).
- **Providers:** Anthropic (Claude), OpenAI, Google Gemini (key from Google AI Studio), and local models through Ollama.
- **External agents:** run any agent on an agent you've installed instead of Tyslin's built-in models: Goose, Hermes, ZeroClaw, OpenClaw, or any other program that speaks the Agent Client Protocol (ACP). Pick it under "Runs on" in the agent editor. Tyslin sends your instructions and skills with each message, shows the agent's tool calls, puts file edits it asks Tyslin to make through your review, and shows its permission requests ("Run npm test?") in chat. Settings → Agent engines shows what's installed, tests the connection, and has an Install button for Goose, Hermes and OpenClaw that runs each project's official installer (it shows you the exact command first and streams the output). Tyslin doesn't ship these agents.
- **Stop:** stop any reply mid-way from the chat box.
- **Settings:** API keys and Ollama; agent engines; defaults for new agents and guidelines added to every agent's instructions; update status, app version and where your data lives.
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
    index.ts     window + IPC handlers
    db.ts        SQLite schema, seed data and queries
    runtime.ts   AgentRuntime interface + Anthropic / OpenAI-compatible (OpenAI, Gemini, Ollama) runtimes (tool loop, run events) + AcpRuntime
    acp.ts       ACP client: starts an external agent, drives one turn, maps its updates to run events
    engines.ts   external agent catalogue, PATH lookup, command overrides
    tools.ts     project file tools; staged writes and the review hand-back
    skillFiles.ts  skill Markdown import/export and validation
    seedSkills.ts  built-in skill library (versioned; new skills reach existing installs)
    secrets.ts   API keys encrypted with Electron safeStorage
  preload/     safe bridge exposing window.tyslin to the UI
  renderer/    React UI (Agents, Chat, Agent editor, Skills, Settings with Models / Agents / About & updates tabs)
  shared/      types shared by all three, plus diff.ts (hunk split and apply, used by main and UI)
resources/     app icon and brand files
```

Runtimes report progress as a typed event stream shaped like AG-UI events (`RunEvent` in `shared/types.ts`: run_started, text_delta, tool_call_start/args/end, tool_result, approval_needed, state_update, run_finished, run_error). The UI listens to that stream only.

Adding a feature that needs data: type in `shared/types.ts` → query in `db.ts` → `ipcMain.handle` in `main/index.ts` → expose in `preload/index.ts` → use in the renderer. Run `npm run typecheck` after every change.

## Roadmap

1. **Runs and triggers:** every reply as an inspectable run; run agents on their schedule, when files change in a project folder, or from a local webhook.
2. **Costs:** tokens and spend per run, agent, project and model, with an optional monthly cap.
3. **Memory in your files:** per-project memory in `.tyslin/memory/` that you can read, edit and commit.
4. **Crews:** ordered pipelines of agents, such as Researcher → Writer → Critic, including hand-offs.
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
