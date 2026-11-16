/**
 * Which shell commands an external agent may run without asking (Preferences.autoAllowReadOnly, 10 Nov 2026):
 * looking at files inside the project folder and version checks. Anything that writes, installs, reaches the
 * network, runs project code or looks outside the folder still asks. Conservative on purpose: a command that
 * this file doesn't understand is not read-only.
 */

/** Commands that only look: every argument must be a relative path or a flag. */
const LOOKERS = new Set(['ls', 'cat', 'head', 'tail', 'wc', 'grep', 'rg', 'find', 'file', 'stat', 'du', 'tree', 'pwd', 'echo', 'test', 'true', 'realpath', 'basename', 'dirname', 'sort', 'uniq', 'cut', 'awk', 'sed', 'diff', 'jq', 'type', 'date'])
/** Commands that may be run with any flags but nothing else. */
const VERSION_FLAGS = new Set(['-v', '-V', '--version', 'version', '-h', '--help'])
const VERSIONED = new Set(['node', 'npm', 'pnpm', 'yarn', 'bun', 'npx', 'corepack', 'python', 'python3', 'pip', 'pip3', 'go', 'cargo', 'rustc', 'java', 'ruby', 'php', 'deno', 'git', 'docker', 'gcloud', 'vercel', 'eas', 'expo', 'gradle', 'tsc', 'pytest', 'make', 'gh', 'sqlite3', 'psql', 'mysql', 'uname', 'bash', 'sh', 'zsh'])
/** Git subcommands that read. */
const GIT_READ = new Set(['status', 'log', 'diff', 'show', 'rev-parse', 'ls-files', 'blame', 'describe'])
/** `git branch` / `git tag` flags that only list (no -d/-D/-m/-c/-f/-u, no new names). */
const GIT_BRANCH_LIST = new Set(['-a', '--all', '-r', '--remotes', '-v', '-vv', '--verbose', '--show-current', '--no-color', '--color'])
const GIT_TAG_LIST = new Set(['-l', '--list', '-n', '--no-color', '--color'])
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
  return RISKY.some((r) => r.test(title)) || shellSegments(title).some((words) => riskyRm(words) || riskyInner(words))
}

/** `bash -c '…'`, `sh -c "…"`: the quoted script is checked as a command of its own. */
function riskyInner(words: string[]): boolean {
  return words.some((w, i) => i > 0 && w === '-c' && /^(ba|z|da|k)?sh$/.test(words[i - 1].replace(/^.*\//, '')) && i + 1 < words.length && isRiskyCommand(words[i + 1]))
}

/**
 * `rm` that reaches outside the folder (an absolute, home, variable or `..` path) or wipes the whole folder
 * (`rm -r .`, `rm -rf *`). Quotes are read the way the shell reads them and `--` ends the options, so
 * `rm -rf "/x"` and `rm -rf -- /x` count too (15 Nov 2026 QA).
 */
function riskyRm(words: string[]): boolean {
  for (let i = 0; i < words.length; i++) {
    // Titles sometimes wrap the command in backticks.
    if (words[i].replace(/^`+/, '').replace(/^.*\//, '') !== 'rm' || (i > 0 && words[i - 1] === 'git')) continue
    let recursive = false
    let opts = true
    for (const raw of words.slice(i + 1)) {
      const w = raw.replace(/`+$/, '')
      if (opts && w === '--') { opts = false; continue }
      if (opts && w.startsWith('--')) { if (w === '--recursive') recursive = true; continue }
      if (opts && w.startsWith('-') && w.length > 1) { if (/[rR]/.test(w)) recursive = true; continue }
      const path = w.replace(/\/+$/, '') || w
      if (/^[/~$]/.test(w) || path.split('/').includes('..')) return true
      if (recursive && /^(\.|\*|\.\/\*|\.\*|\.\/\.\*)$/.test(path)) return true
    }
  }
  return false
}

/**
 * Splits a command line into simple commands (at ; & | && || newlines and parentheses) and each into words, with
 * quotes and backslashes handled like the shell: `rm -rf "/a b"` gives ['rm', '-rf', '/a b']. Not a full shell
 * parser; good enough to find what a command touches.
 */
export function shellSegments(line: string): string[][] {
  const segs: string[][] = []
  let words: string[] = []
  let word = ''
  let inWord = false
  let quote: '"' | "'" | null = null
  const endWord = (): void => { if (inWord) words.push(word); word = ''; inWord = false }
  const endSeg = (): void => { endWord(); if (words.length) segs.push(words); words = [] }
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote) {
      if (c === quote) quote = null
      else if (c === '\\' && quote === '"' && i + 1 < line.length) word += line[++i]
      else word += c
      continue
    }
    if (c === '"' || c === "'") { quote = c; inWord = true; continue }
    if (c === '\\' && i + 1 < line.length) { word += line[++i]; inWord = true; continue }
    if (/[;&|()\n]/.test(c)) { endSeg(); continue }
    if (/\s/.test(c)) { endWord(); continue }
    word += c
    inWord = true
  }
  endSeg()
  return segs
}

/** `which pnpm`, `node -v`, `git status`, `ls src`, `cat package.json`: true. `pnpm test`, `python3 -c …`, `cat ~/.ssh/id_rsa`, `echo x > f`: false. */
export function isReadOnlyCommand(title: string): boolean {
  const cmd = title.trim()
  if (!cmd || cmd.length > 600 || /\n/.test(cmd) || FORBIDDEN.test(cmd) || expandsVariable(cmd)) return false
  // Each piece of a pipeline or a chain has to be read-only on its own. Words are read with the shell's quoting,
  // so a quoted sed or awk script stays one word and can be checked as a whole.
  const segments = shellSegments(cmd)
  if (!segments.length) return false
  return segments.every(readOnlySegment)
}

/** True when the shell would put a variable's value into the command (`$X` outside single quotes). */
function expandsVariable(line: string): boolean {
  let quote: string | null = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote === "'") { if (c === "'") quote = null; continue }
    if (c === '\\') { i++; continue }
    if (c === '"') { quote = quote ? null : '"'; continue }
    if (c === "'" && !quote) { quote = "'"; continue }
    if (c === '$' && /[A-Za-z_0-9@*#?!{-]/.test(line[i + 1] ?? '')) return true
  }
  return false
}

function readOnlySegment(words: string[]): boolean {
  // A leading VAR=value can change what the command runs (LD_PRELOAD, GIT_EXTERNAL_DIFF, PAGER): not read-only.
  if (!words.length || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) return false
  const [cmd, ...args] = words
  // `./ls` or `/tmp/x/ls` is some other program with a familiar name.
  if (cmd.includes('/')) return false
  if (cmd === 'which' || cmd === 'whereis' || cmd === 'whoami' || cmd === 'hostname' || cmd === 'uname' || cmd === 'id' || cmd === 'nproc') return args.every((a) => !/[/~$]/.test(a) && (cmd !== 'hostname' || a.startsWith('-')))
  if (VERSIONED.has(cmd) && args.length > 0 && args.every((a) => VERSION_FLAGS.has(a))) return true
  if (cmd === 'git') return gitReadOnly(args[0] === '--no-pager' ? args.slice(1) : args)
  if (cmd === 'npm' || cmd === 'pnpm' || cmd === 'yarn' || cmd === 'bun' || cmd === 'corepack') {
    // `corepack pnpm -v`, `pnpm ls`, `npm config get registry`; never run/test/install/exec.
    const rest = cmd === 'corepack' && args[0] && (args[0] === 'pnpm' || args[0] === 'npm' || args[0] === 'yarn') ? args.slice(1) : args
    if (rest.length > 0 && rest.every((a) => VERSION_FLAGS.has(a))) return true
    const s = rest.join(' ')
    return [...PKG_READ].some((p) => s === p || s.startsWith(p + ' ')) && rest.every(insideArg)
  }
  if (!LOOKERS.has(cmd)) return false
  // sed and awk scripts are checked by their own rules ($ is an address or a field there), their files below.
  if (cmd === 'sed') return sedReadOnly(args)
  if (cmd === 'awk') return awkReadOnly(args)
  if (!args.every(insideArg)) return false
  const flags = args.filter((a) => a.startsWith('-'))
  const plain = args.filter((a) => !a.startsWith('-'))
  switch (cmd) {
    // -exec/-ok run programs, -delete deletes, -fprint*/-fls write files.
    case 'find': return !args.some((a) => /^-(exec|execdir|ok|okdir|delete|fprint|fprint0|fprintf|fls)$/.test(a))
    // -o / --output write the result to a file; --compress-program runs one.
    case 'sort': return !flags.some((a) => /^-[a-zA-Z]*o/.test(a) || /^--(output|compress-program)/.test(a))
    // `uniq in out` writes `out`.
    case 'uniq': return plain.length <= 1
    case 'tree': return !flags.some((a) => /^-[a-zA-Z]*o/.test(a) || a.startsWith('--output'))
    // --pre runs a program on every file.
    case 'rg': return !flags.some((a) => /^--pre(=|$)/.test(a))
    // -C / --compile writes a compiled magic file.
    case 'file': return !flags.some((a) => /^-[a-zA-Z]*C/.test(a) || a.startsWith('--compile'))
    // -s / --set and a bare MMDDhhmm argument set the clock; only formats (+%F) are fine.
    case 'date': return !flags.some((a) => /^-[a-zA-Z]*s/.test(a) || a.startsWith('--set')) && plain.every((a) => a.startsWith('+'))
    default: return true
  }
}

/** Git subcommands that only read. branch, tag, remote and config only in their listing forms. */
function gitReadOnly(args: string[]): boolean {
  const [sub, ...rest] = args
  if (!sub || !rest.every(insideArg)) return false
  // --output writes a file, --exec/--ext-diff run programs, --edit opens an editor.
  if (rest.some((a) => /^--(exec|output|edit|ext-diff)/.test(a) || /^-o/.test(a))) return false
  if (GIT_READ.has(sub)) return true
  switch (sub) {
    case 'stash': return rest[0] === 'list'
    case 'branch': return rest.every((a) => GIT_BRANCH_LIST.has(a))
    case 'tag': {
      // A name without -l creates a tag; with -l it is a pattern to list.
      const listing = rest.some((a) => a === '-l' || a === '--list')
      return rest.every((a) => GIT_TAG_LIST.has(a) || /^-n\d+$/.test(a) || (listing && !a.startsWith('-')))
    }
    case 'remote': return !rest.length || (rest.length === 1 && (rest[0] === '-v' || rest[0] === '--verbose')) || (rest.length === 2 && rest[0] === 'get-url' && !rest[1].startsWith('-'))
    case 'config': return (rest.length === 1 && (rest[0] === '--list' || rest[0] === '-l')) || (rest.length === 2 && rest[0] === '--get' && !rest[1].startsWith('-'))
    default: return false
  }
}

/** sed commands that only print: `5p`, `1,120p`, `$=`, `/re/d`, `10q`, `s/a/b/g` (no w or e flag). */
const SED_ADDR = String.raw`(?:\d+(?:~\d+)?|\$|/(?:\\.|[^/\\])*/)`
const SED_SAFE = new RegExp(String.raw`^(?:${SED_ADDR}(?:\s*,\s*${SED_ADDR})?)?\s*!?\s*(?:[pdqP=n]|s(.)(?:\\.|(?!\1)[^\\])*\1(?:\\.|(?!\1)[^\\])*\1[gpiI0-9]*)$`)

/** sed in its printing forms only: -n/-E/-r/-s/-u/-z, scripts from SED_SAFE, files inside the folder. */
function sedReadOnly(args: string[]): boolean {
  const scripts: string[] = []
  const files: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-e') { if (i + 1 >= args.length) return false; scripts.push(args[++i]); continue }
    if (/^-[nErsuz]+$/.test(a) || a === '--quiet' || a === '--silent' || a === '--regexp-extended') continue
    // -i edits in place, -f reads a script, anything else is unknown.
    if (a.startsWith('-')) return false
    if (!scripts.length && !args.slice(0, i).includes('-e')) scripts.push(a)
    else files.push(a)
  }
  if (!scripts.length) return false
  // w/W write files, e runs a command, r/R read other files: none of them pass SED_SAFE.
  return scripts.every((sc) => sc.split(/[;\n]/).map((c) => c.trim()).filter(Boolean).every((c) => SED_SAFE.test(c))) && files.every(insideArg)
}

/** awk with -F and -v only, and a program that doesn't run commands or write files. */
function awkReadOnly(args: string[]): boolean {
  let program: string | null = null
  const files: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-F' || a === '-v') { i++; continue }
    if (/^-F./.test(a)) continue
    // -f runs a program file, -i inplace edits files, anything else is unknown.
    if (a.startsWith('-')) return false
    if (program === null) program = a
    else files.push(a)
  }
  // system() and pipes run commands, getline can read from one; `>` is already refused for the whole line.
  return program !== null && !/\bsystem\b|\bgetline\b|\|/.test(program) && files.every(insideArg)
}

/** A flag, or a path that stays inside the current folder (the project). `--flag=value` counts by its value. */
function insideArg(a: string): boolean {
  const v = a.startsWith('-') ? (a.includes('=') ? a.slice(a.indexOf('=') + 1) : '') : a
  if (!v) return true
  if (v.startsWith('/') || v.startsWith('~') || v.includes('$') || v.split('/').includes('..')) return false
  return true
}
