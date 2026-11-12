/**
 * A permission request from an adapter is titled with the raw shell command ("node -e ' const { execSync } = …").
 * This says in plain words what such a command is, for the permission card (12 Nov 2026); the command itself is
 * still shown, folded, under it. Best effort and never a safety check: main/readOnly.ts decides what may run
 * without asking, and anything this file doesn't recognise is described as just "Run <program>".
 */
export interface CommandSummary {
  /** One line, e.g. "Run a Node script written in the command". */
  summary: string
  /** What stands out, e.g. "Starts Chrome", "Writes outside the agency folder: /tmp". */
  notes: string[]
}

const PROGRAMS = new Set(['node', 'npm', 'npx', 'pnpm', 'yarn', 'bun', 'python', 'python3', 'pip', 'pip3', 'uv', 'uvx', 'git', 'gh', 'bash', 'sh', 'zsh', 'cd', 'ls', 'cat', 'mkdir', 'rm', 'mv', 'cp', 'touch', 'chmod', 'curl', 'wget', 'docker', 'make', 'cargo', 'go', 'tsc', 'eslint', 'prettier', 'vitest', 'jest', 'pytest', 'playwright', 'expo', 'eas', 'sed', 'awk', 'grep', 'rg', 'find', 'echo', 'tar', 'unzip', 'open', 'xdg-open', 'google-chrome', 'chromium', 'kill', 'pkill', 'env', 'sudo'])
const PKG = new Set(['npm', 'pnpm', 'yarn', 'bun'])

/** Whether a permission title is a shell command rather than a sentence ("Write file", "Edit landing.html"). */
export function looksLikeCommand(title: string): boolean {
  const t = title.trim().replace(/^`+|`+$/g, '')
  const first = (t.split(/\s+/)[0] ?? '').replace(/^.*\//, '')
  return PROGRAMS.has(first) || /^\.{0,2}\//.test(t) || /\s(&&|\|\||\|)\s/.test(t) || /^[A-Z_][A-Z0-9_]*=\S+\s/.test(t)
}

function one(seg: string): string {
  const words = seg.trim().split(/\s+/)
  while (words.length > 1 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) words.shift()
  const prog = (words[0] ?? '').replace(/^.*\//, '')
  const a = words.slice(1)
  const sub = a.find((w) => !w.startsWith('-')) ?? ''
  if (prog === 'node' && a.some((w) => w === '-e' || w === '--eval' || w === '-p')) return 'Run a Node script written in the command'
  if ((prog === 'python' || prog === 'python3') && a.includes('-c')) return 'Run a Python script written in the command'
  if (prog === 'node' || prog === 'python' || prog === 'python3' || prog === 'bash' || prog === 'sh') return sub ? `Run the script ${sub}` : `Start ${prog}`
  if (PKG.has(prog)) {
    if (/^(i|install|add|ci)$/.test(sub)) return a.filter((w) => !w.startsWith('-')).length > 1 ? `Install packages with ${prog}: ${a.filter((w) => !w.startsWith('-')).slice(1, 4).join(', ')}` : `Install the project's packages with ${prog}`
    if (/^(test|t)$/.test(sub)) return 'Run the tests'
    if (sub === 'run' || sub === 'exec' || sub === 'dlx') { const s = a.filter((w) => !w.startsWith('-'))[1]; return s ? `Run “${s}” with ${prog}` : `Run a script with ${prog}` }
    if (/^(build|dev|start|lint|typecheck|format)$/.test(sub)) return `Run the project's ${sub} script`
    if (/^(remove|uninstall|rm)$/.test(sub)) return `Remove packages with ${prog}`
    return sub ? `Run ${prog} ${sub}` : `Run ${prog}`
  }
  if (prog === 'npx' || prog === 'uvx') return sub ? `Download and run ${sub} with ${prog}` : `Run ${prog}`
  if (prog === 'pip' || prog === 'pip3' || prog === 'uv') return /install|add/.test(sub) ? 'Install Python packages' : `Run ${prog} ${sub}`.trim()
  if (prog === 'git') return sub === 'commit' ? 'Commit to git' : sub === 'push' ? 'Push to the git remote' : sub === 'pull' || sub === 'fetch' ? 'Fetch from the git remote' : sub === 'checkout' || sub === 'switch' ? 'Switch git branch' : sub === 'reset' || sub === 'clean' || sub === 'restore' ? `Discard changes with git ${sub}` : `Run git ${sub}`.trim()
  if (prog === 'rm') return 'Delete files'
  if (prog === 'mv') return 'Move or rename files'
  if (prog === 'cp') return 'Copy files'
  if (prog === 'mkdir') return 'Make a folder'
  if (prog === 'touch') return 'Make an empty file'
  if (prog === 'chmod') return 'Change file permissions'
  if (prog === 'curl' || prog === 'wget') return 'Fetch something from the web'
  if (prog === 'docker') return `Run Docker ${sub}`.trim()
  if (prog === 'kill' || prog === 'pkill') return 'Stop a running program'
  if (prog === 'sudo') return 'Run a command as administrator'
  if (prog === 'google-chrome' || prog === 'chromium') return 'Start Chrome'
  if (prog === 'cd') return ''
  return prog ? `Run ${prog}` : ''
}

export function describeCommand(title: string): CommandSummary {
  const cmd = title.trim().replace(/^`+|`+$/g, '')
  // Quoted scripts hold their own ; and | characters: describe by the outer command only.
  const outer = cmd.replace(/'[^']*'|"[^"]*"/g, '""')
  const parts = outer.split(/\s*(?:&&|\|\||;|\|)\s*/).map(one).filter(Boolean)
  const unique = [...new Set(parts)]
  const summary = unique.length === 0 ? 'Run a command' : unique.length <= 2 ? unique.join(', then ').replace(/, then ([A-Z])/, (_m, c: string) => `, then ${c.toLowerCase()}`) : `${unique[0]}, and ${unique.length - 1} more steps`
  const notes: string[] = []
  if (/\b(google-chrome|chromium|chrome)\b[^\n]*--headless|puppeteer|playwright/i.test(cmd)) notes.push('Starts a browser without a window')
  else if (/\b(google-chrome|chromium)\b/.test(cmd)) notes.push('Starts Chrome')
  if (/screenshot/i.test(cmd)) notes.push('Takes screenshots')
  if (/\b(curl|wget)\b|https?:\/\//.test(cmd)) notes.push('Reaches the web')
  const outside = [...new Set([...cmd.matchAll(/(?:^|[\s"'`=(])((?:\/tmp|\/var|\/etc|\/usr|\/home|\/Users|~)(?:\/[^\s"'`$)]*)?)/g)].map((m) => m[1].replace(/\/[^/]*\$?$/, '') || m[1]))].slice(0, 3)
  if (outside.length) notes.push(`Uses paths outside the agency folder: ${outside.join(', ')}`)
  if (/\bsudo\b/.test(outer)) notes.push('Asks for administrator rights')
  if (/\brm\s+-[a-zA-Z]*r/.test(outer)) notes.push('Deletes folders')
  return { summary, notes }
}
