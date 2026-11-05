import { createServer, type Server } from 'http'
import { createHash, randomBytes } from 'crypto'
import { shell } from 'electron'
import { getSetting, setSetting } from './db'
import { getSecret, setSecret } from './secrets'
import type { Account, AuthStatus } from '@shared/types'

/**
 * Optional "Sign in with Google" for the desktop app, using Google's flow for installed apps:
 * the system browser opens Google's sign-in page, Google redirects to a one-off server on
 * 127.0.0.1, and the code is swapped for an ID token with PKCE. Only the profile (email, name)
 * is kept, in the settings table; Google's tokens are dropped because nothing uses them yet.
 *
 * The OAuth client is a "Desktop app" client in the Google Cloud project `tyslin-auth`, passed in
 * at build time (MAIN_VITE_GOOGLE_CLIENT_ID / MAIN_VITE_GOOGLE_CLIENT_SECRET in `.env` or CI).
 * Google treats a desktop client's secret as public; it is not a credential. Without a client ID,
 * sign-in is hidden.
 */
const CLIENT_ID = import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID ?? ''
const CLIENT_SECRET = import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET ?? ''
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const TIMEOUT_MS = 5 * 60 * 1000

let cancelPending: ((reason: string) => void) | null = null

const b64url = (buf: Buffer): string => buf.toString('base64url')

function storedAccount(): Account | null {
  try {
    const v = JSON.parse(getSetting('account') || 'null') as Account | null
    return v?.email ? { email: v.email, name: v.name || v.email } : null
  } catch {
    return null
  }
}

export function authStatus(): AuthStatus {
  return { configured: !!CLIENT_ID, account: storedAccount() }
}

export function signOut(): AuthStatus {
  setSetting('account', '')
  return authStatus()
}

export function cancelSignIn(): void {
  cancelPending?.('Sign-in cancelled.')
}

export async function signIn(): Promise<AuthStatus> {
  if (!CLIENT_ID) throw new Error('Google sign-in is not set up in this build.')
  cancelSignIn()
  const verifier = b64url(randomBytes(32))
  const state = b64url(randomBytes(16))
  const { code, redirectUri } = await waitForCode(verifier, state, { scope: 'openid email profile', prompt: 'select_account' })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code_verifier: verifier,
      redirect_uri: redirectUri, grant_type: 'authorization_code'
    })
  })
  if (!res.ok) throw new Error(`Google sign-in failed (${res.status}).`)
  const { id_token: idToken } = (await res.json()) as { id_token?: string }
  if (!idToken) throw new Error('Google did not return an identity.')

  // The token came straight from Google's token endpoint over TLS, so its claims can be read
  // without checking the signature (OpenID Connect Core 3.1.3.7); the basic checks still apply.
  const claims = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
    iss?: string; aud?: string; exp?: number; email?: string; email_verified?: boolean; name?: string
  }
  const issuerOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com'
  if (!issuerOk || claims.aud !== CLIENT_ID || !claims.exp || claims.exp * 1000 < Date.now()) {
    throw new Error('Google sign-in could not be verified.')
  }
  if (!claims.email || claims.email_verified === false) throw new Error('This Google account has no verified email.')

  setSetting('account', JSON.stringify({ email: claims.email, name: claims.name || claims.email } satisfies Account))
  return authStatus()
}

/** Starts the loopback server, opens Google in the browser, and waits for the redirect. */
function waitForCode(verifier: string, state: string, extra: Record<string, string>): Promise<{ code: string; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    let redirectUri = ''
    let timer: NodeJS.Timeout | undefined
    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', redirectUri)
      if (url.pathname !== '/') {
        res.writeHead(404).end()
        return
      }
      const error = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      const ok = !error && !!code && url.searchParams.get('state') === state
      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(page(ok))
      if (ok) finish(null, code!)
      else finish(error === 'access_denied' ? 'Sign-in cancelled.' : 'Google sign-in failed.')
    })
    const finish = (err: string | null, code?: string): void => {
      clearTimeout(timer)
      cancelPending = null
      server.close()
      if (err) reject(new Error(err))
      else resolve({ code: code!, redirectUri })
    }
    cancelPending = (reason) => finish(reason)
    server.on('error', () => finish('Could not start sign-in on this computer.'))
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') return finish('Could not start sign-in on this computer.')
      redirectUri = `http://127.0.0.1:${addr.port}`
      const params = new URLSearchParams({
        client_id: CLIENT_ID, redirect_uri: redirectUri, response_type: 'code',
        code_challenge: b64url(createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256',
        state, ...extra
      })
      timer = setTimeout(() => finish('Sign-in timed out. Try again.'), TIMEOUT_MS)
      void shell.openExternal(`${AUTH_URL}?${params}`).catch(() => finish('Could not open your browser.'))
    })
  })
}

/**
 * Google Drive access for project sync. Asks only for drive.file: Tyslin can see and change the files it
 * created in Drive and nothing else. The refresh token is kept encrypted (secret "gdrive"), the email in
 * the global setting gdrive:account.
 */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
let driveToken: { value: string; expires: number } | null = null
const tokenUrl = (): string => process.env.TYSLIN_GOOGLE_TOKEN_URL || TOKEN_URL

export async function connectDrive(): Promise<string> {
  if (!CLIENT_ID) throw new Error('Google sign-in is not set up in this build, so Google Drive can\'t be connected.')
  cancelSignIn()
  const verifier = b64url(randomBytes(32))
  const state = b64url(randomBytes(16))
  const { code, redirectUri } = await waitForCode(verifier, state, { scope: `openid email ${DRIVE_SCOPE}`, access_type: 'offline', prompt: 'consent' })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code_verifier: verifier, redirect_uri: redirectUri, grant_type: 'authorization_code' })
  })
  if (!res.ok) throw new Error(`Google Drive could not be connected (${res.status}).`)
  const t = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; scope?: string }
  if (!t.refresh_token) throw new Error('Google did not grant offline access. Try connecting again.')
  if (t.scope && !t.scope.includes(DRIVE_SCOPE)) throw new Error('Google Drive access was not granted. Tick the Drive box on Google\'s page and try again.')
  const claims = JSON.parse(Buffer.from((t.id_token ?? '').split('.')[1] ?? '', 'base64url').toString('utf8') || '{}') as { email?: string }
  setSecret('gdrive', t.refresh_token)
  setSetting('gdrive:account', claims.email ?? '')
  if (t.access_token) driveToken = { value: t.access_token, expires: Date.now() + ((t.expires_in ?? 3600) - 60) * 1000 }
  return claims.email ?? ''
}

export function driveConnected(): boolean {
  return !!getSecret('gdrive')
}

/** A fresh access token for Drive calls (refreshed with the stored refresh token). */
export async function driveAccessToken(): Promise<string> {
  if (driveToken && driveToken.expires > Date.now()) return driveToken.value
  const refresh = getSecret('gdrive')
  if (!refresh) throw new Error('Google Drive is not connected.')
  const res = await fetch(tokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' })
  })
  if (res.status === 400 || res.status === 401) {
    // Access was removed in the Google account (or the token expired): connect again.
    disconnectDrive(false)
    throw new Error('Google Drive access has ended. Connect Google Drive again.')
  }
  if (!res.ok) throw new Error(`Google Drive sign-in failed (${res.status}).`)
  const t = (await res.json()) as { access_token: string; expires_in?: number }
  driveToken = { value: t.access_token, expires: Date.now() + ((t.expires_in ?? 3600) - 60) * 1000 }
  return t.access_token
}

/** Forgets the Drive connection; with revoke, also tells Google to drop the grant. */
export function disconnectDrive(revoke = true): void {
  const refresh = getSecret('gdrive')
  if (revoke && refresh) void fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: 'POST' }).catch(() => {})
  setSecret('gdrive', '')
  setSetting('gdrive:account', '')
  driveToken = null
}

/** The page the browser shows after Google sends the user back. */
function page(ok: boolean): string {
  const title = ok ? 'You are signed in' : 'Sign-in did not finish'
  const body = ok ? 'You can close this tab and go back to Tyslin Studio.' : 'Close this tab and try again from Tyslin Studio.'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Tyslin Studio · ${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#FAFAF7;color:#0F0F0D;font:16px/1.5 system-ui,sans-serif}
main{background:#fff;border:1px solid #E4E4DD;border-radius:16px;padding:32px 36px;max-width:420px}
h1{font-size:22px;margin:0 0 8px}p{margin:0;color:#5C5C57}.tag{font:12px ui-monospace,monospace;letter-spacing:.08em;color:#4A7000;margin-bottom:12px}</style>
</head><body><main><div class="tag">TYSLIN STUDIO</div><h1>${title}</h1><p>${body}</p></main></body></html>`
}
