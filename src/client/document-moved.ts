'use sanity'

import type { EntryMove } from './doc-path.ts'

// The file tree and the editor are mounted independently and never see each
// other, so a move reaches the editor as an event on the shared root. The
// name and the shape live here once, because two copies of an event name
// fail silently: the listener simply never runs.
const DOCUMENT_MOVED = 'vixen:document-moved'

export interface DocumentMoved extends EntryMove {
  rewritten: readonly string[]
}

// A typed subclass rather than a CustomEvent, so the listener narrows with
// `instanceof` instead of asserting that `detail` is what it hoped for.
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
