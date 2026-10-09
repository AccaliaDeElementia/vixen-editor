'use sanity'

import { createChannel } from './channel.ts'

const OPEN_ASIDE_REQUESTED = 'vixen:open-aside-requested'
const asides = createChannel<string>(OPEN_ASIDE_REQUESTED)

interface OpenAsideListener {
  offOpenAsideRequested: () => void
}

export function requestOpenAside(root: ParentNode, entryPath: string): void {
  asides.raiseFrom(root, entryPath)
}

export function onOpenAsideRequested(root: ParentNode, handle: (entryPath: string) => void): OpenAsideListener {
  return { offOpenAsideRequested: asides.listen(root, handle) }
}

export const TestOnly = { OPEN_ASIDE_REQUESTED }
