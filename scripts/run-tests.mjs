// Main-process regression tests (16 Nov 2026): `npm test`.
// Each tests/*.test.ts is bundled with esbuild (tsconfig.node.json paths, so @shared/* resolves) and run with
// `node --test`. Electron, the database, saved keys and the ACP client are replaced by small stubs from
// tests/stubs/, so main-process modules load in plain Node. The stubs' state lives on globalThis (see each stub).
import { build } from 'esbuild'
import { spawnSync } from 'child_process'
import { mkdtempSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const stubs = join(root, 'tests', 'stubs')
const only = process.argv.slice(2)
const tests = readdirSync(join(root, 'tests')).filter((f) => f.endsWith('.test.ts') && (!only.length || only.some((o) => f.includes(o))))
const out = mkdtempSync(join(tmpdir(), 'tyslin-tests-'))

/** electron, and ./db, ./secrets, ./acp when imported from src/main, come from tests/stubs. */
const stubPlugin = {
  name: 'tyslin-stubs',
  setup(b) {
    b.onResolve({ filter: /^electron$/ }, () => ({ path: join(stubs, 'electron.ts') }))
    b.onResolve({ filter: /^\.\/(db|secrets|acp)$/ }, (args) =>
      args.importer.startsWith(join(root, 'src', 'main')) ? { path: join(stubs, args.path.slice(2) + '.ts') } : undefined)
  }
}

try {
  await build({
    entryPoints: tests.map((t) => join(root, 'tests', t)),
    outdir: out, outExtension: { '.js': '.mjs' }, bundle: true, platform: 'node', format: 'esm', target: 'node22',
    tsconfig: join(root, 'tsconfig.node.json'), plugins: [stubPlugin], logLevel: 'warning',
    banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" }
  })
  const files = readdirSync(out).filter((f) => f.endsWith('.mjs')).map((f) => join(out, f))
  const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } })
  process.exitCode = r.status ?? 1
} finally {
  rmSync(out, { recursive: true, force: true })
}
