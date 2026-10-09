'use sanity'

const STORE_CHANGED = 'vixen:store-changed'

export function announceStoreChanged(root: ParentNode): void {
  root.dispatchEvent(new Event(STORE_CHANGED))
}

interface StoreListener {
  offStoreChanged: () => void
}

export function onStoreChanged(root: ParentNode, handle: () => void): StoreListener {
  root.addEventListener(STORE_CHANGED, handle)

  return {
    offStoreChanged: () => {
      root.removeEventListener(STORE_CHANGED, handle)
    },
  }
}
