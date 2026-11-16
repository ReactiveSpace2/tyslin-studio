// Stand-in for src/main/secrets.ts in tests: saved keys in a Map (globalThis.__tyslinSecrets).
const g = globalThis as unknown as { __tyslinSecrets?: Map<string, string> }
export const secrets: Map<string, string> = (g.__tyslinSecrets ??= new Map())

export const getSecret = (name: string): string | null => secrets.get(name) ?? null
