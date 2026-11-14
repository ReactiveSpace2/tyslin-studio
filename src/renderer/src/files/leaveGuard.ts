/**
 * The active editor (Files or agency Memory) registers a guard for unsaved changes.
 * App.tsx awaits `confirmLeave()` before changing routes, including agency tabs.
 */
let guard: (() => Promise<boolean>) | null = null

export function setLeaveGuard(g: (() => Promise<boolean>) | null): void { guard = g }
export function confirmLeave(): Promise<boolean> { return guard ? guard() : Promise.resolve(true) }
