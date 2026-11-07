import { createServer, type Server } from 'http'
import { createHash, randomBytes } from 'crypto'
import { shell } from 'electron'
import { getSecret, setSecret } from './secrets'
import type { OpenRouterAccount } from '@shared/types'

/**
 * "Connect with OpenRouter": OpenRouter's OAuth PKCE flow (openrouter.ai/docs, OAuth PKCE).
 * The browser opens openrouter.ai/auth, the user signs in and approves, OpenRouter redirects to a
 * one-off server on localhost with a code, and the code is swapped for a user-controlled API key.
 * The key is stored like a pasted one (secret "openrouter"); the user can see and revoke it on
 * openrouter.ai/keys. Claude, OpenAI and Gemini offer no such flow for API access, so their
 * sign-in path is the adapters (Claude Code, Codex, Gemini CLI) under Agent engines.
 */
const AUTH_URL = 'https://openrouter.ai/auth'
const KEYS_URL = 'https://openrouter.ai/api/v1/auth/keys'
const TIMEOUT_MS = 5 * 60 * 1000

let cancelPending: ((reason: string) => void) | null = null

const b64url = (buf: Buffer): string => buf.toString('base64url')

export function cancelOpenRouter(): void {
  cancelPending?.('Connection cancelled.')
}

export async function connectOpenRouter(): Promise<void> {
  cancelOpenRouter()
  const verifier = b64url(randomBytes(32))
  const state = b64url(randomBytes(16))
  const code = await waitForCode(verifier, state)
  const res = await fetch(KEYS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
    signal: AbortSignal.timeout(20_000)
  })
  if (!res.ok) throw new Error(`OpenRouter did not hand over a key (${res.status}). Try again.`)
  const { key } = (await res.json()) as { key?: string }
  if (!key) throw new Error('OpenRouter did not hand over a key. Try again.')
  setSecret('openrouter', key)
}

/** Label, spend and limit of the saved key (GET /api/v1/key). Null without a key or when offline. */
export async function openRouterAccount(): Promise<OpenRouterAccount | null> {
  const key = getSecret('openrouter')
  if (!key) return null
  try {
    const res = await fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) })
    if (res.status === 401) return { valid: false, label: '', usage: 0, limit: null, freeTier: false }
    if (!res.ok) return null
    const { data } = (await res.json()) as { data?: { label?: string; usage?: number; limit?: number | null; is_free_tier?: boolean } }
    return { valid: true, label: data?.label ?? '', usage: data?.usage ?? 0, limit: data?.limit ?? null, freeTier: !!data?.is_free_tier }
  } catch { return null }
}

function waitForCode(verifier: string, state: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let base = ''
    let timer: NodeJS.Timeout | undefined
    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', base)
      if (url.pathname !== '/callback') { res.writeHead(404).end(); return }
      const code = url.searchParams.get('code')
      const ok = !!code && url.searchParams.get('state') === state
      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(page(ok))
      if (ok) finish(null, code!)
      else finish('OpenRouter connection was cancelled.')
    })
    const finish = (err: string | null, code?: string): void => {
      clearTimeout(timer)
      cancelPending = null
      server.close()
      if (err) reject(new Error(err))
      else resolve(code!)
    }
    cancelPending = (reason) => finish(reason)
    server.on('error', () => finish('Could not start the connection on this computer.'))
    // OpenRouter accepts localhost callbacks on any port.
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') return finish('Could not start the connection on this computer.')
      base = `http://localhost:${addr.port}`
      const params = new URLSearchParams({
        callback_url: `${base}/callback`,
        code_challenge: b64url(createHash('sha256').update(verifier).digest()),
        code_challenge_method: 'S256',
        key_label: 'Tyslin Studio',
        state
      })
      timer = setTimeout(() => finish('Connection timed out. Try again.'), TIMEOUT_MS)
      void shell.openExternal(`${AUTH_URL}?${params}`).catch(() => finish('Could not open your browser.'))
    })
  })
}

function page(ok: boolean): string {
  const msg = ok ? 'OpenRouter is connected. You can close this tab and go back to Tyslin Studio.' : 'The connection did not finish. Go back to Tyslin Studio and try again.'
  return `<!doctype html><meta charset="utf-8"><title>Tyslin Studio</title><body style="font-family:system-ui,sans-serif;background:#FAFAF7;color:#0F0F0D;display:grid;place-items:center;height:100vh;margin:0"><p style="max-width:420px;text-align:center;font-size:16px;line-height:1.5">${msg}</p></body>`
}
