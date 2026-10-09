'use sanity'

import { createSignal } from './channel.ts'

const STORE_CHANGED = 'vixen:store-changed'
const changes = createSignal(STORE_CHANGED)

interface StoreListener {
  offStoreChanged: () => void
}

export function announceStoreChanged(root: ParentNode): void {
  changes.announceAt(root)
}

export function onStoreChanged(root: ParentNode, handle: () => void): StoreListener {
  return { offStoreChanged: changes.listen(root, handle) }
}
