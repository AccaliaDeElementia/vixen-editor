'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { onKeepRequested, requestKeep, TestOnly } from '../../src/client/keep-request.ts'

const { KEEP_REQUESTED } = TestOnly

let root: HTMLElement = document.createElement('div')

beforeEach(() => {
  document.body.innerHTML = ''
  root = document.createElement('div')
  document.body.append(root)
})

describe('asking for a tab to be kept', () => {
  it('tells the listener which entry', () => {
    const heard: string[] = []
    onKeepRequested(root, (entryPath) => {
      heard.push(entryPath)
    })

    requestKeep(root, 'journal/a.md')

    expect(heard).toStrictEqual(['journal/a.md'])
  })

  it('reaches a listener above where it was raised, so the tree need not know the editor', () => {
    const heard: string[] = []
    onKeepRequested(root, (entryPath) => {
      heard.push(entryPath)
    })
    const inner = document.createElement('div')
    root.append(inner)

    requestKeep(inner, 'journal/a.md')

    expect(heard).toStrictEqual(['journal/a.md'])
  })

  it('stops being heard once the listener is released', () => {
    const heard: string[] = []
    const { offKeepRequested } = onKeepRequested(root, (entryPath) => {
      heard.push(entryPath)
    })

    offKeepRequested()
    requestKeep(root, 'journal/a.md')

    expect(heard).toStrictEqual([])
  })

  it('is not mistaken for a bare event of the same name', () => {
    const handle = vi.fn<(entryPath: string) => void>()
    onKeepRequested(root, handle)

    root.dispatchEvent(new Event(KEEP_REQUESTED))

    expect(handle).not.toHaveBeenCalled()
  })
})
