'use sanity'

import { errorMessage } from '../error-message.ts'
import type { Toast } from '../layout/toast.ts'

type OnceRebuilt = () => void

interface Rebuilding {
  refresh: () => Promise<void>
  toast: Toast
}

export function rebuildingRunner(context: Rebuilding): (work: () => Promise<OnceRebuilt | undefined>) => void {
  return (work) => {
    void (async () => {
      try {
        const after = await work()
        await context.refresh()
        after?.()
      } catch (error) {
        context.toast.error(errorMessage(error))
      }
    })()
  }
}
