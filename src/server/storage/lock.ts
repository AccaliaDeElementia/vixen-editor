'use sanity'

export const DEFAULT_WRITE_LOCK_TIMEOUT_MS = 5000

export class LockTimeoutError extends Error {
  override readonly name = 'LockTimeoutError'

  constructor(timeoutMs: number) {
    super(`Timed out after ${timeoutMs}ms waiting for the write lock`)
  }
}

export interface WriteLock {
  run: <T>(operation: () => Promise<T>, timeoutMs?: number) => Promise<T>
}

interface Waiter {
  grant: () => void
  abandoned: boolean
}

export function createWriteLock(defaultTimeoutMs: number): WriteLock {
  const waiting: Waiter[] = []
  let held = false

  function release(): void {
    for (;;) {
      const next = waiting.shift()
      if (next === undefined) {
        held = false
        return
      }
      if (!next.abandoned) {
        next.grant()
        return
      }
    }
  }

  async function acquire(timeoutMs: number): Promise<void> {
    if (!held) {
      held = true
      return
    }

    /* eslint-disable-next-line promise/avoid-new -- a mutex waiter is settled by a
       later release() running in a different call frame, which is the one shape
       this rule cannot express through composition */
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiter.abandoned = true
        reject(new LockTimeoutError(timeoutMs))
      }, timeoutMs)

      const waiter: Waiter = {
        abandoned: false,
        grant: () => {
          clearTimeout(timer)
          resolve()
        },
      }

      waiting.push(waiter)
    })
  }

  return {
    async run<T>(operation: () => Promise<T>, timeoutMs = defaultTimeoutMs): Promise<T> {
      await acquire(timeoutMs)

      try {
        return await operation()
      } finally {
        release()
      }
    },
  }
}
