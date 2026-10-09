'use sanity'

import { createSignal } from './channel.ts'

const TRASH_EMPTIED = 'vixen:trash-emptied'
const emptied = createSignal(TRASH_EMPTIED)

interface TrashEmptiedListener {
  offTrashEmptied: () => void
}

export function announceTrashEmptied(root: ParentNode): void {
  emptied.raiseFrom(root)
}

export function onTrashEmptied(root: ParentNode, handle: () => void): TrashEmptiedListener {
  return { offTrashEmptied: emptied.listen(root, handle) }
}

export const TestOnly = { TRASH_EMPTIED }
