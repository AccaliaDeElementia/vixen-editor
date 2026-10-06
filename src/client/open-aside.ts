'use sanity'

const OPEN_ASIDE_REQUESTED = 'vixen:open-aside-requested'

class OpenAsideRequestedEvent extends Event {
  readonly entryPath: string

  constructor(entryPath: string) {
    super(OPEN_ASIDE_REQUESTED, { bubbles: true })
    this.entryPath = entryPath
  }
}

interface OpenAsideListener {
  offOpenAsideRequested: () => void
}

export function requestOpenAside(root: ParentNode, entryPath: string): void {
  root.dispatchEvent(new OpenAsideRequestedEvent(entryPath))
}

export function onOpenAsideRequested(root: ParentNode, handle: (entryPath: string) => void): OpenAsideListener {
  const hear = (event: Event): void => {
    if (event instanceof OpenAsideRequestedEvent) handle(event.entryPath)
  }

  root.addEventListener(OPEN_ASIDE_REQUESTED, hear)

  return {
    offOpenAsideRequested: () => {
      root.removeEventListener(OPEN_ASIDE_REQUESTED, hear)
    },
  }
}

export const TestOnly = { OPEN_ASIDE_REQUESTED }
