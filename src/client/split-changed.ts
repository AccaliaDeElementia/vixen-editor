'use sanity'

const SPLIT_CHANGED = 'vixen:split-changed'
const SPLIT_DISMISS_REQUESTED = 'vixen:split-dismiss-requested'

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

interface DismissListener {
  offSplitDismissRequested: () => void
}

export function requestSplitDismissed(root: ParentNode): void {
  root.dispatchEvent(new Event(SPLIT_DISMISS_REQUESTED, { bubbles: true }))
}

export function onSplitDismissRequested(root: ParentNode, handle: () => void): DismissListener {
  const hear = (): void => {
    handle()
  }

  root.addEventListener(SPLIT_DISMISS_REQUESTED, hear)

  return {
    offSplitDismissRequested: () => {
      root.removeEventListener(SPLIT_DISMISS_REQUESTED, hear)
    },
  }
}

export const TestOnly = { SPLIT_CHANGED, SPLIT_DISMISS_REQUESTED }
