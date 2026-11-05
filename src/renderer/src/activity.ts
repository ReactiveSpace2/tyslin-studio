import { useEffect, useState } from 'react'

/**
 * Background work started from a screen (skill pack installs, engine installs), so the status bar
 * can list it with everything else that is running. Agent replies and app updates come from their
 * own event streams and aren't tracked here.
 */
export interface Task {
  id: string
  title: string
  /** Latest step, e.g. the last line of installer output. */
  detail?: string
  startedAt: number
}

let tasks: Task[] = []
const listeners = new Set<(t: Task[]) => void>()
const emit = (): void => { for (const l of listeners) l(tasks) }

export function startTask(id: string, title: string): { update: (detail: string) => void; end: () => void } {
  tasks = [...tasks.filter((t) => t.id !== id), { id, title, startedAt: Date.now() }]
  emit()
  return {
    update: (detail) => {
      tasks = tasks.map((t) => (t.id === id ? { ...t, detail } : t))
      emit()
    },
    end: () => {
      tasks = tasks.filter((t) => t.id !== id)
      emit()
    }
  }
}

/** Runs `fn` as a tracked task and ends it however `fn` finishes. */
export async function track<T>(id: string, title: string, fn: () => Promise<T>): Promise<T> {
  const t = startTask(id, title)
  try {
    return await fn()
  } finally {
    t.end()
  }
}

export function useTasks(): Task[] {
  const [list, setList] = useState(tasks)
  useEffect(() => {
    listeners.add(setList)
    return () => { listeners.delete(setList) }
  }, [])
  return list
}

/** Updates a task's detail if it is running (used by streams that don't own the task). */
export function updateTask(id: string, detail: string): void {
  if (!tasks.some((t) => t.id === id)) return
  tasks = tasks.map((t) => (t.id === id ? { ...t, detail } : t))
  emit()
}
