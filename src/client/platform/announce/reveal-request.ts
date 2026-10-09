'use sanity'

import { createChannel } from './channel.ts'

const REVEAL_REQUESTED = 'vixen:reveal-entry'
const reveals = createChannel<string>(REVEAL_REQUESTED)

interface RevealListener {
  offRevealRequested: () => void
}

export function requestReveal(root: ParentNode, entryPath: string): void {
  reveals.announceAt(root, entryPath)
}

export function onRevealRequested(root: ParentNode, handle: (entryPath: string) => void): RevealListener {
  return { offRevealRequested: reveals.listen(root, handle) }
}

export const TestOnly = { REVEAL_REQUESTED }
