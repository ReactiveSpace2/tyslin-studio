import { safeStorage } from 'electron'
import { getSetting, setSetting } from './db'

// API keys are encrypted with the OS keychain (safeStorage) before they touch the database.
export function setSecret(name: string, value: string): void {
  if (!value) {
    setSetting(`secret:${name}`, '')
    return
  }
  const enc = safeStorage.isEncryptionAvailable()
    ? 'enc:' + safeStorage.encryptString(value).toString('base64')
    : 'plain:' + value
  setSetting(`secret:${name}`, enc)
}

export function getSecret(name: string): string | null {
  const raw = getSetting(`secret:${name}`)
  if (!raw) return null
  // A key encrypted under another OS keychain (a copied data folder, a reset keyring) can't be decrypted:
  // treat it as missing so Settings and agent statuses keep working and the user can enter it again.
  if (raw.startsWith('enc:')) {
    try { return safeStorage.decryptString(Buffer.from(raw.slice(4), 'base64')) } catch { return null }
  }
  if (raw.startsWith('plain:')) return raw.slice(6)
  return null
}
