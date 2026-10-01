'use sanity'

import { cast } from './cast.ts'

type Reason = unknown
type Listener = (reason: Reason) => void

interface RejectionSource {
  on: (event: 'unhandledRejection', listener: Listener) => void
  off: (event: 'unhandledRejection', listener: Listener) => void
}

async function afterTheRuntimeWouldHaveReported(): Promise<void> {
  const reported: PromiseWithResolvers<void> = Promise.withResolvers()

  setTimeout(reported.resolve)

  await reported.promise
}

export async function looseRejectionsDuring(work: () => Promise<void>): Promise<Reason[]> {
  const loose: Reason[] = []
  const record = (reason: Reason): void => {
    loose.push(reason)
  }

  const source = cast<RejectionSource>(Reflect.get(globalThis, 'process'))
  source.on('unhandledRejection', record)
  try {
    await work()
    await afterTheRuntimeWouldHaveReported()
  } finally {
    source.off('unhandledRejection', record)
  }

  return loose
}
