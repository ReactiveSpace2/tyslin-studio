import { useEffect, useState } from 'react'

let known: boolean | null = null

/** Whether LibreOffice is installed (asked once per window; null while asking). `recheck` asks again after an install. */
export function useOffice(): { available: boolean | null; recheck: () => void } {
  const [available, setAvailable] = useState<boolean | null>(known)
  const ask = (): void => { void window.tyslin.preview.office().then((s) => { known = s.available; setAvailable(s.available) }).catch(() => setAvailable(false)) }
  useEffect(() => { if (known === null) ask() }, [])
  return { available, recheck: ask }
}
