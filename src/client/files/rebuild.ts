'use sanity'

import { errorMessage } from '../error-message.ts'
import type { Toast } from '../layout/toast.ts'

type OnceRebuilt = () => void

interface Rebuilding {
  refresh: () => Promise<void>
  toast: Toast
  track: (rebuild: Promise<void>) => void
}

interface Runs {
  track: (rebuild: Promise<void>) => void
  settled: () => Promise<void>
}

export function collectRuns(): Runs {
  const inFlight = new Set<Promise<void>>()

  return {
    track: (rebuild: Promise<void>) => {
      inFlight.add(rebuild)
      void rebuild.finally(() => {
        inFlight.delete(rebuild)
      })
    },
    settled: async () => {
      await Promise.all([...inFlight])
    },
  }
}

export function rebuildingRunner(context: Rebuilding): (work: () => Promise<OnceRebuilt | undefined>) => void {
  return (work) => {
    context.track(
      (async () => {
        try {
          const after = await work()
          await context.refresh()
          after?.()
        } catch (error) {
          context.toast.error(errorMessage(error))
        }
      })(),
    )
  }
}
