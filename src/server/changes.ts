'use sanity'

import type { StoreChange } from '../shared/store-change.ts'
import { createLogger } from './logging.ts'

const logRefused = createLogger('changes', 'refusedListener')

export type { StoreChange }

type Hear = (change: StoreChange) => void

export interface Changes {
  announce: (change: StoreChange) => void
  listen: (hear: Hear) => () => void
  lastAnnouncedAt: () => number
}

export function createChanges(now: () => number = Date.now): Changes {
  const listeners = new Set<Hear>()
  let announcedAt = now()

  return {
    lastAnnouncedAt: () => announcedAt,

    announce(change: StoreChange): void {
      announcedAt = now()
      for (const hear of [...listeners]) {
        try {
          hear(change)
        } catch (error) {
          logRefused('%s: %O', change.kind, error)
        }
      }
    },

    listen(hear: Hear): () => void {
      listeners.add(hear)

      return () => {
        listeners.delete(hear)
      }
    },
  }
}
