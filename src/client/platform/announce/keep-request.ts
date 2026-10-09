'use sanity'

import { createChannel } from './channel.ts'

const KEEP_REQUESTED = 'vixen:keep-requested'
const keeps = createChannel<string>(KEEP_REQUESTED)

interface KeepListener {
  offKeepRequested: () => void
}

export function requestKeep(root: ParentNode, entryPath: string): void {
  keeps.raiseFrom(root, entryPath)
}

export function onKeepRequested(root: ParentNode, handle: (entryPath: string) => void): KeepListener {
  return { offKeepRequested: keeps.listen(root, handle) }
}

export const TestOnly = { KEEP_REQUESTED }
