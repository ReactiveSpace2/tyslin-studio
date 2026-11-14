/**
 * Which shell commands an external agent may run without asking (Preferences.autoAllowReadOnly, 10 Nov 2026):
 * looking at files inside the project folder and version checks. Anything that writes, installs, reaches the
 * network, runs project code or looks outside the folder still asks. Conservative on purpose: a command that
 * this file doesn't understand is not read-only.
 */

/** Commands that only look: every argument must be a relative path or a flag. */
const LOOKERS = new Set(['ls', 'cat', 'head', 'tail', 'wc', 'grep', 'rg', 'find', 'file', 'stat', 'du', 'tree', 'pwd', 'echo', 'test', 'true', 'realpath', 'basename', 'dirname', 'sort', 'uniq', 'cut', 'awk', 'sed', 'diff', 'jq', 'xargs', 'less', 'more', 'type', 'command', 'date'])
/** Commands that may be run with any flags but nothing else. */
const VERSION_FLAGS = new Set(['-v', '-V', '--version', 'version', '-h', '--help'])
const VERSIONED = new Set(['node', 'npm', 'pnpm', 'yarn', 'bun', 'npx', 'corepack', 'python', 'python3', 'pip', 'pip3', 'go', 'cargo', 'rustc', 'java', 'ruby', 'php', 'deno', 'git', 'docker', 'gcloud', 'vercel', 'eas', 'expo', 'gradle', 'tsc', 'pytest', 'make', 'gh', 'sqlite3', 'psql', 'mysql', 'uname', 'bash', 'sh', 'zsh'])
/** Git subcommands that read. */
const GIT_READ = new Set(['status', 'log', 'diff', 'show', 'branch', 'remote', 'rev-parse', 'ls-files', 'blame', 'describe', 'tag', 'stash list', 'config --get', 'config --list'])
/** Package managers' read subcommands. */
const PKG_READ = new Set(['ls', 'list', 'why', 'outdated', 'view', 'info', 'config get', 'root', 'bin', 'help'])
/** Anything that can write, run arbitrary code or leave the folder. `>` covers redirects; `$(`/backticks run code. */
const FORBIDDEN = /[><`]|\$\(|\$\{|\bsudo\b|\brm\b|\bmv\b|\bcp\b|\bchmod\b|\bchown\b|\bln\b|\btee\b|\bdd\b|\bcurl\b|\bwget\b|\bssh\b|\bscp\b|\brsync\b|\bkill\b|\bpkill\b|\benv\b|\bprintenv\b|\bexport\b|\bexec\b|\beval\b|\bsource\b|\bnohup\b|\bcrontab\b/

/**
 * Commands that still ask in Auto mode (owner, 14 Nov 2026): running as root, deleting from outside the folder,
 * rewriting git history or the remote, piping a download into a shell, wiping disks, shutting down.
 */
const RISKY = [
  /\bsudo\b|\bsu\s+-|\bdoas\b/,
  /\brm\s+(-[a-zA-Z]*\s+)*(\/|~|\$HOME|\.\.)/,
  /\brm\s+-[a-zA-Z]*[rR][a-zA-Z]*\s+(\*|\.\/?\s*$|\.$)/,
  /\bgit\s+push\b.*(--force|\s-f\b|--mirror|--delete|\s:)/,
  /\bgit\s+(reset\s+--hard|clean\s+-[a-zA-Z]*f|filter-branch|filter-repo|rebase)\b/,
  /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/,
  /\b(mkfs|fdisk|parted|diskutil\s+erase|format)\b/,
  /\bdd\s+[^|]*of=\/dev\//,
  /\b(shutdown|reboot|halt|poweroff)\b/,
  /\bchmod\s+-R\s+777\b|\bchown\s+-R\b.*\s\//,
  /:\(\)\s*\{/,
  /~\/\.ssh|\.aws\/credentials|\.gnupg/
]

/** True when Auto mode should still ask the user before this command runs. */
export function isRiskyCommand(title: string): boolean {
  return RISKY.some((r) => r.test(title))
}

/** `which pnpm`, `node -v`, `git status`, `ls src`, `cat package.json`: true. `pnpm test`, `python3 -c …`, `cat ~/.ssh/id_rsa`, `echo x > f`: false. */
export function isReadOnlyCommand(title: string): boolean {
  const cmd = title.trim()
  if (!cmd || cmd.length > 600 || /\n/.test(cmd) || FORBIDDEN.test(cmd)) return false
  // Each piece of a pipeline or a chain has to be read-only on its own.
  const segments = cmd.split(/\s*(?:&&|\|\||\||;)\s*/).map((s) => s.trim()).filter(Boolean)
  if (!segments.length) return false
  return segments.every(readOnlySegment)
}

function readOnlySegment(seg: string): boolean {
  const words = seg.split(/\s+/)
  // Leading VAR=value assignments are fine (they can't reach outside the command).
  while (words.length && /^[A-Za-z_][A-Za-z0-9_]*=[^\s]*$/.test(words[0])) words.shift()
  if (!words.length) return false
  const [cmdWord, ...args] = words
  const cmd = cmdWord.replace(/^.*\//, '')
  const sub = args.join(' ')
  if (cmd === 'which' || cmd === 'whereis' || cmd === 'whoami' || cmd === 'hostname' || cmd === 'uname' || cmd === 'id' || cmd === 'nproc') return args.every((a) => !/[/~]/.test(a))
  if (VERSIONED.has(cmd) && args.length > 0 && args.every((a) => VERSION_FLAGS.has(a))) return true
  if (cmd === 'git') return [...GIT_READ].some((g) => sub === g || sub.startsWith(g + ' ')) && !/--(exec|output|edit)|-o\b/.test(sub) && args.slice(1).every(insideArg)
  if (cmd === 'npm' || cmd === 'pnpm' || cmd === 'yarn' || cmd === 'bun' || cmd === 'corepack') {
    // `corepack pnpm -v`, `pnpm ls`, `npm config get registry`; never run/test/install/exec.
    const rest = cmd === 'corepack' && args[0] && (args[0] === 'pnpm' || args[0] === 'npm' || args[0] === 'yarn') ? args.slice(1) : args
    if (rest.length > 0 && rest.every((a) => VERSION_FLAGS.has(a))) return true
    const s = rest.join(' ')
    return [...PKG_READ].some((p) => s === p || s.startsWith(p + ' ')) && rest.every(insideArg)
  }
  if (LOOKERS.has(cmd)) {
    // sed/awk can write with -i / redirection; only their printing forms.
    if (cmd === 'sed' && args.some((a) => /^-[a-zA-Z]*i/.test(a))) return false
    if (cmd === 'awk' && /\bprint\s*>/.test(sub)) return false
    if (cmd === 'find' && /-(exec|delete|ok|fprint)/.test(sub)) return false
    if (cmd === 'xargs') return false
    return args.every(insideArg)
  }
  return false
}

/** A flag, or a path that stays inside the current folder (the project). Quoted paths count by their contents. */
function insideArg(a: string): boolean {
  const v = a.replace(/^["']|["']$/g, '')
  if (!v || v.startsWith('-')) return true
  if (v.startsWith('/') || v.startsWith('~') || v.startsWith('$') || v.includes('..')) return false
  return true
}
