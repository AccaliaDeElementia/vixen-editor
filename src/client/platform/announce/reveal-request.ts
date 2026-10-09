'use sanity'

const REVEAL_REQUESTED = 'vixen:reveal-entry'

class RevealRequestedEvent extends Event {
  readonly entryPath: string

  constructor(entryPath: string) {
    super(REVEAL_REQUESTED)
    this.entryPath = entryPath
  }
}

export function requestReveal(root: ParentNode, entryPath: string): void {
  root.dispatchEvent(new RevealRequestedEvent(entryPath))
}

interface RevealListener {
  offRevealRequested: () => void
}

export function onRevealRequested(root: ParentNode, handle: (entryPath: string) => void): RevealListener {
  const hear = (event: Event): void => {
    if (event instanceof RevealRequestedEvent) handle(event.entryPath)
  }

  root.addEventListener(REVEAL_REQUESTED, hear)

  return {
    offRevealRequested: () => {
      root.removeEventListener(REVEAL_REQUESTED, hear)
    },
  }
}

export const TestOnly = { REVEAL_REQUESTED }
