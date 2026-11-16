// Stand-in for Electron in tests: userData is a temp folder the test sets in TYSLIN_TEST_USERDATA.
import { tmpdir } from 'os'

export const app = {
  getPath: (_name: string): string => process.env.TYSLIN_TEST_USERDATA || tmpdir(),
  getVersion: (): string => '0.0.0-test'
}
export const safeStorage = { isEncryptionAvailable: (): boolean => false }
export const dialog = {}
export const shell = {}
export type BrowserWindow = unknown
