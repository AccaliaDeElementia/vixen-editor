'use sanity'

import { createChannel } from './channel.ts'

const ENTRY_TRASHED = 'vixen:entry-trashed'

export interface TrashedEntry {
  entryPath: string
  trashId: string
}

const trashings = createChannel<TrashedEntry>(ENTRY_TRASHED)

interface TrashedListener {
  offEntryTrashed: () => void
}

export function announceEntryTrashed(root: ParentNode, trashed: TrashedEntry): void {
  trashings.announceAt(root, trashed)
}

export function onEntryTrashed(root: ParentNode, handle: (trashed: TrashedEntry) => void): TrashedListener {
  return { offEntryTrashed: trashings.listen(root, handle) }
}

export const TestOnly = { ENTRY_TRASHED }
