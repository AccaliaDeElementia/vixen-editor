'use sanity'

import type { EntryMove } from './doc-path.ts'

const DOCUMENT_MOVED = 'vixen:document-moved'

export interface DocumentMoved extends EntryMove {
  rewritten: readonly string[]
}

class DocumentMovedEvent extends Event {
  readonly moved: DocumentMoved

  constructor(moved: DocumentMoved) {
    super(DOCUMENT_MOVED)
    this.moved = moved
  }
}

export function announceDocumentMoved(root: ParentNode, moved: DocumentMoved): void {
  root.dispatchEvent(new DocumentMovedEvent(moved))
}

interface MoveListener {
  offDocumentMoved: () => void
}

export function onDocumentMoved(root: ParentNode, handle: (moved: DocumentMoved) => void): MoveListener {
  const hear = (event: Event): void => {
    if (event instanceof DocumentMovedEvent) handle(event.moved)
  }

  root.addEventListener(DOCUMENT_MOVED, hear)

  return {
    offDocumentMoved: () => {
      root.removeEventListener(DOCUMENT_MOVED, hear)
    },
  }
}

export const TestOnly = { DOCUMENT_MOVED }
