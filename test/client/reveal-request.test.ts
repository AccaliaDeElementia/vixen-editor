'use sanity'

import { describe, expect, it, vi } from 'vitest'

import { onRevealRequested, requestReveal, TestOnly } from '../../src/client/reveal-request.ts'

const { REVEAL_REQUESTED } = TestOnly

function host(): HTMLElement {
  const element = document.createElement('div')
  document.body.append(element)

  return element
}

describe('asking the file browser to show something', () => {
  it('names the row to show', () => {
    const root = host()
    const shown: string[] = []
    onRevealRequested(root, (entryPath) => {
      shown.push(entryPath)
    })

    requestReveal(root, '.trash/abc-123')

    expect(shown).toStrictEqual(['.trash/abc-123'])
  })

  it('stops asking once the listener is released', () => {
    const root = host()
    const handle = vi.fn<(entryPath: string) => void>()
    const { offRevealRequested } = onRevealRequested(root, handle)

    offRevealRequested()
    requestReveal(root, '.trash/abc-123')

    expect(handle).not.toHaveBeenCalled()
  })

  it('is not confused by an event of the same name from somewhere else', () => {
    const root = host()
    const handle = vi.fn<(entryPath: string) => void>()
    onRevealRequested(root, handle)

    root.dispatchEvent(new Event(REVEAL_REQUESTED))

    expect(handle).not.toHaveBeenCalled()
  })
})
