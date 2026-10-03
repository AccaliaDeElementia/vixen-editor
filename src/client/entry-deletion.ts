'use sanity'

const DELETION_PENDING = 'vixen:deletion-pending'
const ENTRY_TRASHED = 'vixen:entry-trashed'

export interface TrashedEntry {
  entryPath: string
  trashId: string
}

class DeletionPendingEvent extends Event {
  readonly entryPath: string
  readonly settling: Array<Promise<void>> = []

  constructor(entryPath: string) {
    super(DELETION_PENDING)
    this.entryPath = entryPath
  }
}

class EntryTrashedEvent extends Event {
  readonly trashed: TrashedEntry

  constructor(trashed: TrashedEntry) {
    super(ENTRY_TRASHED)
    this.trashed = trashed
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

export function announceEntryTrashed(root: ParentNode, trashed: TrashedEntry): void {
  root.dispatchEvent(new EntryTrashedEvent(trashed))
}

interface TrashedListener {
  offEntryTrashed: () => void
}

export function onEntryTrashed(root: ParentNode, handle: (trashed: TrashedEntry) => void): TrashedListener {
  const hear = (event: Event): void => {
    if (event instanceof EntryTrashedEvent) handle(event.trashed)
  }

  root.addEventListener(ENTRY_TRASHED, hear)

  return {
    offEntryTrashed: () => {
      root.removeEventListener(ENTRY_TRASHED, hear)
    },
  }
}

export const TestOnly = { DELETION_PENDING, ENTRY_TRASHED }
