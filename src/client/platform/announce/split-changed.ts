'use sanity'

import { createSignal } from './channel.ts'

const SPLIT_CHANGED = 'vixen:split-changed'
const SPLIT_DISMISS_REQUESTED = 'vixen:split-dismiss-requested'

const splits = createSignal(SPLIT_CHANGED)
const dismissals = createSignal(SPLIT_DISMISS_REQUESTED)

interface SplitChangedListener {
  offSplitChanged: () => void
}

export function announceSplitChanged(root: ParentNode): void {
  splits.raiseFrom(root)
}

export function onSplitChanged(root: ParentNode, handle: () => void): SplitChangedListener {
  return { offSplitChanged: splits.listen(root, handle) }
}

interface DismissListener {
  offSplitDismissRequested: () => void
}

export function requestSplitDismissed(root: ParentNode): void {
  dismissals.raiseFrom(root)
}

export function onSplitDismissRequested(root: ParentNode, handle: () => void): DismissListener {
  return { offSplitDismissRequested: dismissals.listen(root, handle) }
}

export const TestOnly = { SPLIT_CHANGED, SPLIT_DISMISS_REQUESTED }
