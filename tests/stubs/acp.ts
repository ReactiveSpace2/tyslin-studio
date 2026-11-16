// Stand-in for src/main/acp.ts in tests: authenticateAcp hands its launch to globalThis.__tyslinAuthenticate,
// so a test can see exactly how a sign-in would have started (no adapter process, no browser).
export interface AcpLaunch { command: string; args: string[]; cwd: string; env?: NodeJS.ProcessEnv; authMethodId?: string }

type Hook = (launch: AcpLaunch, methodId: string) => void | Promise<void>
const g = globalThis as unknown as { __tyslinAuthenticate?: Hook }

export async function authenticateAcp(_name: string, launch: AcpLaunch, methodId: string): Promise<void> {
  await g.__tyslinAuthenticate?.(launch, methodId)
}
