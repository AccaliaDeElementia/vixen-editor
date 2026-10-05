'use sanity'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { watchFreshness } from '../../../src/client/editor/freshness.ts'

let checks = 0

let release: Array<() => void> = []

const LONGER_THAN_THE_OLD_POLL = 180_000

function watching(options: { listen?: (wake: () => void) => () => void } = {}): () => void {
  const { unwatchFreshness } = watchFreshness({
    check: async () => {
      checks += 1
      await Promise.resolve()
    },
    ...options,
  })
  release.push(unwatchFreshness)

  return unwatchFreshness
}

beforeEach(() => {
  vi.useFakeTimers()
  release = []
  checks = 0
})

afterEach(() => {
  for (const stop of release) stop()
  vi.useRealTimers()
})

describe('what no longer happens on a timer', () => {
  it('asks nothing while nobody looks, because the server says when something changed', async () => {
    watching()

    await vi.advanceTimersByTimeAsync(LONGER_THAN_THE_OLD_POLL)

    expect(checks).toBe(0)
  })
})

describe('waking on focus', () => {
  it('asks immediately rather than waiting out the interval', async () => {
    let wake = (): void => undefined
    watching({
      listen: (registered) => {
        wake = registered

        return () => undefined
      },
    })

    wake()
    await vi.advanceTimersByTimeAsync(0)

    expect(checks).toBe(1)
  })

  it('does not start a second check while one is still running', async () => {
    let wake = (): void => undefined
    watching({
      listen: (registered) => {
        wake = registered

        return () => undefined
      },
    })

    wake()
    wake()
    wake()
    await vi.advanceTimersByTimeAsync(0)

    expect(checks).toBe(1)
  })

  it('asks again once the previous check has finished', async () => {
    let wake = (): void => undefined
    watching({
      listen: (registered) => {
        wake = registered

        return () => undefined
      },
    })

    wake()
    await vi.advanceTimersByTimeAsync(0)
    wake()
    await vi.advanceTimersByTimeAsync(0)

    expect(checks).toBe(2)
  })
})

describe('the default focus listener', () => {
  it('wakes when the window regains focus, which is when a change is most likely', async () => {
    watching()

    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)

    expect(checks).toBe(1)
  })

  it('wakes when the tab becomes visible, since background timers are throttled', async () => {
    watching()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })

    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)

    expect(checks).toBe(1)
  })

  it('stays quiet when the tab is being hidden rather than shown', async () => {
    watching()
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })

    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)

    expect(checks).toBe(0)
  })
})
