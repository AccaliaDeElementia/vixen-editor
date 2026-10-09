'use sanity'

import { createChannel } from './channel.ts'

const INSERT_REQUESTED = 'vixen:insert-entry'
const insertions = createChannel<string>(INSERT_REQUESTED)

interface InsertListener {
  offInsertRequested: () => void
}

export function requestInsert(target: EventTarget, entryPath: string): void {
  insertions.raiseFrom(target, entryPath)
}

export function onInsertRequested(root: ParentNode, handle: (entryPath: string) => void): InsertListener {
  return { offInsertRequested: insertions.listen(root, handle) }
}
