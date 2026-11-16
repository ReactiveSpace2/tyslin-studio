// Stand-in for src/main/db.ts in tests: settings in a Map tests can read and change (globalThis.__tyslinSettings).
const g = globalThis as unknown as { __tyslinSettings?: Map<string, string> }
export const settings: Map<string, string> = (g.__tyslinSettings ??= new Map())

export const getSetting = (key: string): string | null => settings.get(key) ?? null
export const setSetting = (key: string, value: string): void => { settings.set(key, value) }
