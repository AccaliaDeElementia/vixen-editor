'use sanity'

import { createLogger } from './logging.ts'

const logRefused = createLogger('changes', 'refusedListener')

interface PathChanged {
  kind: 'written' | 'removed'
  path: string
}

interface PathMoved {
  kind: 'moved'
  from: string
  to: string
}

export type StoreChange = PathChanged | PathMoved

type Hear = (change: StoreChange) => void

export interface Changes {
  announce: (change: StoreChange) => void
  listen: (hear: Hear) => () => void
}

export function createChanges(): Changes {
  const listeners = new Set<Hear>()

  return {
    announce(change: StoreChange): void {
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
