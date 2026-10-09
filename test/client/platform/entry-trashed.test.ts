'use sanity'

import { describe, expect, it, vi } from 'vitest'

import {
  announceEntryTrashed,
  onEntryTrashed,
  TestOnly,
  type TrashedEntry,
} from '../../../src/client/platform/entry-trashed.ts'

const { ENTRY_TRASHED } = TestOnly

function host(): HTMLElement {
  const element = document.createElement('div')
  document.body.append(element)

  return element
}

describe('announcing that an entry was trashed', () => {
  it('carries the path and the entry it became', () => {
    const root = host()
    const heard: unknown[] = []
    onEntryTrashed(root, (trashed) => {
      heard.push(trashed)
    })

    announceEntryTrashed(root, { entryPath: 'journal/a.md', trashId: 'abc' })

    expect(heard).toStrictEqual([{ entryPath: 'journal/a.md', trashId: 'abc' }])
  })

  it('stops being heard once the listener is released', () => {
    const root = host()
    const handle = vi.fn<(trashed: TrashedEntry) => void>()
    const { offEntryTrashed } = onEntryTrashed(root, handle)

    offEntryTrashed()
    announceEntryTrashed(root, { entryPath: 'journal/a.md', trashId: 'abc' })

    expect(handle).not.toHaveBeenCalled()
  })
})

describe('an event of the same name from somewhere else', () => {
  it('is not mistaken for an entry being trashed', () => {
    const root = host()
    const handle = vi.fn<(trashed: TrashedEntry) => void>()
    onEntryTrashed(root, handle)

    root.dispatchEvent(new Event(ENTRY_TRASHED))

    expect(handle).not.toHaveBeenCalled()
  })
})
