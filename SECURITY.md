# Security

Tyslin Studio runs AI agents on your computer with your API keys and your files, so security reports matter to us.

## Reporting a vulnerability

Please don't open a public issue for a security problem. Write to **info@tyslin.ai** with "Security" in the subject, including:

- what the problem is and what it could let someone do,
- steps to reproduce (a minimal example helps most),
- the version (Settings → About) and your operating system.

You'll get a reply within three working days, and a fix or a mitigation plan within two weeks for anything that lets an agent or a web page reach outside its agency folder, read a key, or run something you didn't approve. We'll name you in the release notes if you'd like.

## What counts

Reports we treat as security issues:

- An agent reading or writing outside its agency folder (path confinement in `src/main/drive.ts`, `tools.ts`, `studio.ts`, `preview.ts`), including through symlinks.
- A file change or shell command that runs without the review or the permission prompt the app promises.
- API keys, tokens or MCP headers reaching the window, a log, a file an agent can read, or a third party.
- A previewed page (`tyslin-preview://`) reaching the network, the file system or the app's window.
- A Telegram or Slack message from an unlinked chat reaching an agent.
- Installers or updates that could be replaced with something else.

Things that are not in scope: bugs in the model providers or the adapters themselves (Claude Code, Codex, Gemini CLI), prompt injection that a model falls for while staying inside the limits above, and issues that need physical access to an unlocked computer.

## Supported versions

Only the latest release gets fixes. The in-app updater (Windows, AppImage) and the GitHub Releases page carry them.

## How the app protects you

- API keys are encrypted with the operating system keychain (`safeStorage`); Settings → Models says when no keychain is available.
- Every file an agent touches goes through folder confinement, and every write waits for your review.
- Agents' shell commands ask first, except a short allow-list of read-only commands you can switch off in Settings → Notifications.
- Previews run in a sandboxed frame on a custom scheme that serves only that agency's folder.
- Telegram and Slack bots are yours, polled from your computer, and answer only chats linked with a one-time code.
- No analytics or telemetry. The app contacts only the providers and services you set up, plus GitHub for updates, skill packs and the star count.
