'use sanity'

import { describe, expect, it } from 'vitest'

import { given } from './conditions.ts'
import { dropPendingTimeouts, failOnLeakedInterval } from './timers.ts'

const SOME_PERIOD_MS = 60_000

describe('the leaked-interval guard', () => {
  it('refuses a test that left a repeating timer standing', () => {
    setInterval(() => undefined, SOME_PERIOD_MS)

    expect(() => {
      failOnLeakedInterval()
    }).toThrow(/repeating timer still scheduled/v)
  })

  it('passes a test that scheduled nothing', () => {
    expect(() => {
      failOnLeakedInterval()
    }).not.toThrow()
  })

  it('cancels what it found, so one leak does not fail every test after it', () => {
    setInterval(() => undefined, SOME_PERIOD_MS)
    given(() => {
      expect(() => {
        failOnLeakedInterval()
      }).toThrow()
    })

    expect(() => {
      failOnLeakedInterval()
    }).not.toThrow()
  })

  it('counts a timer it was handed back to cancel as no longer standing', () => {
    clearInterval(setInterval(() => undefined, SOME_PERIOD_MS))

    expect(() => {
      failOnLeakedInterval()
    }).not.toThrow()
  })
})

describe('a timeout the test walked away from', () => {
  const TICK_MS = 20

  async function afterARealTick(): Promise<void> {
    const ticked: PromiseWithResolvers<void> = Promise.withResolvers()
    setTimeout(() => {
      ticked.resolve()
    }, TICK_MS)

    await ticked.promise
  }

  it('fires when nothing cancels it, which is what makes the next claim mean anything', async () => {
    let fired = false
    setTimeout(() => {
      fired = true
    }, 0)

    await afterARealTick()

    expect(fired).toBe(true)
  })

  it('does not fire once the test that scheduled it has ended', async () => {
    let fired = false
    setTimeout(() => {
      fired = true
    }, 0)

    dropPendingTimeouts()
    await afterARealTick()

    expect(fired).toBe(false)
  })

  it('leaves a timer alone that was scheduled after the sweep', async () => {
    dropPendingTimeouts()
    let fired = false
    setTimeout(() => {
      fired = true
    }, 0)

    await afterARealTick()

    expect(fired).toBe(true)
  })

  it('is untroubled by a timer the code already cancelled itself', () => {
    clearTimeout(setTimeout(() => undefined, TICK_MS))

    expect(() => {
      dropPendingTimeouts()
    }).not.toThrow()
  })
})
