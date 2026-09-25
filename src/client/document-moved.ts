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

export function onDocumentMoved(root: ParentNode, handle: (moved: DocumentMoved) => void): void {
  root.addEventListener(DOCUMENT_MOVED, (event) => {
    if (event instanceof DocumentMovedEvent) handle(event.moved)
  })
}

export const TestOnly = { DOCUMENT_MOVED }
