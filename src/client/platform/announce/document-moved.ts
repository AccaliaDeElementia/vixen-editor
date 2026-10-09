'use sanity'

import type { EntryMove } from '../doc-path.ts'
import { createChannel } from './channel.ts'

const DOCUMENT_MOVED = 'vixen:document-moved'

export interface DocumentMoved extends EntryMove {
  rewritten: readonly string[]
}

const moves = createChannel<DocumentMoved>(DOCUMENT_MOVED)

interface MoveListener {
  offDocumentMoved: () => void
}

export function announceDocumentMoved(root: ParentNode, moved: DocumentMoved): void {
  moves.announceAt(root, moved)
}

export function onDocumentMoved(root: ParentNode, handle: (moved: DocumentMoved) => void): MoveListener {
  return { offDocumentMoved: moves.listen(root, handle) }
}

export const TestOnly = { DOCUMENT_MOVED }
