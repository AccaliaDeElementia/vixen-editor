'use sanity'

const ENTRY_TRASHED = 'vixen:entry-trashed'

export interface TrashedEntry {
  entryPath: string
  trashId: string
}

class EntryTrashedEvent extends Event {
  readonly trashed: TrashedEntry

  constructor(trashed: TrashedEntry) {
    super(ENTRY_TRASHED)
    this.trashed = trashed
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

export const TestOnly = { ENTRY_TRASHED }
