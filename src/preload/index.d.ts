import type { TyslinApi } from '../shared/types'

declare global {
  interface Window {
    tyslin: TyslinApi
  }
}

export {}
