'use sanity'

import { describe, expect, it, vi } from 'vitest'

import { cast } from '../cast.ts'

import { guardUnload } from '../../src/client/editor/unload.ts'

interface Guarded {
  leave: () => BeforeUnloadEvent
  rescue: ReturnType<typeof vi.fn<() => void>>
}

function guarding(unsaved: () => boolean): Guarded {
  let handler: (event: BeforeUnloadEvent) => void = () => undefined
  const rescue = vi.fn<() => void>()

  guardUnload({
    unsaved,
    rescue,
    listen: (registered) => {
      handler = registered
    },
  })

  return {
    rescue,
    leave: () => {
      const event = cast<BeforeUnloadEvent>(new Event('beforeunload', { cancelable: true }))
      handler(event)

      return event
    },
  }
}

describe('a buffer with unsaved changes', () => {
  it('asks the browser for the leave-site prompt', () => {
    expect(guarding(() => true).leave().defaultPrevented).toBe(true)
  })

  it('attempts the best-effort save on the way out', () => {
    const guarded = guarding(() => true)

    guarded.leave()

    expect(guarded.rescue).toHaveBeenCalledTimes(1)
  })
})

describe('a buffer with nothing to save', () => {
  it('leaves without a prompt', () => {
    expect(guarding(() => false).leave().defaultPrevented).toBe(false)
  })

  it('sends nothing, because there is nothing to send', () => {
    const guarded = guarding(() => false)

    guarded.leave()

    expect(guarded.rescue).not.toHaveBeenCalled()
  })
})

describe('the default listener', () => {
  it('registers on the window, which is the only target beforeunload reaches', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener')

    try {
      guardUnload({ unsaved: () => false, rescue: () => undefined })

      expect(addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    } finally {
      addEventListener.mockRestore()
    }
  })
})
