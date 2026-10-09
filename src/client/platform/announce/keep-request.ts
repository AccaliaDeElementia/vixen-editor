'use sanity'

const KEEP_REQUESTED = 'vixen:keep-requested'

class KeepRequestedEvent extends Event {
  readonly entryPath: string

  constructor(entryPath: string) {
    super(KEEP_REQUESTED, { bubbles: true })
    this.entryPath = entryPath
  }
}

interface KeepListener {
  offKeepRequested: () => void
}

export function requestKeep(root: ParentNode, entryPath: string): void {
  root.dispatchEvent(new KeepRequestedEvent(entryPath))
}

export function onKeepRequested(root: ParentNode, handle: (entryPath: string) => void): KeepListener {
  const hear = (event: Event): void => {
    if (event instanceof KeepRequestedEvent) handle(event.entryPath)
  }

  root.addEventListener(KEEP_REQUESTED, hear)

  return {
    offKeepRequested: () => {
      root.removeEventListener(KEEP_REQUESTED, hear)
    },
  }
}

export const TestOnly = { KEEP_REQUESTED }
