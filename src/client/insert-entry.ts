'use sanity'

const INSERT_REQUESTED = 'vixen:insert-entry'

class InsertRequestedEvent extends Event {
  readonly entryPath: string

  constructor(entryPath: string) {
    super(INSERT_REQUESTED, { bubbles: true })
    this.entryPath = entryPath
  }
}

export function requestInsert(target: EventTarget, entryPath: string): void {
  target.dispatchEvent(new InsertRequestedEvent(entryPath))
}

interface InsertListener {
  offInsertRequested: () => void
}

export function onInsertRequested(root: ParentNode, handle: (entryPath: string) => void): InsertListener {
  const hear = (event: Event): void => {
    if (event instanceof InsertRequestedEvent) handle(event.entryPath)
  }

  root.addEventListener(INSERT_REQUESTED, hear)

  return {
    offInsertRequested: () => {
      root.removeEventListener(INSERT_REQUESTED, hear)
    },
  }
}
