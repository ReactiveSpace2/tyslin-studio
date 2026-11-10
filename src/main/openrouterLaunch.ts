import { writeFileSync } from 'fs'
import { join } from 'path'
import { OPENROUTER_ANTHROPIC_BASE, OPENROUTER_API } from '@shared/openrouter'

/**
 * The environment (and for Codex the config.toml) that runs one Claude Code or Codex worker on OpenRouter (owner,
 * 10 Nov 2026). No Electron or database imports, so it can be tested alone. The key goes only into this process's
 * environment; the user's ~/.claude and ~/.codex (and their own sign-ins) are never used or written.
 * - Claude Code: OpenRouter's Anthropic-compatible API (ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN, ANTHROPIC_API_KEY
 *   explicitly empty, per OpenRouter's Claude Code guide), every model role set to the agent's anthropic/* slug, and
 *   CLAUDE_CONFIG_DIR = `home` (userData/adapters/claude-openrouter).
 * - Codex: CODEX_HOME = `home` (userData/adapters/codex-openrouter/<agent id>) with a config.toml naming an `openrouter`
 *   provider (Responses API) and command-based auth: Codex runs the system shell to print TYSLIN_OPENROUTER_KEY from
 *   its own environment, so the key is never written to config.toml or auth.json. No env_key (Codex refuses both).
 */

/** Variables that would send the run somewhere else (a saved Anthropic/OpenAI key, Bedrock, the user's own homes). */
const ROUTE_VARS: Record<'claude-code' | 'codex', string[]> = {
  'claude-code': ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_CUSTOM_HEADERS', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CONFIG_DIR'],
  codex: ['OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL', 'CODEX_HOME']
}
const CLAUDE_MODEL_VARS = ['ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_SMALL_FAST_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL']

/** The Codex config for one OpenRouter agent: model, provider, and the shell command that prints the key. */
export function codexOpenRouterToml(slug: string, platform: NodeJS.Platform = process.platform): string {
  const win = platform === 'win32'
  const command = win ? (process.env.ComSpec || 'cmd.exe') : '/bin/sh'
  const args = win ? ['/d', '/c', 'echo %TYSLIN_OPENROUTER_KEY%'] : ['-c', 'printf %s "$TYSLIN_OPENROUTER_KEY"']
  const q = (v: string): string => JSON.stringify(v) // a TOML basic string for these plain values
  return [
    '# Written by Tyslin Studio for one agent that runs on OpenRouter. Rewritten before every run; holds no key.',
    `model = ${q(slug)}`,
    'model_provider = "openrouter"',
    '',
    '[model_providers.openrouter]',
    'name = "OpenRouter"',
    `base_url = ${q(OPENROUTER_API)}`,
    'wire_api = "responses"',
    '',
    '[model_providers.openrouter.auth]',
    `command = ${q(command)}`,
    `args = [${args.map(q).join(', ')}]`,
    'timeout_ms = 5000',
    'refresh_interval_ms = 0',
    ''
  ].join('\n')
}

/** Sets `env` (a copy of the adapter's environment) up for an OpenRouter run; `home` is the Tyslin-owned folder, already made. */
export function openRouterLaunchEnv(id: 'claude-code' | 'codex', slug: string, key: string, home: string, env: NodeJS.ProcessEnv): void {
  for (const v of ROUTE_VARS[id]) delete env[v]
  if (id === 'claude-code') {
    env.ANTHROPIC_BASE_URL = OPENROUTER_ANTHROPIC_BASE
    env.ANTHROPIC_AUTH_TOKEN = key
    env.ANTHROPIC_API_KEY = ''
    for (const v of CLAUDE_MODEL_VARS) env[v] = slug
    env.CLAUDE_CONFIG_DIR = home
    // Claude Code retries failed API calls about ten times with backoff, so a refused key or an empty account sat
    // for minutes before any error showed (tested with a fake key, 10 Nov 2026). Two retries still cover blips.
    env.CLAUDE_CODE_MAX_RETRIES = '2'
    return
  }
  writeFileSync(join(home, 'config.toml'), codexOpenRouterToml(slug), { mode: 0o600 })
  env.CODEX_HOME = home
  env.TYSLIN_OPENROUTER_KEY = key
}
