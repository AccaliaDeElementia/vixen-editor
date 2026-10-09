'use sanity'

const DELETION_PENDING = 'vixen:deletion-pending'

class DeletionPendingEvent extends Event {
  readonly entryPath: string
  readonly settling: Array<Promise<void>> = []

  constructor(entryPath: string) {
    super(DELETION_PENDING)
    this.entryPath = entryPath
  }
}

export async function settleBeforeDeleting(root: ParentNode, entryPath: string): Promise<void> {
  const pending = new DeletionPendingEvent(entryPath)
  root.dispatchEvent(pending)

  await Promise.allSettled(pending.settling)
}

interface DeletionListener {
  offDeletionPending: () => void
}

export function onDeletionPending(root: ParentNode, handle: (entryPath: string) => Promise<void>): DeletionListener {
  const hear = (event: Event): void => {
    if (event instanceof DeletionPendingEvent) event.settling.push(handle(event.entryPath))
  }

  root.addEventListener(DELETION_PENDING, hear)

  return {
    offDeletionPending: () => {
      root.removeEventListener(DELETION_PENDING, hear)
    },
  }
}

export const TestOnly = { DELETION_PENDING }
