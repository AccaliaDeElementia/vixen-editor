'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { onOpenAsideRequested, requestOpenAside, TestOnly } from '../../src/client/open-aside.ts'

const { OPEN_ASIDE_REQUESTED } = TestOnly

let root: HTMLElement = document.createElement('div')

beforeEach(() => {
  root = document.createElement('div')
})

describe('asking for a document to open beside what is already open', () => {
  it('names the entry it wants opened', () => {
    const heard: string[] = []
    onOpenAsideRequested(root, (entryPath: string) => {
      heard.push(entryPath)
    })

    requestOpenAside(root, 'journal/a.md')

    expect(heard).toStrictEqual(['journal/a.md'])
  })

  it('stops being heard once the listener is released', () => {
    const handle = vi.fn<(entryPath: string) => void>()
    const { offOpenAsideRequested } = onOpenAsideRequested(root, handle)
    offOpenAsideRequested()

    requestOpenAside(root, 'journal/a.md')

    expect(handle).not.toHaveBeenCalled()
  })

  it('is not mistaken for a bare event of the same name', () => {
    const handle = vi.fn<(entryPath: string) => void>()
    onOpenAsideRequested(root, handle)

    root.dispatchEvent(new Event(OPEN_ASIDE_REQUESTED))

    expect(handle).not.toHaveBeenCalled()
  })
})
