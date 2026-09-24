'use sanity'

import { describe, expect, it, vi } from 'vitest'

import {
  announceDocumentMoved,
  onDocumentMoved,
  type DocumentMoved,
  TestOnly,
} from '../../src/client/document-moved.ts'

const { DOCUMENT_MOVED } = TestOnly

function detail(overrides: Partial<DocumentMoved> = {}): DocumentMoved {
  return { from: 'notes.md', to: 'archive/notes.md', rewritten: [], ...overrides }
}

describe('the document-moved channel', () => {
  it('delivers the move to a listener on the same root', () => {
    const root = document.createElement('div')
    const heard = vi.fn()
    onDocumentMoved(root, (moved) => {
      heard(moved)
    })

    announceDocumentMoved(root, detail())

    expect(heard).toHaveBeenCalledWith(detail())
  })

  it('carries the documents whose content was repaired', () => {
    const root = document.createElement('div')
    const heard = vi.fn()
    onDocumentMoved(root, (moved) => {
      heard(moved)
    })

    announceDocumentMoved(root, detail({ rewritten: ['other.md'] }))

    expect(heard.mock.calls[0]?.[0]).toHaveProperty('rewritten', ['other.md'])
  })

  it('does not reach a listener on a different root', () => {
    const heard = vi.fn()
    onDocumentMoved(document.createElement('div'), (moved) => {
      heard(moved)
    })

    announceDocumentMoved(document.createElement('div'), detail())

    expect(heard).not.toHaveBeenCalled()
  })

  // The name is a string in a shared DOM, so anything may dispatch it. The
  // listener narrows on the class rather than trusting a `detail` property,
  // which is what lets it ignore a same-named event without asserting.
  it('ignores an event that merely shares the name', () => {
    const root = document.createElement('div')
    const heard = vi.fn()
    onDocumentMoved(root, (moved) => {
      heard(moved)
    })

    root.dispatchEvent(new Event(DOCUMENT_MOVED))

    expect(heard).not.toHaveBeenCalled()
  })
})
