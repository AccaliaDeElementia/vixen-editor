'use sanity'

import { describe, expect, it, vi } from 'vitest'

import { announceStoreChanged, onStoreChanged } from '../../src/client/store-changed.ts'

function host(): HTMLElement {
  const element = document.createElement('div')
  document.body.append(element)

  return element
}

describe('the store-changed channel', () => {
  it('tells a listener on the same root that the store moved on', () => {
    const root = host()
    const handle = vi.fn<() => void>()
    onStoreChanged(root, handle)

    announceStoreChanged(root)

    expect(handle).toHaveBeenCalledTimes(1)
  })

  it('does not reach a listener on a different root', () => {
    const handle = vi.fn<() => void>()
    onStoreChanged(host(), handle)

    announceStoreChanged(host())

    expect(handle).not.toHaveBeenCalled()
  })

  it('stops telling it once the listener is released', () => {
    const root = host()
    const handle = vi.fn<() => void>()
    const { offStoreChanged } = onStoreChanged(root, handle)

    offStoreChanged()
    announceStoreChanged(root)

    expect(handle).not.toHaveBeenCalled()
  })
})
