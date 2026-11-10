/**
 * Leaving the Files screen with unsaved tabs asks first. FilesPage registers a guard while it has unsaved edits;
 * App.tsx awaits `confirmLeave()` before it changes the route away from Files.
 */
let guard: (() => Promise<boolean>) | null = null

export function setLeaveGuard(g: (() => Promise<boolean>) | null): void { guard = g }
export function confirmLeave(): Promise<boolean> { return guard ? guard() : Promise.resolve(true) }
