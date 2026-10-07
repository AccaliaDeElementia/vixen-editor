'use sanity'

const SPLIT_CHANGED = 'vixen:split-changed'

interface SplitChangedListener {
  offSplitChanged: () => void
}

export function announceSplitChanged(root: ParentNode): void {
  root.dispatchEvent(new Event(SPLIT_CHANGED, { bubbles: true }))
}

export function onSplitChanged(root: ParentNode, handle: () => void): SplitChangedListener {
  const hear = (): void => {
    handle()
  }

  root.addEventListener(SPLIT_CHANGED, hear)

  return {
    offSplitChanged: () => {
      root.removeEventListener(SPLIT_CHANGED, hear)
    },
  }
}

export const TestOnly = { SPLIT_CHANGED }
